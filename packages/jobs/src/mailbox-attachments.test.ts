import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gmail is never reached: every test injects `clientFor`. markAuthFailed is
// stubbed so an auth failure can be asserted without a token row.
vi.mock('./mailbox-tokens', () => ({
  getAccessTokenFor: vi.fn(async () => {
    throw new Error('getAccessTokenFor must not be called in tests')
  }),
  markAuthFailed: vi.fn(async () => undefined),
}))

import { MailboxAuthError } from '@homeowner-portal/mailbox'
import {
  dueForAttemptFilter,
  isDueForAttempt,
  MAX_FETCH_ATTEMPTS,
} from '../../../apps/hoa/src/lib/inbox/attachment-state'
import {
  ATTACHMENT_BATCH_SIZE,
  pickFairBatch,
  rotate,
  runAttachmentFetch,
} from './mailbox-attachments'
import { markAuthFailed } from './mailbox-tokens'

const NOW = new Date('2026-10-18T12:00:00.000Z')

interface AttRow {
  id: string
  organization_id: string
  thread_id: string
  message_id: string
  file_name: string
  content_type: string | null
  gmail_attachment_id: string | null
  fetch_status: string
  fetch_attempts: number
  fetch_error: string | null
  created_at: string
}

/**
 * In-memory stand-in for the handful of PostgREST shapes the job uses.
 * The pending query honours eq/lt/order/limit and evaluates the due-for-
 * attempt `or` filter by asserting it is the exact schedule string and
 * then applying the schedule in JS.
 */
function buildStore(opts: {
  orgs: Record<string, number>
  accountOrgs?: string[]
  failOrgQuery?: string
  disconnected?: string[]
  createdMinutesAgo?: number
}) {
  const attachments: AttRow[] = []
  let seq = 0
  for (const [org, count] of Object.entries(opts.orgs)) {
    for (let i = 0; i < count; i++) {
      seq++
      attachments.push({
        id: `${org}-att-${i}`,
        organization_id: org,
        thread_id: `${org}-thread`,
        message_id: `${org}-msg`,
        file_name: 'file.pdf',
        content_type: 'application/pdf',
        gmail_attachment_id: `g-${org}-${i}`,
        fetch_status: 'pending',
        fetch_attempts: 0,
        fetch_error: null,
        // The big org's rows are all OLDER than everyone else's — the
        // exact shape that starved other tenants under a global
        // `order(created_at).limit(20)`.
        created_at: new Date(
          NOW.getTime() - (opts.createdMinutesAgo ?? 60) * 60_000 - (100_000 - seq),
        ).toISOString(),
      })
    }
  }
  const accountOrgs = opts.accountOrgs ?? Object.keys(opts.orgs)
  const uploads: string[] = []
  const pendingQueries: string[] = []
  const state = { now: NOW }

  const db = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path)
          return { error: null }
        },
      }),
    },
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      let orFilter: string | null = null
      let limitN = Infinity
      let patch: Record<string, unknown> | null = null
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (values: Record<string, unknown>) => {
          patch = values
          return chain
        },
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val)
          if (patch) return applyUpdate()
          return chain
        },
        lt: (col: string, val: number) => {
          filters.push((r) => (r[col] as number) < val)
          return chain
        },
        or: (expr: string) => {
          orFilter = expr
          return chain
        },
        order: () => chain,
        range: async (from: number) => {
          expect(table).toBe('mailbox_accounts')
          return { data: from === 0 ? rowsFor(table) : [], error: null }
        },
        limit: async (n: number) => {
          limitN = n
          return runSelect()
        },
        maybeSingle: async () => {
          const rows = rowsFor(table).filter((r) => filters.every((f) => f(r)))
          return { data: rows[0] ?? null, error: null }
        },
        then: undefined,
      }
      function rowsFor(t: string): Array<Record<string, unknown>> {
        if (t === 'inbox_attachments') return attachments as unknown as Array<Record<string, unknown>>
        if (t === 'mailbox_accounts') {
          return accountOrgs.map((org) => ({
            id: `${org}-acct`,
            organization_id: org,
            disconnected_at: opts.disconnected?.includes(org) ? '2026-10-01T00:00:00Z' : null,
          }))
        }
        if (t === 'inbox_messages') {
          return Object.keys(opts.orgs).map((org) => ({
            id: `${org}-msg`,
            gmail_message_id: `gm-${org}`,
            thread_id: `${org}-thread`,
          }))
        }
        if (t === 'inbox_threads') {
          return Object.keys(opts.orgs).map((org) => ({ id: `${org}-thread`, mailbox_account_id: `${org}-acct` }))
        }
        throw new Error(`unexpected table ${t}`)
      }
      function runSelect() {
        if (table === 'mailbox_accounts') {
          return { data: rowsFor(table), error: null }
        }
        const org = Object.keys(opts.orgs).find((o) =>
          filters.every((f) => f({ organization_id: o, fetch_status: 'pending', fetch_attempts: 0 })),
        )
        pendingQueries.push(org ?? '(none)')
        if (org && org === opts.failOrgQuery) {
          return { data: null, error: { code: '57014', message: 'statement timeout' } }
        }
        expect(orFilter).toBe(dueForAttemptFilter(state.now))
        const rows = attachments
          .filter((r) => filters.every((f) => f(r as unknown as Record<string, unknown>)))
          .filter((r) => isDueForAttempt(r, state.now))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, limitN)
        return { data: rows, error: null }
      }
      async function applyUpdate() {
        const p = patch!
        for (const r of rowsFor(table)) {
          if (filters.every((f) => f(r))) Object.assign(r, p)
        }
        return { error: null }
      }
      return chain
    },
  }

  return { db, attachments, uploads, pendingQueries, state }
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function okClient() {
  return { getAttachment: vi.fn(async () => Buffer.from('bytes')) }
}

