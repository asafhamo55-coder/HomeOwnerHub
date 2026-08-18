import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Shared, mutable Google-side state for the `completeConnect` block at the
 * bottom of this file. Declared with `vi.hoisted` because `vi.mock`
 * factories are hoisted above the imports and cannot close over ordinary
 * module-level bindings.
 */
const google = vi.hoisted(() => ({
  profileEmail: 'board@madisonpark.org',
  revoked: [] as string[],
}))

vi.mock('@homeowner-portal/mailbox', () => ({
  buildConsentUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth'),
  currentKeyVersion: vi.fn(() => 1),
  encryptToken: vi.fn((token: string) => `enc:${token}`),
  exchangeCode: vi.fn(async () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: '2026-08-12T01:00:00.000Z',
  })),
  GmailClient: class {
    async getProfile() {
      return { emailAddress: google.profileEmail, historyId: '9001' }
    }
    async listSendAs() {
      return []
    }
  },
  recommendScope: vi.fn(() => ({ scopeMode: 'address', scopeValue: google.profileEmail })),
  revokeToken: vi.fn(async (token: string) => {
    google.revoked.push(token)
  }),
}))

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => fakeDb(),
}))

import {
  completeConnect,
  DEFAULT_RETURN_TO,
  sanitizeReturnTo,
  signState,
  verifyState,
} from './connect'

/**
 * The same base the real redirect resolves against
 * (`new URL(sanitizeReturnTo(returnTo) + '?...', request.url)` in both
 * `apps/hoa/src/app/api/oauth/google/start/route.ts` and
 * `.../callback/route.ts`). Tests below reproduce that exact call shape
 * rather than asserting on what `sanitizeReturnTo` returns in isolation —
 * a value can look path-shaped as a string and still resolve off-origin
 * once parsed, which is exactly how the control-character bypass slipped
 * past the previous version of this function.
 */
const REDIRECT_BASE = 'https://app.example.com/api/oauth/google/callback'

// signState/verifyState only use MAILBOX_TOKEN_KEY as an HMAC key via
// node:crypto's createHmac, which accepts any string — unlike
// packages/mailbox/src/crypto.ts it does not require 32 raw bytes. A
// plain test string is enough to exercise the signing contract. This is
// never a real secret — it exists only in-process for the duration of
// this test file.
const TEST_KEY = 'unit-test-mailbox-token-key-do-not-use-in-prod'

function payload(over: Partial<{ orgId: string; userId: string; returnTo: string; issuedAt: number }> = {}) {
  return {
    orgId: 'org-1',
    userId: 'user-1',
    returnTo: '/settings/mailbox',
    issuedAt: Date.now(),
    ...over,
  }
}

describe('signState / verifyState', () => {
  beforeEach(() => {
    process.env.MAILBOX_TOKEN_KEY = TEST_KEY
  })

  it('round-trips: sign then verify returns the original payload', () => {
    const p = payload()
    const state = signState(p)
    expect(verifyState(state)).toEqual(p)
  })

  it('rejects a state with a tampered payload (flipped byte in the encoded body)', () => {
    const state = signState(payload())
    const [body, mac] = state.split('.')
    const bytes = Buffer.from(body, 'base64url')
    bytes[0] ^= 0xff
    const tampered = `${bytes.toString('base64url')}.${mac}`
    expect(() => verifyState(tampered)).toThrow(/signature mismatch/)
  })

  // NOTE on what this test does and doesn't prove: it asserts that a MAC
  // with one flipped byte is rejected — i.e. the comparison correctly
  // returns "not equal" for unequal inputs. A naive `mac === expected`
  // would reject this exact input too, so this assertion by itself does
  // NOT distinguish `verifyState`'s `timingSafeEqual` from a plain `===`.
  // Nothing a black-box `expect(...).toThrow()` assertion can observe
  // proves constant-time behaviour — that requires measuring execution
  // time across many inputs (or reading the implementation), not
  // asserting on a return value. The guarantee that this comparison
  // runs in constant time is enforced by code review of `verifyState`
  // (see the module-level comment in connect.ts), not by this test.
  it('rejects a state with a tampered MAC (does not prove constant-time comparison — see note above)', () => {
    const state = signState(payload())
    const [body, mac] = state.split('.')
    const macBytes = Buffer.from(mac, 'base64url')
    macBytes[0] ^= 0xff
    const tampered = `${body}.${macBytes.toString('base64url')}`
    expect(() => verifyState(tampered)).toThrow(/signature mismatch/)
  })

  it('rejects an expired state, with an error telling the user to start again', () => {
    const TEN_MINUTES_MS = 10 * 60 * 1000
    const stale = signState(payload({ issuedAt: Date.now() - TEN_MINUTES_MS - 1 }))
    expect(() => verifyState(stale)).toThrow(/start the connection again/)
  })

  it('accepts a state right at the edge of the TTL', () => {
    const p = payload({ issuedAt: Date.now() - 1000 })
    expect(verifyState(signState(p))).toEqual(p)
  })

  describe('malformed state — rejected cleanly, never an opaque crash', () => {
    it('rejects a state with no "." separator', () => {
      expect(() => verifyState('not-a-valid-state-at-all')).toThrow(/Malformed OAuth state/)
    })

    it('rejects a state with the wrong segment count', () => {
      expect(() => verifyState('one.two.three')).toThrow(/Malformed OAuth state/)
    })

    it('rejects an empty string', () => {
      expect(() => verifyState('')).toThrow(/Malformed OAuth state/)
    })

    it('rejects a state whose body is not valid base64url JSON', () => {
      // "not-json!!!" base64url-decodes to bytes that are not valid JSON.
      const body = Buffer.from('not-json!!!').toString('base64url')
      const mac = createHmac('sha256', TEST_KEY).update(body).digest('base64url')
      expect(() => verifyState(`${body}.${mac}`)).toThrow()
    })

    it('rejects a state missing the MAC segment', () => {
      expect(() => verifyState('somebody.')).toThrow(/Malformed OAuth state/)
    })
  })
})

