import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// The admin "enter owner portal" P0: an unsigned cookie + a service-role
// client + org-blind reads let any signed-up admin read any tenant's
// residents. These tests drive the real modules with next/headers,
// Supabase and the role lookup replaced, and assert three layers:
//   1. a cookie that is forged / from another org / for another user is ignored
//   2. enterResidentPortal refuses a target outside the admin's org
//   3. every impersonated (service-role) read carries the org filter

const SECRET = 'unit-test-secret'
const ORG_A = 'org-a'
const ORG_B = 'org-b'
const ADMIN_X = 'admin-x'

const h = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  userId: 'admin-x' as string | null,
  orgId: 'org-a' as string | null,
  role: 'admin' as 'admin' | 'board' | 'resident' | null,
  adminQueries: [] as Recorded[],
  adminRespond: null as null | ((q: Recorded) => { data: unknown; error: unknown } | undefined),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (h.cookies.has(name) ? { name, value: h.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void h.cookies.set(name, value),
    delete: (name: string) => void h.cookies.delete(name),
    getAll: () => [...h.cookies].map(([name, value]) => ({ name, value })),
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => (h.orgId ? { id: h.orgId, name: 'HOA', hub_type: 'hoa' } : null)),
  // getResidentActor reads the user through this memoized getUser (BL-099).
  getSignedInUser: vi.fn(async () => (h.userId ? { id: h.userId, email: 'me@x.test' } : null)),
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRoleInOrg: vi.fn(async () => h.role),
  requireAdmin: vi.fn(async () => {
    if (h.role !== 'admin' || !h.orgId) throw new Error('redirect:/')
    return { role: 'admin', org: { id: h.orgId, name: 'HOA' } }
  }),
  getCurrentUserRole: vi.fn(async () => (h.role && h.orgId ? { role: h.role, org: { id: h.orgId } } : null)),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client } = fakeSupabase()
    return {
      ...client,
      auth: { getUser: async () => ({ data: { user: h.userId ? { id: h.userId, email: 'me@x.test' } : null }, error: null }) },
    }
  }),
}))
vi.mock('@homeowner-portal/db', async (orig) => ({
  ...(await orig<object>()),
  createAdminClient: vi.fn(() => {
    const { client, queries } = fakeSupabase((q) => h.adminRespond?.(q))
    // Share the recording array so tests can inspect every admin query.
    const from = client.from
    return {
      ...client,
      from(table: string) {
        const b = from(table)
        h.adminQueries.push(queries[queries.length - 1]!)
        return b
      },
    }
  }),
}))

import { getImpersonationTarget, getResidentActor, IMPERSONATION_COOKIE } from './impersonation'
import { signImpersonationToken, verifyImpersonationToken } from './impersonation-token'
import { enterResidentPortal, exitResidentPortal } from './impersonation-actions'
import { getResidentUnits } from './resident'
import { getSignedInUser } from '@/lib/orgs'
import { loadMyTickets, getMyTicket } from './resident-tickets'
import {
  getMyArcRequest,
  getMyViolationReport,
  loadMyArcRequests,
  loadMyViolationReports,
} from './resident-submissions'
import { getResidentDues, getResidentLedger } from './resident-dashboard'
import { getResidentZelleSettings } from './pay-settings'

function token(over: Partial<Parameters<typeof signImpersonationToken>[0]> = {}): string {
  return signImpersonationToken(
    {
      orgId: ORG_A,
      actorUserId: ADMIN_X,
      userId: 'owner-1',
      email: 'owner_1@x.test',
      name: 'Owner',
      propertyId: null,
      ...over,
    },
    SECRET,
  )
}

beforeEach(() => {
  vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
  h.cookies.clear()
  h.userId = ADMIN_X
  h.orgId = ORG_A
  h.role = 'admin'
  h.adminQueries.length = 0
  h.adminRespond = null
})

