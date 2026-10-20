import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-135: the Members page's single invite (inviteMember) passes the same
// outbound guard as the bulk invite and Resend (BL-128). A held address
// gets no Supabase invitation (which would both create the account and
// send the email) and no membership row.

const h = vi.hoisted(() => ({
  sandbox: false,
  invited: [] as string[],
  userWrites: [] as unknown[][],
  adminWrites: [] as unknown[][],
  sandboxReads: [] as string[],
  warn: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'admin', org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/org-owned', () => ({ checkOrgOwned: vi.fn(async () => 'owned') }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.test${p}` }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@homeowner-portal/observability/outbound-guard', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/observability/outbound-guard')>()),
  fetchOrgSandbox: vi.fn(async (_db: unknown, orgId: string) => (h.sandboxReads.push(orgId), h.sandbox)),
}))

function chain(log: unknown[][], table: string) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'is', 'ilike', 'limit', 'update', 'delete', 'upsert', 'insert']) {
    b[op] = (...a: unknown[]) => (log.push([table, op, ...a]), b)
  }
  b.maybeSingle = async () => ({ data: null, error: null })
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: (t: string) => chain(h.userWrites, t) })),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => ({
    from: (t: string) => chain(h.adminWrites, t),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async (email: string) => {
          h.invited.push(email)
          return { data: { user: { id: 'new-user' } }, error: null }
        }),
        listUsers: vi.fn(async () => ({ data: { users: [] } })),
      },
    },
  })),
}))

const { inviteMember } = await import('./members')

const ENV_KEYS = ['VERCEL_ENV', 'OUTBOUND_ALLOWLIST'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.VERCEL_ENV = 'production'
  delete process.env.OUTBOUND_ALLOWLIST
  h.sandbox = false
  h.invited = []
  h.userWrites = []
  h.adminWrites = []
  h.sandboxReads = []
  vi.spyOn(console, 'warn').mockImplementation(h.warn)
  h.warn.mockClear()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
})

const memberInserts = () => h.userWrites.filter((c) => c[0] === 'org_members' && c[1] === 'insert')

describe('inviteMember outbound guard (BL-135)', () => {
  it('production, org not sandboxed: sends the invitation and adds the member', async () => {
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident' })
    expect(res).toEqual({ ok: true, data: { userId: 'new-user', alreadyExisted: false } })
    expect(h.invited).toEqual(['owner@example.com'])
    expect(memberInserts()).toHaveLength(1)
    expect(h.sandboxReads).toEqual(['org-1'])
  })

  it('sandboxed org: no invitation, no account, no membership', async () => {
    h.sandbox = true
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident' })
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ error: expect.stringContaining('no invitation was sent') })
    expect(h.invited).toEqual([])
    expect(memberInserts()).toHaveLength(0)
    expect(h.adminWrites).toEqual([])
  })

  it('outside production: an address not on OUTBOUND_ALLOWLIST is held', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident' })
    expect(res.ok).toBe(false)
    expect(h.invited).toEqual([])
    expect(memberInserts()).toHaveLength(0)
  })

  it('outside production: an allowlisted address is invited', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    const res = await inviteMember({ email: 'Pat@Team.test', role: 'board' })
    expect(res.ok).toBe(true)
    expect(h.invited).toEqual(['Pat@Team.test'])
  })

  it('the held-send log line carries counts and the org id, never the address', async () => {
    h.sandbox = true
    await inviteMember({ email: 'owner@example.com', role: 'resident' })
    expect(h.warn).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(h.warn.mock.calls)
    expect(logged).not.toContain('owner@example.com')
    expect(logged).toContain('invite_single:org-1')
  })
})