describe('sanitizeReturnTo', () => {
  it('accepts a plain path', () => {
    expect(sanitizeReturnTo('/inbox')).toBe('/inbox')
  })

  it('accepts a nested path', () => {
    expect(sanitizeReturnTo('/settings/mailbox')).toBe('/settings/mailbox')
  })

  it('rejects an absolute URL to another host and falls back to the default', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a protocol-relative URL and falls back to the default', () => {
    expect(sanitizeReturnTo('//evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a backslash-prefixed form and falls back to the default', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a javascript: URL and falls back to the default', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/settings/mailbox')
  })

  it('rejects a value containing "://" anywhere, not just at the start', () => {
    expect(sanitizeReturnTo('/redirect?next=https://evil.com')).toBe('/settings/mailbox')
  })

  it('falls back to the default for null/undefined/empty', () => {
    expect(sanitizeReturnTo(null)).toBe('/settings/mailbox')
    expect(sanitizeReturnTo(undefined)).toBe('/settings/mailbox')
    expect(sanitizeReturnTo('')).toBe('/settings/mailbox')
  })

  it('rejects a value that does not start with a slash', () => {
    expect(sanitizeReturnTo('evil.com')).toBe('/settings/mailbox')
  })

  /**
   * The property that actually matters: does the value `sanitizeReturnTo`
   * hands back stay on this origin once it goes through the *exact* call
   * the real routes make — `new URL(sanitized + '?x=1', base)`? A string
   * can look path-shaped (single leading slash, no literal "//", no
   * literal "://") and still resolve to a different origin once the same
   * WHATWG parser Node's `URL`/`NextResponse.redirect` uses gets hold of
   * it — that gap is exactly how `/\t/evil.com` bypassed the previous
   * version of this function. Asserting on the parsed `origin`, not on
   * the shape of the returned string, is what would have caught that.
   */
  function resolvedOrigin(candidate: string | null | undefined): string {
    const sanitized = sanitizeReturnTo(candidate)
    return new URL(`${sanitized}?x=1`, REDIRECT_BASE).origin
  }

  const baseOrigin = new URL(REDIRECT_BASE).origin

  describe('accepted — origin is preserved end to end', () => {
    it.each([
      '/inbox',
      '/settings/mailbox',
      '/inbox?filter=open',
      '/a/b/c',
    ])('%s', (candidate) => {
      expect(sanitizeReturnTo(candidate)).toBe(candidate)
      expect(resolvedOrigin(candidate)).toBe(baseOrigin)
    })
  })

  describe('rejected — falls back to DEFAULT_RETURN_TO and origin never leaves this host', () => {
    it.each([
      // Absolute / protocol-relative / backslash forms.
      ['https://evil.com', 'absolute URL to another host'],
      ['HTTPS://evil.com', 'absolute URL, uppercase scheme'],
      ['//evil.com', 'protocol-relative'],
      ['/\\evil.com', 'backslash-prefixed'],
      ['\\\\evil.com', 'double-backslash-prefixed'],
      ['///evil.com', 'triple slash'],
      ['/\\/evil.com', 'slash-backslash-slash'],
      // Non-http(s) schemes.
      ['javascript:alert(1)', 'javascript: scheme'],
      ['java\tscript:alert(1)', 'javascript: scheme with an embedded tab'],
      // The confirmed control-character bypass, in all three stripped
      // characters, and in combination.
      ['/\t/evil.com', 'embedded tab — the confirmed bypass'],
      ['/\n/evil.com', 'embedded LF'],
      ['/\r/evil.com', 'embedded CR'],
      ['/\t\t//evil.com', 'double tab plus protocol-relative'],
      ['/\r\n/evil.com', 'CRLF combination'],
      // Query-string smuggling and non-slash-leading input.
      ['/redirect?next=https://evil.com', 'scheme smuggled into a query param'],
      [' /foo', 'leading whitespace before an otherwise-valid path'],
      ['\t//evil.com', 'leading tab before a protocol-relative form'],
      ['evil.com', 'no leading slash at all'],
    ])('%s (%s)', (candidate) => {
      expect(sanitizeReturnTo(candidate)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(candidate)).toBe(baseOrigin)
    })

    it('null', () => {
      expect(sanitizeReturnTo(null)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(null)).toBe(baseOrigin)
    })

    it('undefined', () => {
      expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(undefined)).toBe(baseOrigin)
    })

    it('empty string', () => {
      expect(sanitizeReturnTo('')).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin('')).toBe(baseOrigin)
    })
  })
})

