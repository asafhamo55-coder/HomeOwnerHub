import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectError } from '@/lib/inbox/connect-errors'

// ─── Mocks ───────────────────────────────────────────────────────────

const completeConnect = vi.fn()
let sessionUser: { id: string } | null = { id: 'user-1' }
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}))
vi.mock('@/lib/inbox/connect', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/inbox/connect')>()),
  completeConnect: (...args: unknown[]) => completeConnect(...args),
}))

const inngestSend = vi.fn()
vi.mock('@homeowner-portal/jobs', () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}))

let markError: { code: string; message: string } | null = null
const updates: Array<{ table: string; values: unknown; id: unknown }> = []
// BL-018: the account's backfill state, read after completeConnect.
const FRESH_ACCOUNT = {
  backfill_status: 'pending',
  backfill_progress: null,
  scope_mode: 'all',
  scope_value: null,
  last_synced_at: null,
  sync_cursor: null,
}
let accountRow: Record<string, unknown> | null = FRESH_ACCOUNT
let accountReadError: { code: string; message: string } | null = null
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: accountReadError ? null : accountRow, error: accountReadError }),
        }),
      }),
      update: (values: unknown) => ({
        eq: async (_col: string, id: unknown) => {
          updates.push({ table, values, id })
          return { error: markError }
        },
      }),
    }),
  }),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { GET } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const ORIGIN = 'https://app.example.test'
const SECRET_TEXT = 'jane.doe@example.com'
const PG_TEXT = 'duplicate key value violates unique constraint "mailbox_accounts_live_uniq"'

