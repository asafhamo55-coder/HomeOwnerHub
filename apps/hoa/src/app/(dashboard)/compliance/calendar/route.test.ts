import { beforeEach, describe, expect, it, vi } from 'vitest'

const DENIED = 'Only board members and admins can make this change.'
let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = { ok: true, role: 'board', orgId: 'org-1' }
let signedIn = true

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/association-time', () => ({ todayIn: () => '2026-10-30' }))

const eqs: Array<[string, unknown]> = []
const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u1' } : null } }) },
  from: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        eqs.push([c, v])
        return b
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: [{ id: 'a1', name: 'Oak Hollow, HOA; Inc', state: 'GA', governing_law_state: null }],
          error: null,
        }).then(resolve),
    }
    return b
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: () => getSupabaseServerClient() }))

const policyOrgs: string[] = []
vi.mock('@/lib/insurance/queries', () => ({
  loadInsurancePolicies: vi.fn(async (_db: unknown, orgId: string) => {
    policyOrgs.push(orgId)
    return [
      {
        id: 'pol-1',
        associationId: 'a1',
        kind: 'property',
        carrier: 'Acme Mutual',
        policyNumber: 'SECRET-12345',
        coverageLimitCents: 1,
        deductibleCents: 1,
        premiumCents: 1,
        effectiveOn: null,
        expiresOn: '2027-02-01',
        documentId: null,
        notes: null,
      },
    ]
  }),
}))

import { GET } from './route'

const get = () => GET(new Request('http://x/compliance/calendar'))

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  signedIn = true
  eqs.length = 0
  policyOrgs.length = 0
})

describe('GET /compliance/calendar', () => {
  it('refuses a resident with 403 and an anonymous caller with 401', async () => {
    gate = { ok: false, error: DENIED }
    expect((await get()).status).toBe(403)
    gate = { ok: false, error: 'Not signed in' }
    signedIn = false
    expect((await get()).status).toBe(401)
  })

  it('returns an attachment named compliance-deadlines.ics', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/calendar/)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="compliance-deadlines.ics"')
  })

  it('pins associations and policies to the gate org', async () => {
    gate = { ok: true, role: 'admin', orgId: 'org-9' }
    const body = await (await get()).text()
    expect(eqs).toContainEqual(['organization_id', 'org-9'])
    expect(policyOrgs).toEqual(['org-9'])
    expect(body).toContain('UID:org-9-a1-')
    expect(body).not.toContain('org-1')
  })

  it('keeps UIDs stable across two calls and writes all-day dates', async () => {
    const uids = async () => (await (await get()).text()).split('\r\n').filter((l) => l.startsWith('UID:'))
    const first = await uids()
    expect(first.length).toBeGreaterThan(1)
    expect(await uids()).toEqual(first)
    const body = await (await get()).text()
    expect(body).toContain('DTSTART;VALUE=DATE:20270201')
    expect(body).toContain('DTEND;VALUE=DATE:20270202')
    expect(body).toContain('DTSTART;VALUE=DATE:20270101')
  })

  it('titles the policy by type, with no policy number, carrier or association commas leaking unescaped', async () => {
    const body = await (await get()).text()
    expect(body).toContain('SUMMARY:Insurance renewal: Master / property')
    expect(body).not.toContain('SECRET-12345')
    expect(body).not.toContain('Acme')
    expect(body).toContain('Oak Hollow\\, HOA\\; Inc')
    expect(body).not.toContain('Oak Hollow, HOA')
  })
})