/**
 * ────────────────────────────────────────────────────────────────────────
 * completeConnect — account-row reuse on reconnect
 *
 * Regression cover for the Madison Park duplicate import (2026-08-12): a
 * board member disconnected the Gmail mailbox and reconnected the SAME
 * address, the existing-account lookup only saw LIVE rows, and a second
 * mailbox_accounts row was inserted for the same (org, address). The OAuth
 * callback then backfilled the whole mailbox against the new row —
 * 437 duplicate messages, 229 duplicate threads.
 *
 * The tests below drive the real `completeConnect` against an in-memory
 * stand-in for the admin Supabase client, and assert on what it WROTE:
 * which row id it updated, whether `disconnected_at` was cleared, and —
 * the load-bearing one — that nothing was INSERTED in any reuse case.
 * ────────────────────────────────────────────────────────────────────────
 */

interface AccountRow {
  id: string
  email_address: string
  disconnected_at: string | null
}

interface FakeError {
  code: string
  message: string
  details: string
  hint: string
}

function pgError(code: string, message: string): FakeError {
  return { code, message, details: '', hint: '' }
}

/** Everything the fake client reads from, and everything it records. */
const db = {
  accounts: [] as AccountRow[],
  membershipRole: 'board' as string | null,
  /** Errors returned by successive mailbox_accounts UPDATEs, in order. */
  updateErrors: [] as Array<FakeError | null>,
  /** The live row a post-conflict re-read finds, if any. */
  racedLiveRow: null as { id: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; values: Record<string, unknown> }>,
  secrets: [] as Array<Record<string, unknown>>,
}

type Result = { data: unknown; error: unknown }

/**
 * A hand-rolled PostgREST-shaped chain. It records the operation as the
 * builder methods are called and resolves it at the terminal step —
 * `.then` (a bare `await`), `.single()` or `.maybeSingle()` — which is the
 * same shape the real client presents to the code under test.
 */
function chain(table: string): Record<string, unknown> {
  const state: {
    op: 'select' | 'update' | 'insert' | 'upsert' | null
    columns: string
    values: Record<string, unknown>
    id: string | null
  } = { op: null, columns: '', values: {}, id: null }

  const resolve = (): Result => {
    if (table === 'org_members') {
      return { data: db.membershipRole ? { role: db.membershipRole } : null, error: null }
    }
    if (table === 'mailbox_account_secrets') {
      db.secrets.push(state.values)
      return { data: null, error: null }
    }
    if (state.op === 'insert') {
      db.inserts.push(state.values)
      return { data: { id: `inserted-${db.inserts.length}` }, error: null }
    }
    if (state.op === 'update') {
      db.updates.push({ id: state.id ?? '(no id filter)', values: state.values })
      return { data: null, error: db.updateErrors.shift() ?? null }
    }
    // The narrow `select('id')` is the post-conflict re-read for the live
    // row; the wide one is the org-wide account lookup.
    if (state.columns === 'id') return { data: db.racedLiveRow, error: null }
    return { data: db.accounts, error: null }
  }

  const self: Record<string, unknown> = {
    select: (columns: string) => {
      if (state.op === null) {
        state.op = 'select'
        state.columns = columns
      }
      return self
    },
    update: (values: Record<string, unknown>) => {
      state.op = 'update'
      state.values = values
      return self
    },
    insert: (values: Record<string, unknown>) => {
      state.op = 'insert'
      state.values = values
      return self
    },
    upsert: (values: Record<string, unknown>) => {
      state.op = 'upsert'
      state.values = values
      return self
    },
    eq: (column: string, value: string) => {
      if (column === 'id') state.id = value
      return self
    },
    is: () => self,
    order: () => self,
    single: async () => resolve(),
    maybeSingle: async () => resolve(),
    then: (onFulfilled: (value: Result) => unknown) => onFulfilled(resolve()),
  }
  return self
}