function call(query: string, cookie: string | null = 'hh_gmail_oauth_nonce=nonce-1') {
  return GET(
    new Request(`${ORIGIN}/api/oauth/google/callback${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  )
}

function location(res: Response): URL {
  expect([302, 303, 307, 308]).toContain(res.status)
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc!)
}

let logs: string[] = []

beforeEach(() => {
  completeConnect.mockReset()
  sessionUser = { id: 'user-1' }
  inngestSend.mockReset()
  markError = null
  updates.length = 0
  accountRow = FRESH_ACCOUNT
  accountReadError = null
  logs = []
  const capture = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
  vi.spyOn(console, 'error').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
  vi.spyOn(console, 'log').mockImplementation(capture)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('GET /api/oauth/google/callback — session and nonce binding', () => {
  it('passes the session user and the nonce cookie to completeConnect', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockResolvedValue(undefined)
    await call('?code=c&state=s')
    expect(completeConnect).toHaveBeenCalledWith('c', 's', { sessionUserId: 'user-1', nonce: 'nonce-1' })
  })

  it('passes a null session user when signed out, so the connect is refused', async () => {
    sessionUser = null
    completeConnect.mockRejectedValue(new ConnectError('invalid_state', 'x'))
    const url = location(await call('?code=c&state=s'))
    expect(completeConnect).toHaveBeenCalledWith('c', 's', { sessionUserId: null, nonce: 'nonce-1' })
    expect(url.searchParams.get('error')).toBe('invalid_state')
  })

  it('clears the nonce cookie on first use (success) so the state cannot be replayed', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockResolvedValue(undefined)
    const res = await call('?code=c&state=s')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('hh_gmail_oauth_nonce=;')
    expect(cookie).toMatch(/Max-Age=0/i)
  })

  it('clears the nonce cookie on failure too', async () => {
    completeConnect.mockRejectedValue(new ConnectError('forbidden', 'x'))
    const res = await call('?code=c&state=s')
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i)
  })

  it('a replay without the cookie reaches completeConnect with a null nonce (refused there)', async () => {
    completeConnect.mockRejectedValue(new ConnectError('invalid_state', 'x'))
    const url = location(await call('?code=c&state=s', null))
    expect(completeConnect).toHaveBeenCalledWith('c', 's', { sessionUserId: 'user-1', nonce: null })
    expect(url.searchParams.get('error')).toBe('invalid_state')
  })
})

describe('GET /api/oauth/google/callback', () => {
  it('redirects to the returnTo page on success', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockResolvedValue(undefined)

    const url = location(await call('?code=c&state=s'))

    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/settings/mailbox')
    expect(url.searchParams.get('connected')).toBe('1')
    expect(url.searchParams.get('account')).toBe('acct-1')
    expect(url.searchParams.get('error')).toBeNull()
    expect(inngestSend).toHaveBeenCalledWith({ name: 'mailbox/backfill.requested', data: { accountId: 'acct-1' } })
  })

  it('re-sanitizes returnTo before redirecting', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '//evil.example' })
    inngestSend.mockResolvedValue(undefined)

    const url = location(await call('?code=c&state=s'))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/settings/mailbox')
  })

  it('maps Google access_denied to its own code', async () => {
    const url = location(await call('?error=access_denied'))
    expect(url.pathname).toBe('/settings/mailbox')
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(completeConnect).not.toHaveBeenCalled()
  })

  it('never echoes an arbitrary ?error= value back into the redirect', async () => {
    const url = location(await call(`?error=${encodeURIComponent('Call 555-0100 to verify your account')}`))
    expect(url.searchParams.get('error')).toBe('google_error')
    expect(url.toString()).not.toContain('555')
  })

  it('redirects with missing_code when code or state is absent', async () => {
    expect(location(await call('?code=c')).searchParams.get('error')).toBe('missing_code')
    expect(location(await call('?state=s')).searchParams.get('error')).toBe('missing_code')
    expect(completeConnect).not.toHaveBeenCalled()
  })

  it('refuses an oversized code or state without calling completeConnect', async () => {
    const big = 'a'.repeat(20_000)
    expect(location(await call(`?code=${big}&state=s`)).searchParams.get('error')).toBe('invalid_request')
    expect(location(await call(`?code=c&state=${big}`)).searchParams.get('error')).toBe('invalid_request')
    expect(completeConnect).not.toHaveBeenCalled()
  })

  it('redirects with a ConnectError code, never its message (which may name addresses)', async () => {
    completeConnect.mockRejectedValue(
      new ConnectError(
        'different_mailbox_connected',
        `You signed in as ${SECRET_TEXT}, but this organization already has board@hoa.test connected.`,
      ),
    )

    const res = await call('?code=c&state=s')
    const url = location(res)

    expect(url.searchParams.get('error')).toBe('different_mailbox_connected')
    expect(url.toString()).not.toContain('jane')
    expect(url.toString()).not.toContain('signed')
    expect(logs.join('\n')).not.toContain(SECRET_TEXT)
    expect(logs.join('\n')).not.toContain('board@hoa.test')
  })

  it('maps an expired state to state_expired', async () => {
    completeConnect.mockRejectedValue(new ConnectError('state_expired', 'OAuth state expired — please start again.'))
    expect(location(await call('?code=c&state=s')).searchParams.get('error')).toBe('state_expired')
  })

  it('maps an unexpected failure to internal with no raw text in the URL or logs', async () => {
    completeConnect.mockRejectedValue(Object.assign(new Error(`completeConnect: ${PG_TEXT}`), { code: '23505' }))

    const url = location(await call('?code=c&state=s'))

    expect(url.searchParams.get('error')).toBe('internal')
    expect(url.toString()).not.toContain('duplicate')
    expect(url.toString()).not.toContain('mailbox_accounts')
    const logText = logs.join('\n')
    expect(logText).not.toContain('duplicate key')
    expect(logText).not.toContain('mailbox_accounts_live_uniq')
    expect(logText).toContain('23505')
  })

  it('still reports success when queueing the backfill fails, and marks it failed', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockRejectedValue(new Error(`Inngest refused: event key ${SECRET_TEXT}`))

    const url = location(await call('?code=c&state=s'))

    expect(url.searchParams.get('connected')).toBe('1')
    expect(url.searchParams.get('error')).toBeNull()
    expect(updates).toEqual([{ table: 'mailbox_accounts', values: { backfill_status: 'failed' }, id: 'acct-1' }])
    expect(logs.join('\n')).not.toContain(SECRET_TEXT)
    expect(logs.join('\n')).toContain('acct-1')
  })

  it('still reports success when marking the backfill failed also fails, logging only the code', async () => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockRejectedValue(new Error('no event key'))
    markError = { code: '42501', message: `permission denied for table mailbox_accounts (${SECRET_TEXT})` }

    const url = location(await call('?code=c&state=s'))

    expect(url.searchParams.get('connected')).toBe('1')
    const logText = logs.join('\n')
    expect(logText).not.toContain('permission denied')
    expect(logText).not.toContain(SECRET_TEXT)
    expect(logText).toContain('42501')
  })
})

describe('BL-018 — reconnecting does not redo a completed backfill', () => {
  const now = Date.now()
  const done = (over: Record<string, unknown> = {}) => ({
    backfill_status: 'done',
    backfill_progress: { done: 4200, has_more: false, total_estimate: 4100, scope: 'address:board@hoa.test' },
    scope_mode: 'address',
    scope_value: 'board@hoa.test',
    last_synced_at: new Date(now - 2 * 86_400_000).toISOString(),
    sync_cursor: '987654',
    ...over,
  })

  beforeEach(() => {
    completeConnect.mockResolvedValue({ accountId: 'acct-1', orgId: 'org-1', returnTo: '/settings/mailbox' })
    inngestSend.mockResolvedValue(undefined)
  })

  it('complete, same scope, recent sync: no backfill event — incremental sync takes over', async () => {
    accountRow = done()
    const url = location(await call('?code=c&state=s'))
    expect(url.searchParams.get('connected')).toBe('1')
    expect(inngestSend).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('complete, long gap: a bounded backfill window, not twelve months', async () => {
    accountRow = done({ last_synced_at: new Date(now - 40 * 86_400_000).toISOString() })
    await call('?code=c&state=s')
    expect(inngestSend).toHaveBeenCalledTimes(1)
    const event = inngestSend.mock.calls[0]![0] as { name: string; data: { accountId: string; afterDate: string } }
    expect(event.name).toBe('mailbox/backfill.requested')
    expect(event.data.accountId).toBe('acct-1')
    expect(event.data.afterDate).toBe(new Date(now - 41 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '/'))
  })

  it('failed backfill: reconnect re-runs the full backfill', async () => {
    accountRow = done({ backfill_status: 'failed' })
    await call('?code=c&state=s')
    expect(inngestSend).toHaveBeenCalledWith({ name: 'mailbox/backfill.requested', data: { accountId: 'acct-1' } })
  })

  it('wedged backfill (stuck running): reconnect still rescues it with a full backfill', async () => {
    accountRow = done({ backfill_status: 'running', backfill_progress: { done: 300, has_more: true } })
    await call('?code=c&state=s')
    expect(inngestSend).toHaveBeenCalledWith({ name: 'mailbox/backfill.requested', data: { accountId: 'acct-1' } })
  })

  it('scope changed since the import: full backfill', async () => {
    accountRow = done({ scope_mode: 'label', scope_value: 'HOA' })
    await call('?code=c&state=s')
    expect(inngestSend).toHaveBeenCalledWith({ name: 'mailbox/backfill.requested', data: { accountId: 'acct-1' } })
  })

  it('if the state read fails, falls back to the full backfill (ingest is idempotent), logging only the code', async () => {
    accountReadError = { code: '57014', message: `timeout reading ${SECRET_TEXT}` }
    await call('?code=c&state=s')
    expect(inngestSend).toHaveBeenCalledWith({ name: 'mailbox/backfill.requested', data: { accountId: 'acct-1' } })
    expect(logs.join('\n')).toContain('57014')
    expect(logs.join('\n')).not.toContain(SECRET_TEXT)
  })
})