describe('the impersonation cookie is never trusted on its own', () => {
  it('a valid token for this org + this admin impersonates, confined to that org', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token())
    const actor = await getResidentActor()
    expect(actor.impersonating).toBe(true)
    expect(actor.orgId).toBe(ORG_A)
    expect(actor.id).toBe('owner-1')
  })

  it('rejects a forged legacy JSON cookie', async () => {
    h.cookies.set(
      IMPERSONATION_COOKIE,
      JSON.stringify({ userId: 'victim', email: 'victim@x.test', name: 'V', propertyId: null }),
    )
    const actor = await getResidentActor()
    expect(actor.impersonating).toBe(false)
    expect(actor.id).toBe(ADMIN_X)
    expect(await getImpersonationTarget()).toBeNull()
  })

  it('reads the user through the shared, request-memoized getSignedInUser (BL-099)', async () => {
    vi.mocked(getSignedInUser).mockClear()
    const actor = await getResidentActor()
    expect(actor.id).toBe(ADMIN_X)
    // One memo for the layouts, the role checks and this resolver: no
    // second auth round trip of its own.
    expect(getSignedInUser).toHaveBeenCalled()
  })

  it('rejects a cookie issued in org A while the current org is B', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token({ orgId: ORG_A }))
    h.orgId = ORG_B
    expect((await getResidentActor()).impersonating).toBe(false)
  })

  it('rejects a cookie issued for admin X presented by user Y', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token({ actorUserId: ADMIN_X }))
    h.userId = 'user-y'
    expect((await getResidentActor()).impersonating).toBe(false)
  })

  it('rejects a valid token once the holder is no longer an admin', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token())
    h.role = 'board'
    expect((await getResidentActor()).impersonating).toBe(false)
  })

  it('rejects everything when no signing secret is configured', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token())
    vi.stubEnv('PAY_SETTINGS_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    expect((await getResidentActor()).impersonating).toBe(false)
  })
})

// Rows the admin client "has": owner-b owns unit-b in ORG_B only.
function crossOrgDb(q: Recorded) {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    units: [{ id: 'unit-b', organization_id: ORG_B }],
    ownerships: [
      { id: 'o', organization_id: ORG_B, unit_id: 'unit-b', owner_user_id: 'owner-b', owner_email: 'b@x.test', valid_to: null },
    ],
    property_residents: [],
    hoa_properties: [],
    profiles: [{ id: 'owner-b', email: 'b@x.test' }],
  }
  let out = rows[q.table] ?? []
  for (const [m, c, v] of q.ops) {
    if (m === 'eq') out = out.filter((r) => r[c as string] === v)
    if (m === 'is') out = out.filter((r) => (r[c as string] ?? null) === v)
    if (m === 'ilike') out = out.filter((r) => String(r[c as string]).toLowerCase() === String(v).replace(/\\(.)/g, '$1'))
  }
  return { data: out, error: null }
}

describe('enterResidentPortal refuses targets outside the admin org', () => {
  it.each([
    ['a unit in another org', { email: 'b@x.test', name: 'B', unitId: 'unit-b' }],
    ['an ownerUserId from another org', { email: 'b@x.test', name: 'B', ownerUserId: 'owner-b' }],
    ['an email only linked in another org', { email: 'b@x.test', name: 'B' }],
    ['a `%` wildcard email', { email: '%', name: 'any' }],
    ['a `%@%.%` wildcard email', { email: '%@%.%', name: 'any' }],
  ])('%s: no cookie is set', async (_label, input) => {
    h.adminRespond = crossOrgDb
    const res = await enterResidentPortal(input)
    expect(res).toEqual({ ok: false, error: expect.any(String) })
    expect(h.cookies.has(IMPERSONATION_COOKIE)).toBe(false)
  })

  it('a non-admin is refused before anything is resolved', async () => {
    h.role = 'board'
    await expect(enterResidentPortal({ email: 'b@x.test', name: 'B' })).rejects.toThrow('redirect:/')
    expect(h.cookies.has(IMPERSONATION_COOKIE)).toBe(false)
  })

  it('an owner in the admin org gets a SIGNED cookie bound to (org, admin)', async () => {
    h.orgId = ORG_B // admin of org B, owner-b owns unit-b there
    h.adminRespond = crossOrgDb
    await expect(
      enterResidentPortal({ email: 'B@x.test', name: 'B', unitId: 'unit-b' }),
    ).rejects.toThrow('redirect:/resident')
    const raw = h.cookies.get(IMPERSONATION_COOKIE)!
    expect(() => JSON.parse(raw)).toThrow() // not bare JSON any more
    const claims = verifyImpersonationToken(raw, SECRET, { orgId: ORG_B, actorUserId: ADMIN_X })
    expect(claims).toMatchObject({ orgId: ORG_B, actorUserId: ADMIN_X, userId: 'owner-b', email: 'b@x.test' })
  })

  it('exit clears the cookie', async () => {
    h.cookies.set(IMPERSONATION_COOKIE, token())
    await expect(exitResidentPortal()).rejects.toThrow('redirect:/')
    expect(h.cookies.has(IMPERSONATION_COOKIE)).toBe(false)
  })
})

