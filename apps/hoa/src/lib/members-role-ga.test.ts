import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-159: changeMemberRole starts Georgia's 30-day amended-registration
// row (lib/ga-registration/officer-change.ts) when someone moves onto or off
// the board, with the role as it was before the change. The role change
// itself stands even if starting the clock fails.

const USER = 'f0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  callerRole: 'admin' as 'admin' | 'board',
  previousRole: 'resident' as string | null,
  admins: 2,
  clockCalls: [] as Array<Record<string, unknown>>,
  clockThrows: false,
  updated: true,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: h.callerRole, org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('@/lib/ga-registration/officer-change', () => ({
  startGaOfficerChangeClock: vi.fn(async (input: Record<string, unknown>) => {
    h.clockCalls.push(input)
    if (h.clockThrows) throw new Error('boom')
    return { kind: 'started', associationIds: ['a1'] }
  }),
}))

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'actor-1' } } }) },
    from() {
      let update = false
      let head = false
      const q: Record<string, unknown> = {}
      q.select = (_c: string, opts?: { count?: string }) => ((head = !!opts?.count), q)
      q.eq = () => q
      q.update = () => ((update = true), q)
      q.maybeSingle = async () => ({ data: h.previousRole ? { role: h.previousRole } : null, error: null })
      q.then = (res: (v: unknown) => unknown) => {
        if (update) return Promise.resolve({ data: h.updated ? [{ user_id: USER }] : [], error: null }).then(res)
        if (head) return Promise.resolve({ count: h.admins, data: [], error: null }).then(res)
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
  h.callerRole = 'admin'
  h.previousRole = 'resident'
  h.admins = 2
  h.clockCalls = []
  h.clockThrows = false
  h.updated = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('changeMemberRole and the Georgia officer-change clock', () => {
  it('resident → board: starts the clock with the old and new role codes', async () => {
    expect(await changeMemberRole(USER, 'board')).toEqual({ ok: true })
    expect(h.clockCalls).toHaveLength(1)
    expect(h.clockCalls[0]).toMatchObject({ orgId: 'org-1', actorId: 'actor-1', memberId: USER, from: 'resident', to: 'board', secret: 'test-secret' })
    expect(h.clockCalls[0]!.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('board → resident starts it too', async () => {
    h.previousRole = 'board'
    expect(await changeMemberRole(USER, 'resident')).toEqual({ ok: true })
    expect(h.clockCalls[0]).toMatchObject({ from: 'board', to: 'resident' })
  })

  it('board → admin is not an officer change', async () => {
    h.previousRole = 'board'
    expect(await changeMemberRole(USER, 'admin')).toEqual({ ok: true })
    expect(h.clockCalls).toHaveLength(0)
  })

  it('a failure starting the clock never fails the role change', async () => {
    h.clockThrows = true
    expect(await changeMemberRole(USER, 'board')).toEqual({ ok: true })
  })

  it('nothing starts when the role was not changed, or the caller is not an admin', async () => {
    h.updated = false
    expect((await changeMemberRole(USER, 'board')).ok).toBe(false)
    h.updated = true
    h.callerRole = 'board'
    expect((await changeMemberRole(USER, 'board')).ok).toBe(false)
    expect(h.clockCalls).toHaveLength(0)
  })

  it('the last-admin guard still holds', async () => {
    h.previousRole = 'admin'
    h.admins = 1
    expect(await changeMemberRole(USER, 'resident')).toEqual({ ok: false, error: 'You can\'t demote the last admin. Promote someone else first.' })
    expect(h.clockCalls).toHaveLength(0)
  })
})
