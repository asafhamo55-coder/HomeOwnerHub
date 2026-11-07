import { beforeEach, describe, expect, it, vi } from 'vitest'

const MINE = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const NEIGHBOUR = '1c7d9a2f-4b62-4d22-8e3f-2a6b8f0d3c51'

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  homes: [] as Array<{ unitId: string; propertyId: string }>,
  violations: [] as Array<Record<string, unknown>>,
  hearings: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.role === null ? null : { id: 'user-1' } } }) },
  })),
}))
vi.mock('@/lib/impersonation', async () => {
  const { fakeDb } = await import('@/lib/violation-hearings/__tests__/fake-hearing-db')
  return { getResidentActor: vi.fn(async () => ({ id: 'user-1', orgId: 'org-1', client: fakeDb({ hoa_violations: h.violations }) })) }
})
vi.mock('@/lib/resident', () => ({
  getResidentUnits: vi.fn(async () => [
    { unit_id: 'u1', association_name: 'Maple Grove HOA', association_state: 'GA', association_time_zone: 'America/New_York' },
  ]),
}))
vi.mock('@/lib/violation-response', async (orig) => ({
  ...(await orig<typeof import('@/lib/violation-response')>()),
  homePropertiesForUnits: vi.fn(async () => h.homes),
}))
vi.mock('@homeowner-portal/db', async () => {
  const { fakeDb } = await import('@/lib/violation-hearings/__tests__/fake-hearing-db')
  return { createAdminClient: () => fakeDb({ violation_hearings: h.hearings }) }
})

import { GET } from './route'

function call(id: string) {
  return GET(new Request(`https://app.example.com/resident/violations/${id}/calendar`), { params: Promise.resolve({ id }) })
}
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}
function hearing(violation_id: string, over: Record<string, unknown> = {}) {
  return {
    organization_id: 'org-1',
    violation_id,
    status: 'scheduled',
    requested_at: null,
    hearing_on: day(10),
    hearing_time: '18:30',
    location: 'Clubhouse',
    notice_sent_on: day(-2),
    outcome: null,
    decided_on: null,
    payment_due_on: null,
    ...over,
  }
}
function violation(id: string, property_id: string) {
  return { id, property_id, org_id: 'org-1', violation_type: 'trash_bins', status: 'notice_sent', deleted_at: null }
}

beforeEach(() => {
  h.role = 'resident'
  h.homes = [{ unitId: 'u1', propertyId: 'p-mine' }]
  h.violations = [violation(MINE, 'p-mine'), violation(NEIGHBOUR, 'p-neighbour')]
  h.hearings = [hearing(MINE), hearing(NEIGHBOUR)]
})

describe('GET /resident/violations/[id]/calendar', () => {
  it('returns the owner’s own hearing as one .ics', async () => {
    const res = await call(MINE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/calendar/)
    expect(res.headers.get('content-disposition')).toContain(`violation-hearing-${day(10)}.ics`)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.text()
    expect(body).toContain('SUMMARY:Violation hearing')
    expect(body).toContain('LOCATION:Clubhouse')
    expect(body).toContain('DESCRIPTION:Maple Grove HOA')
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(body).not.toMatch(/trash|ATTENDEE|ORGANIZER/i)
  })

  it('answers 404 for another resident’s hearing', async () => {
    expect((await call(NEIGHBOUR)).status).toBe(404)
  })

  it('answers 404 for an unknown id', async () => {
    expect((await call('2d8eab30-5c73-4e33-9f40-3b7c9a1e4d62')).status).toBe(404)
  })

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['past', { hearing_on: day(-3) }],
    ['not yet noticed', { notice_sent_on: null }],
  ])('answers 404 for a %s hearing', async (_n, over) => {
    h.hearings = [hearing(MINE, over)]
    expect((await call(MINE)).status).toBe(404)
  })

  it('answers 404 to a board account that owns no home', async () => {
    h.role = 'board'
    h.homes = []
    expect((await call(MINE)).status).toBe(404)
  })

  it('answers 404 for a hearing in another org', async () => {
    h.hearings = [hearing(MINE, { organization_id: 'org-2' })]
    expect((await call(MINE)).status).toBe(404)
  })

  it('answers 401 when signed out and 400/404 for a bad id', async () => {
    h.role = null
    expect((await call(MINE)).status).toBe(401)
    h.role = 'resident'
    expect([400, 404]).toContain((await call('not-a-uuid')).status)
  })
})