beforeEach(() => {
  vi.mocked(markAuthFailed).mockClear()
  logger.info.mockClear()
  logger.error.mockClear()
})

describe('pickFairBatch', () => {
  it('round-robins across org queues', () => {
    const a = ['a1', 'a2', 'a3', 'a4']
    const b = ['b1']
    const c = ['c1', 'c2']
    expect(pickFairBatch([a, b, c], 6)).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
  })

  it('a lone org still gets the whole batch (no idle capacity)', () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`)
    expect(pickFairBatch([a], 20)).toHaveLength(20)
  })

  it('rotate shifts the starting org', () => {
    expect(rotate(['x', 'y', 'z'], 1)).toEqual(['y', 'z', 'x'])
    expect(rotate(['x', 'y', 'z'], 5)).toEqual(['z', 'x', 'y'])
    expect(rotate([], 3)).toEqual([])
  })
})

describe('runAttachmentFetch — per-tenant fairness', () => {
  it('one org with thousands queued cannot starve the others', async () => {
    const store = buildStore({ orgs: { big: 3000, small1: 3, small2: 2 } })
    const client = okClient()

    const result = await runAttachmentFetch(store.db as never, logger, {
      now: () => NOW,
      clientFor: async () => client,
    })

    const storedBy = (org: string) =>
      store.attachments.filter((a) => a.organization_id === org && a.fetch_status === 'stored').length
    // Every small-org attachment goes in the first run, even though all
    // 3000 of big's rows are older.
    expect(storedBy('small1')).toBe(3)
    expect(storedBy('small2')).toBe(2)
    // big still uses the rest of the batch.
    expect(storedBy('big')).toBe(ATTACHMENT_BATCH_SIZE - 5)
    expect(result.fetched).toBe(ATTACHMENT_BATCH_SIZE)
    // Ids and counts only in logs.
    for (const call of logger.info.mock.calls) expect(String(call[0])).not.toMatch(/@|file\.pdf/)
  })

  it('with many orgs, each gets a turn: two equal backlogs split the batch evenly', async () => {
    const store = buildStore({ orgs: { a: 500, b: 500 } })
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => okClient() })
    const stored = store.attachments.filter((r) => r.fetch_status === 'stored')
    expect(stored.filter((r) => r.organization_id === 'a')).toHaveLength(ATTACHMENT_BATCH_SIZE / 2)
    expect(stored.filter((r) => r.organization_id === 'b')).toHaveLength(ATTACHMENT_BATCH_SIZE / 2)
  })

  it('more orgs than batch slots: rotation lets every org through over successive cron runs', async () => {
    const orgs = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`org${String(i).padStart(2, '0')}`, 3]))
    const store = buildStore({ orgs })
    const servedPerRun: number[] = []
    for (let run = 0; run < 2; run++) {
      // The cron fires every 5 minutes.
      store.state.now = new Date(NOW.getTime() + run * 5 * 60_000)
      await runAttachmentFetch(store.db as never, logger, {
        now: () => store.state.now,
        clientFor: async () => okClient(),
      })
      servedPerRun.push(new Set(store.attachments.filter((r) => r.fetch_status === 'stored').map((r) => r.organization_id)).size)
    }
    // Run 1: 20 distinct orgs get one file each (round-robin, not 20 from one org).
    expect(servedPerRun[0]).toBe(ATTACHMENT_BATCH_SIZE)
    // Run 2 starts further round the ring, so all 30 have been served.
    expect(servedPerRun[1]).toBe(30)
  })

  it("one org's failed query doesn't stop the others", async () => {
    const store = buildStore({ orgs: { broken: 5, fine: 4 }, failOrgQuery: 'broken' })
    const result = await runAttachmentFetch(store.db as never, logger, {
      now: () => NOW,
      clientFor: async () => okClient(),
    })
    expect(result.fetched).toBe(4)
    expect(store.attachments.filter((r) => r.organization_id === 'broken' && r.fetch_status === 'stored')).toHaveLength(0)
  })

  it('throws when every org query fails (a failed read is not "nothing to do")', async () => {
    const store = buildStore({ orgs: { broken: 5 }, failOrgQuery: 'broken' })
    await expect(
      runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => okClient() }),
    ).rejects.toThrow(/failed to load pending attachments/)
  })
})

describe('runAttachmentFetch — bounded retry with backoff', () => {
  it('a transient failure stays pending with one more attempt, until the budget is spent', async () => {
    const store = buildStore({ orgs: { a: 1 }, createdMinutesAgo: 10_000 })
    const failing = { getAttachment: vi.fn(async () => Promise.reject(new Error('Gmail 503'))) }

    for (let i = 1; i <= MAX_FETCH_ATTEMPTS; i++) {
      await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => failing })
      const row = store.attachments[0]!
      expect(row.fetch_attempts).toBe(i)
      expect(row.fetch_status).toBe(i < MAX_FETCH_ATTEMPTS ? 'pending' : 'failed')
    }
    // Bounded: a fifth run does not try again.
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => failing })
    expect(failing.getAttachment).toHaveBeenCalledTimes(MAX_FETCH_ATTEMPTS)
  })

  it('backoff: a row that just failed is not retried on the very next run', async () => {
    const store = buildStore({ orgs: { a: 1 }, createdMinutesAgo: 0 })
    const failing = { getAttachment: vi.fn(async () => Promise.reject(new Error('Gmail 503'))) }
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => failing })
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => failing })
    expect(failing.getAttachment).toHaveBeenCalledTimes(1)
    expect(store.attachments[0]!.fetch_status).toBe('pending')
  })

  it('an auth failure flags the account, never logs content', async () => {
    const store = buildStore({ orgs: { a: 1 }, createdMinutesAgo: 10_000 })
    const authFail = { getAttachment: vi.fn(async () => Promise.reject(new MailboxAuthError('invalid_grant'))) }
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => authFail })
    expect(markAuthFailed).toHaveBeenCalledWith(expect.anything(), 'a-acct', 'invalid_grant')
    expect(store.attachments[0]!.fetch_attempts).toBe(1)
  })

  it('a disconnected mailbox fails its attachments without calling Gmail', async () => {
    const store = buildStore({ orgs: { a: 2 }, disconnected: ['a'] })
    const client = okClient()
    await runAttachmentFetch(store.db as never, logger, { now: () => NOW, clientFor: async () => client })
    expect(client.getAttachment).not.toHaveBeenCalled()
    expect(store.attachments.every((r) => r.fetch_status === 'failed')).toBe(true)
  })
})