describe('every impersonated read is confined to the impersonation org', () => {
  beforeEach(() => {
    h.cookies.set(IMPERSONATION_COOKIE, token())
  })

  function queriesOn(table: string) {
    return h.adminQueries.filter((q) => q.table === table)
  }

  function expectOrgFiltered(table: string, column = 'organization_id') {
    const qs = queriesOn(table)
    expect(qs.length, `no ${table} query recorded`).toBeGreaterThan(0)
    for (const q of qs) expect(hasEq(q, column, ORG_A), `${table} read lacks ${column}=${ORG_A}`).toBe(true)
  }

  it('getResidentUnits: ownerships + email fallback (exact, escaped) + unit links', async () => {
    h.adminRespond = (q) =>
      q.table === 'property_residents'
        ? { data: [{ property_id: 'p1', role: 'owner', moved_in_at: null, property: { id: 'p1', address: 'a', unit_number: null, org_id: ORG_A } }], error: null }
        : undefined
    await getResidentUnits()
    expectOrgFiltered('ownerships')
    expectOrgFiltered('property_residents')
    expectOrgFiltered('units')
    const pr = queriesOn('property_residents')[0]!
    const ilike = pr.ops.find(([m]) => m === 'ilike')!
    expect(ilike[2]).toBe('owner\\_1@x.test') // `_` escaped: exact match only
  })

  it('drops a property_residents row whose property belongs to another org', async () => {
    h.adminRespond = (q) =>
      q.table === 'property_residents'
        ? { data: [{ property_id: 'p9', role: 'owner', moved_in_at: null, property: { id: 'p9', address: 'a', unit_number: null, org_id: ORG_B } }], error: null }
        : undefined
    expect(await getResidentUnits()).toEqual([])
  })

  it('tickets list + detail', async () => {
    await loadMyTickets()
    await getMyTicket('t1')
    expectOrgFiltered('tickets')
  })

  it('ARC requests list + detail', async () => {
    await loadMyArcRequests()
    await getMyArcRequest('a1')
    expectOrgFiltered('arc_requests')
  })

  it('violation reports list + detail', async () => {
    await loadMyViolationReports()
    await getMyViolationReport('r1')
    expectOrgFiltered('resident_violation_reports')
  })

  it('dues + ledger (assessments, payments)', async () => {
    h.adminRespond = (q) => {
      if (q.table === 'ownerships') {
        return { data: [{ unit_id: 'u1', ownership_pct: null, valid_from: '2024-01-01', unit: null }], error: null }
      }
      if (q.table === 'assessments') {
        return { data: [{ id: 'as1', unit_id: 'u1', amount: 10, due_date: '2026-01-01', status: 'open', assessment_type: 'regular', memo_code: null }], error: null }
      }
      return undefined
    }
    await getResidentDues()
    await getResidentLedger()
    expectOrgFiltered('assessments')
    expectOrgFiltered('payments')
  })

  it('Zelle pay settings', async () => {
    await getResidentZelleSettings(['assoc-1'])
    expectOrgFiltered('associations')
  })
})