function fakeDb(): { from: (table: string) => Record<string, unknown> } {
  return { from: (table: string) => chain(table) }
}

describe('completeConnect — reconnect reuses the existing mailbox row', () => {
  const ORG = 'org-madison-park'
  const USER = 'user-board-member'
  const MAILBOX = 'board@madisonpark.org'
  const PERSONAL = 'someone.personal@gmail.com'

  function validState(): string {
    return signState({
      orgId: ORG,
      userId: USER,
      returnTo: '/settings/mailbox',
      issuedAt: Date.now(),
    })
  }

  beforeEach(() => {
    process.env.MAILBOX_TOKEN_KEY = TEST_KEY
    google.profileEmail = MAILBOX
    google.revoked = []
    db.accounts = []
    db.membershipRole = 'board'
    db.updateErrors = []
    db.racedLiveRow = null
    db.inserts = []
    db.updates = []
    db.secrets = []
  })

  it('reuses a DISCONNECTED row for the same address and clears disconnected_at', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    const result = await completeConnect('auth-code', validState())

    expect(result.accountId).toBe('acct-original')
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].id).toBe('acct-original')
    expect(db.updates[0].values.disconnected_at).toBeNull()
    expect(db.updates[0].values.sync_status).toBe('ok')
  })

  it('inserts NO new row when reconnecting a disconnected same-address mailbox', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    await completeConnect('auth-code', validState())

    // The whole bug: a second row here is what re-imported 437 messages.
    expect(db.inserts).toEqual([])
  })

  it('stamps a fresh connected_at when reactivating, so the UI does not date the mailbox from the torn-down connection', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    const before = Date.now()
    await completeConnect('auth-code', validState())

    const connectedAt = Date.parse(String(db.updates[0].values.connected_at))
    expect(connectedAt).toBeGreaterThanOrEqual(before)
  })

  it('does not overwrite scope_mode/scope_value/display_name when reactivating a disconnected row', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    await completeConnect('auth-code', validState())

    const values = db.updates[0].values
    expect(values).not.toHaveProperty('scope_mode')
    expect(values).not.toHaveProperty('scope_value')
    expect(values).not.toHaveProperty('display_name')
  })

  it('reactivates the most recently connected row when several disconnected rows exist for the address', async () => {
    // The fake returns rows in the order the real query orders them —
    // connected_at descending — so the first match is the newest.
    db.accounts = [
      { id: 'acct-2025', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
      { id: 'acct-2023', email_address: MAILBOX, disconnected_at: '2024-01-04T09:00:00.000Z' },
    ]

    const result = await completeConnect('auth-code', validState())

    expect(result.accountId).toBe('acct-2025')
    expect(db.inserts).toEqual([])
  })

  it('still reuses a LIVE row for the same address, without touching disconnected_at', async () => {
    db.accounts = [{ id: 'acct-live', email_address: MAILBOX, disconnected_at: null }]

    const result = await completeConnect('auth-code', validState())

    expect(result.accountId).toBe('acct-live')
    expect(db.inserts).toEqual([])
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].values).not.toHaveProperty('disconnected_at')
    expect(db.updates[0].values).not.toHaveProperty('connected_at')
  })

  it('prefers the LIVE row when both a live and a disconnected row exist for the address', async () => {
    db.accounts = [
      { id: 'acct-stale', email_address: MAILBOX, disconnected_at: '2024-01-04T09:00:00.000Z' },
      { id: 'acct-live', email_address: MAILBOX, disconnected_at: null },
    ]

    const result = await completeConnect('auth-code', validState())

    // Reactivating the stale sibling would collide with
    // mailbox_accounts_live_uniq; the live row is the syncing mailbox.
    expect(result.accountId).toBe('acct-live')
    expect(db.updates[0].id).toBe('acct-live')
    expect(db.updates[0].values).not.toHaveProperty('disconnected_at')
    expect(db.inserts).toEqual([])
  })

  it('still REFUSES a different address when another mailbox is live, naming both addresses', async () => {
    db.accounts = [{ id: 'acct-live', email_address: MAILBOX, disconnected_at: null }]
    google.profileEmail = PERSONAL

    await expect(completeConnect('auth-code', validState())).rejects.toThrow(
      new RegExp(`You signed in as ${PERSONAL.replace('.', '\\.')}`),
    )
    expect(db.inserts).toEqual([])
    expect(db.updates).toEqual([])
  })

  it('revokes the rejected grant when refusing a different address', async () => {
    db.accounts = [{ id: 'acct-live', email_address: MAILBOX, disconnected_at: null }]
    google.profileEmail = PERSONAL

    await expect(completeConnect('auth-code', validState())).rejects.toThrow(/already has/)
    expect(google.revoked).toEqual(['refresh-token'])
  })

  it('refuses a different address even when THAT address has a disconnected row of its own', async () => {
    // Reactivating here would put a second LIVE mailbox beside the one the
    // UI already renders — the exact state the refusal exists to prevent.
    db.accounts = [
      { id: 'acct-live', email_address: MAILBOX, disconnected_at: null },
      { id: 'acct-personal-old', email_address: PERSONAL, disconnected_at: '2026-05-01T00:00:00.000Z' },
    ]
    google.profileEmail = PERSONAL

    await expect(completeConnect('auth-code', validState())).rejects.toThrow(/already has/)
    expect(db.updates).toEqual([])
    expect(db.inserts).toEqual([])
  })

  it('reactivates a disconnected row for a different address when no other mailbox is live', async () => {
    db.accounts = [
      { id: 'acct-old-address', email_address: MAILBOX, disconnected_at: '2026-01-01T00:00:00.000Z' },
      { id: 'acct-personal-old', email_address: PERSONAL, disconnected_at: '2026-05-01T00:00:00.000Z' },
    ]
    google.profileEmail = PERSONAL

    const result = await completeConnect('auth-code', validState())

    expect(result.accountId).toBe('acct-personal-old')
    expect(db.updates[0].values.disconnected_at).toBeNull()
    expect(db.inserts).toEqual([])
  })

  it('inserts a new row only when the org has no row at all for this address', async () => {
    const result = await completeConnect('auth-code', validState())

    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].email_address).toBe(MAILBOX)
    expect(db.inserts[0].organization_id).toBe(ORG)
    expect(db.inserts[0].sync_cursor).toBeNull()
    expect(result.accountId).toBe('inserted-1')
  })

  it('falls back to the winning live row when a concurrent connect makes reactivation a unique violation', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]
    db.updateErrors = [pgError('23505', 'duplicate key value violates unique constraint')]
    db.racedLiveRow = { id: 'acct-race-winner' }

    const result = await completeConnect('auth-code', validState())

    expect(result.accountId).toBe('acct-race-winner')
    expect(db.updates[1].id).toBe('acct-race-winner')
    expect(db.updates[1].values).not.toHaveProperty('disconnected_at')
    expect(db.inserts).toEqual([])
  })

  it('throws when a unique violation has no live row behind it', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]
    db.updateErrors = [pgError('23505', 'duplicate key value violates unique constraint')]
    db.racedLiveRow = null

    await expect(completeConnect('auth-code', validState())).rejects.toThrow(
      /failed to reactivate mailbox account/,
    )
    expect(db.inserts).toEqual([])
  })

  it('stores credentials against the reused row, not a new one', async () => {
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    await completeConnect('auth-code', validState())

    expect(db.secrets).toHaveLength(1)
    expect(db.secrets[0].mailbox_account_id).toBe('acct-original')
  })

  it('refuses a caller who is neither admin nor board, before any write', async () => {
    db.membershipRole = 'resident'
    db.accounts = [
      { id: 'acct-original', email_address: MAILBOX, disconnected_at: '2026-08-12T14:00:00.000Z' },
    ]

    await expect(completeConnect('auth-code', validState())).rejects.toThrow(
      /do not have permission/,
    )
    expect(db.updates).toEqual([])
    expect(db.inserts).toEqual([])
  })
})
