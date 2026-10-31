import { describe, expect, it, vi } from 'vitest'

// A failed read must come back as a failure, never as an empty list: the
// invite panel would otherwise say "No invitations yet" or build a send
// list from nothing.

const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: { code: string } | null }>,
}))

function builder(table: string) {
  const q: Record<string, unknown> = {}
  const chain = () => q
  Object.assign(q, {
    select: chain,
    eq: chain,
    in: chain,
    neq: chain,
    order: chain,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(res, rej),
  })
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: (t: string) => builder(t) })),
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, orgId: 'org-1' })),
}))
vi.mock('@/lib/org-owned', () => ({ checkOrgOwned: vi.fn(async () => 'owned') }))
vi.mock('@/lib/api/log', () => ({ logRouteFailure: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { listInvitableVendors, listRfpInvitations } = await import('./rfp-invitations')
const { isReadFailed } = await import('./rfp-invitation-view')

const FAIL = { data: null, error: { code: '57014' } }
const vendorRow = { id: 'v1', legal_name: 'Acme', trades: null, status: 'active', primary_email: 'a@x.com' }

describe('listInvitableVendors read failures', () => {
  it('vendors read fails: failure, not an empty list', async () => {
    h.tables = { vendors: FAIL }
    expect(isReadFailed(await listInvitableVendors('r', 'a'))).toBe(true)
  })
  it('invitation read fails: failure, so invited vendors are not offered again', async () => {
    h.tables = { vendors: { data: [vendorRow], error: null }, rfp_invitations: FAIL }
    expect(isReadFailed(await listInvitableVendors('r', 'a'))).toBe(true)
  })
  it('compliance read fails: failure', async () => {
    h.tables = { vendors: { data: [vendorRow], error: null }, vendor_compliance: FAIL }
    expect(isReadFailed(await listInvitableVendors('r', 'a'))).toBe(true)
  })
  it('healthy reads return vendors with has_email', async () => {
    h.tables = {
      vendors: { data: [vendorRow, { ...vendorRow, id: 'v2', primary_email: null }], error: null },
    }
    const out = await listInvitableVendors('r', 'a')
    expect(isReadFailed(out)).toBe(false)
    expect((out as Array<{ id: string; has_email: boolean }>).map((v) => [v.id, v.has_email])).toEqual([
      ['v1', true],
      ['v2', false],
    ])
  })
  it('a genuinely empty vendor list stays an empty list', async () => {
    h.tables = { vendors: { data: [], error: null } }
    expect(await listInvitableVendors('r', 'a')).toEqual([])
  })
})

describe('listRfpInvitations read failures', () => {
  const inv = { id: 'i1', vendor_id: 'v1', invited_at: '2026-10-01', acknowledged_at: null, vendor: { legal_name: 'Acme' } }
  it('invitations read fails: failure, not "none yet"', async () => {
    h.tables = { rfp_invitations: FAIL }
    expect(isReadFailed(await listRfpInvitations('r'))).toBe(true)
  })
  it('bids read fails: failure, not "no bid yet"', async () => {
    h.tables = { rfp_invitations: { data: [inv], error: null }, bids: FAIL }
    expect(isReadFailed(await listRfpInvitations('r'))).toBe(true)
  })
  it('healthy reads return rows', async () => {
    h.tables = { rfp_invitations: { data: [inv], error: null }, bids: { data: [], error: null } }
    const out = await listRfpInvitations('r')
    expect(isReadFailed(out)).toBe(false)
    expect(out).toHaveLength(1)
  })
})
