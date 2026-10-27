import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-168: leaving the board ends an officer title. The write says so itself
// (the database also clears it), and only once the column exists (M6).

const USER = 'f0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({ m6: true, updates: [] as Array<Record<string, unknown>> }))

vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'admin', org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('@/lib/ga-registration/officer-change', () => ({ startGaOfficerChangeClock: vi.fn(async () => ({ kind: 'none' })) }))

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'actor-1' } } }) },
    from() {
      let update: Record<string, unknown> | null = null
      let head = false
      const q: Record<string, unknown> = {}
      q.select = (_c: string, opts?: { count?: string }) => ((head = !!opts?.count), q)
      q.eq = () => q
      q.update = (v: Record<string, unknown>) => ((update = v), h.updates.push(v), q)
      q.maybeSingle = async () => ({ data: { role: 'board' }, error: null })
      q.then = (res: (v: unknown) => unknown) => {
        if (update) return Promise.resolve({ data: [{ user_id: USER }], error: null }).then(res)
        if (head) return Promise.resolve({ count: 2, data: [], error: null }).then(res)
        return Promise.resolve({ data: [], error: null }).then(res)
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => client()) }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => client()) }))

const { changeMemberRole } = await import('./members')

beforeEach(() => {
  h.m6 = true
  h.updates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('changeMemberRole and officer titles', () => {
  it('moving a board member to resident clears their title in the same write', async () => {
    expect(await changeMemberRole(USER, 'resident')).toEqual({ ok: true })
    expect(h.updates).toEqual([{ role: 'resident', officer_title: null }])
  })

  it('moving someone onto or within the board leaves the title alone', async () => {
    await changeMemberRole(USER, 'board')
    expect(h.updates).toEqual([{ role: 'board' }])
  })

  it('before M6 the column is never written', async () => {
    h.m6 = false
    await changeMemberRole(USER, 'resident')
    expect(h.updates).toEqual([{ role: 'resident' }])
  })
})
