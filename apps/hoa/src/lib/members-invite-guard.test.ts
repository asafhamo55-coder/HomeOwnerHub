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
  inviteError: null as null | { message: string; code?: string },
  createdAt: null as string | null,
  existingUsers: [] as Array<{ id: string; email: string }>,
  hereMember: false,
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
  b.maybeSingle = async () =>
    table === 'org_members' && h.hereMember ? { data: { user_id: 'existing-user' }, error: null } : { data: null, error: null }
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
          if (h.inviteError) return { data: { user: null }, error: h.inviteError }
          h.invited.push(email)
          return { data: { user: { id: 'new-user', created_at: h.createdAt ?? new Date().toISOString() } }, error: null }
        }),
        listUsers: vi.fn(async () => ({ data: { users: h.existingUsers } })),
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
  h.inviteError = null
  h.createdAt = null
  h.existingUsers = []
  h.hereMember = false
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

describe('inviteMember and existing accounts (SEC-N1 / SEC-N4)', () => {
  const profileUpserts = () => h.adminWrites.filter((c) => c[0] === 'profiles' && c[1] === 'upsert')

  it('a brand-new account gets its profile seeded', async () => {
    await inviteMember({ email: 'owner@example.com', role: 'resident', fullName: 'Pat' })
    expect(profileUpserts()).toHaveLength(1)
  })

  it('an unconfirmed account that existed before the call keeps its profile', async () => {
    h.createdAt = '2026-01-01T00:00:00Z'
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident', fullName: 'Someone Else' })
    expect(res.ok).toBe(true)
    expect(profileUpserts()).toHaveLength(0)
  })

  it('a confirmed account outside this HOA is not attached, and the answer matches a fresh invite', async () => {
    h.inviteError = { message: 'A user with this email address has already been registered', code: 'email_exists' }
    h.existingUsers = [{ id: 'existing-user', email: 'owner@example.com' }]
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident', propertyId: '11111111-1111-4111-8111-111111111111', residencyRole: 'owner' })
    expect(res).toEqual({ ok: true, data: { userId: null, alreadyExisted: false } })
    expect(memberInserts()).toHaveLength(0)
    expect(profileUpserts()).toHaveLength(0)
    expect(h.adminWrites.some((c) => ['property_residents', 'ownerships', 'tenancies'].includes(c[0] as string) && c[1] !== 'select')).toBe(false)
  })

  it('a confirmed account that is already a member here is updated without touching its profile', async () => {
    h.inviteError = { message: 'A user with this email address has already been registered', code: 'email_exists' }
    h.existingUsers = [{ id: 'existing-user', email: 'owner@example.com' }]
    h.hereMember = true
    const res = await inviteMember({ email: 'owner@example.com', role: 'resident' })
    expect(res).toEqual({ ok: true, data: { userId: 'existing-user', alreadyExisted: true } })
    expect(profileUpserts()).toHaveLength(0)
  })
})
