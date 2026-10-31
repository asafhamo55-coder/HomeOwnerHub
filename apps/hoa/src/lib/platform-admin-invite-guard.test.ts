import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Security review 2026-10-20 (Low): the platform-admin invites
// (createTenant's initial admin, inviteOrPromotePlatformAdmin) called
// Supabase's inviteUserByEmail without the outbound guard. They now pass
// the same guard as inviteMember / the bulk invite: a held address gets no
// Supabase invitation (account + email), no membership and no grant.

const h = vi.hoisted(() => ({
  sandbox: false,
  invited: [] as string[],
  writes: [] as unknown[][],
  sandboxReads: [] as string[],
  sent: [] as unknown[],
  warn: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: unknown) => (h.sent.push(m), { ok: true })),
  appUrl: (p: string) => `https://app.test${p}`,
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    rpc: async () => ({ data: true, error: null }),
  })),
}))
vi.mock('@homeowner-portal/observability/outbound-guard', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/observability/outbound-guard')>()),
  fetchOrgSandbox: vi.fn(async (_db: unknown, orgId: string) => (h.sandboxReads.push(orgId), h.sandbox)),
}))

function chain(table: string) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'is', 'ilike', 'limit', 'update', 'delete', 'upsert', 'insert']) {
    b[op] = (...a: unknown[]) => (h.writes.push([table, op, ...a]), b)
  }
  const result = table === 'orgs' ? { data: { id: 'org-new' }, error: null } : { data: null, error: null }
  b.single = async () => result
  b.maybeSingle = async () => result
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
  return b
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => ({
    from: (t: string) => chain(t),
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

const { createTenant, inviteOrPromotePlatformAdmin } = await import('./platform-admin')

const ENV_KEYS = ['VERCEL_ENV', 'OUTBOUND_ALLOWLIST'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.VERCEL_ENV = 'production'
  delete process.env.OUTBOUND_ALLOWLIST
  h.sandbox = false
  h.invited = []
  h.writes = []
  h.sandboxReads = []
  h.sent = []
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

const writesTo = (table: string, op: string) => h.writes.filter((c) => c[0] === table && c[1] === op)

const tenant = (email: string) =>
  createTenant({ name: 'Oak Hills', associationName: 'Oak Hills HOA', state: 'FL', inviteAdminEmail: email })

describe('createTenant initial-admin invite: outbound guard', () => {
  it('production, org not sandboxed: invites and adds the admin', async () => {
    const res = await tenant('admin@example.com')
    expect(res).toEqual({ ok: true, data: { orgId: 'org-new', inviteHeld: false } })
    expect(h.invited).toEqual(['admin@example.com'])
    expect(h.sandboxReads).toEqual(['org-new'])
    expect(writesTo('org_members', 'insert')).toHaveLength(1)
  })

  it('sandboxed org: tenant is created, but no invitation and no membership', async () => {
    h.sandbox = true
    const res = await tenant('admin@example.com')
    expect(res).toEqual({ ok: true, data: { orgId: 'org-new', inviteHeld: true } })
    expect(h.invited).toEqual([])
    expect(writesTo('org_members', 'insert')).toHaveLength(0)
    expect(writesTo('profiles', 'upsert')).toHaveLength(0)
  })

  it('outside production: an address not on OUTBOUND_ALLOWLIST is held', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    const res = await tenant('admin@example.com')
    expect(res.ok && res.data.inviteHeld).toBe(true)
    expect(h.invited).toEqual([])
  })

  it('outside production: an allowlisted address is invited', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    await tenant('pat@team.test')
    expect(h.invited).toEqual(['pat@team.test'])
  })

  it('the held-send log line carries counts and the org id, never the address', async () => {
    h.sandbox = true
    await tenant('admin@example.com')
    expect(h.warn).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(h.warn.mock.calls)
    expect(logged).not.toContain('admin@example.com')
    expect(logged).toContain('invite_tenant_admin:org-new')
  })

  it('no invite email: the guard is not consulted', async () => {
    const res = await tenant('')
    expect(res).toEqual({ ok: true, data: { orgId: 'org-new', inviteHeld: false } })
    expect(h.sandboxReads).toEqual([])
    expect(h.invited).toEqual([])
  })
})

describe('inviteOrPromotePlatformAdmin: outbound guard', () => {
  it('production: a new address is invited and granted', async () => {
    const res = await inviteOrPromotePlatformAdmin('new@example.com')
    expect(res).toEqual({ ok: true, data: { userId: 'new-user', alreadyExisted: false } })
    expect(h.invited).toEqual(['new@example.com'])
    expect(writesTo('platform_admins', 'upsert')).toHaveLength(1)
  })

  it('outside production: a held address gets no account, no grant and no email', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    const res = await inviteOrPromotePlatformAdmin('new@example.com')
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ error: expect.stringContaining('no invitation was sent') })
    expect(h.invited).toEqual([])
    expect(writesTo('platform_admins', 'upsert')).toHaveLength(0)
    expect(h.sent).toEqual([])
    const logged = JSON.stringify(h.warn.mock.calls)
    expect(logged).not.toContain('new@example.com')
    expect(logged).toContain('invite_platform_admin')
  })

  it('outside production: an allowlisted address is invited', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    const res = await inviteOrPromotePlatformAdmin('Pat@Team.test')
    expect(res.ok).toBe(true)
    expect(h.invited).toEqual(['pat@team.test'])
  })
})
