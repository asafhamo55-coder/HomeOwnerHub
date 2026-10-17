import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-053, platform-admin metrics: every cross-tenant number below is
 * counted from rows, and each was a single service-role read that
 * PostgREST caps at 1000 rows — so "units under management", tenant
 * health and the 30-day AI usage all topped out at 1000 with no sign.
 * The fake enforces that cap; every fixture is over it.
 */
let db: SupabaseClient
const userClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
  rpc: async () => ({ data: true, error: null }),
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => userClient }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => db }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), appUrl: () => 'http://localhost' }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getAnalyticsData, getPlatformStats, getTenantDetail, getTenantPreview, listTenants } = await import(
  './platform-admin'
)

const N = 2345
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
const recent = new Date().toISOString()
const many = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))

const tables = {
  orgs: many(N, (i) => ({ id: id('org', i), name: 'o', plan: 'pro', created_at: recent, suspended_at: null })),
  org_members: many(N, (i) => ({ org_id: 'org00000', user_id: id('user', i), role: 'resident', invited_at: recent })),
  units: many(N, (i) => ({ id: id('u', i), organization_id: 'org00000' })),
  associations: many(N, (i) => ({ id: id('a', i), organization_id: 'org00000' })),
  vendor_compliance: many(N, (i) => ({ id: id('vc', i), organization_id: 'org00000', coi_status: 'green' })),
  hoa_violations: many(N, (i) => ({ id: id('v', i), org_id: 'org00000', status: 'open', created_at: recent })),
  ai_runs: many(N, (i) => ({ id: id('ai', i), organization_id: 'org00000', workflow_id: 'W1', created_at: recent })),
  assessments: many(N, (i) => ({ id: id('as', i), organization_id: 'org00000', amount: 10, status: 'open', payments: [] })),
  rfps: many(N, (i) => ({ id: id('rfp', i), organization_id: 'org00000', status: 'draft' })),
  bids: many(N, (i) => ({ id: id('bid', i), organization_id: 'org00000', status: 'submitted' })),
  arc_requests: many(N, (i) => ({ id: id('arc', i), organization_id: 'org00000', submitted_at: recent })),
  hoa_documents: many(N, (i) => ({ id: id('d', i), org_id: 'org00000' })),
  hoa_dues: many(N, (i) => ({ id: id('due', i), org_id: 'org00000', amount_due: 10, amount_paid: 0, status: 'open' })),
  vendor_onboarding_invitations: many(N, (i) => ({ id: id('inv', i), organization_id: 'org00000', created_at: recent })),
  platform_admin_audit: [],
}

describe('platform-admin metrics read past the row cap', () => {
  it('getPlatformStats counts every tenant and every AI run', async () => {
    ;({ db } = cappedFakeDb(tables))
    const s = await getPlatformStats()
    expect(s.total_tenants).toBe(N)
    expect(s.workflows_30d).toEqual([{ workflow_id: 'W1', runs: N }])
  })

  it('getAnalyticsData totals every row of every table', async () => {
    ;({ db } = cappedFakeDb(tables))
    const a = await getAnalyticsData()
    expect(a.total_tenants).toBe(N)
    expect(a.total_members).toBe(N)
    expect(a.total_units).toBe(N)
    expect(a.total_vendors).toBe(N)
    expect(a.total_violations).toBe(N)
    expect(a.total_ai_runs_30d).toBe(N)
    expect(a.total_outstanding_dues_usd).toBe(N * 10)
    const t = a.tenant_health.find((h) => h.id === 'org00000')
    expect(t).toMatchObject({ members: N, units: N, associations: N, vendors: N, open_violations: N })
  })

  it('getTenantDetail counts every row for the tenant', async () => {
    ;({ db } = cappedFakeDb(tables))
    const d = await getTenantDetail('org00000')
    expect(d?.members.total).toBe(N)
    expect(d?.vendors.total).toBe(N)
    expect(d?.rfps.total).toBe(N)
    expect(d?.bids.total).toBe(N)
    expect(d?.violations.open).toBe(N)
    expect(d?.dues.outstanding_usd).toBe(N * 10)
  })

  it('getTenantDetail counts only that tenant’s documents', async () => {
    const docs = [...tables.hoa_documents, { id: 'd-other', org_id: 'org-other' }]
    ;({ db } = cappedFakeDb({ ...tables, hoa_documents: docs }))
    const d = await getTenantDetail('org00000')
    expect(d?.documents).toBe(N)
  })

  it('listTenants counts every unit and member per tenant', async () => {
    ;({ db } = cappedFakeDb(tables))
    const rows = await listTenants()
    expect(rows).toHaveLength(N)
    expect(rows.find((r) => r.id === 'org00000')).toMatchObject({ member_count: N, association_count: N, units_count: N })
  })

  it('getTenantPreview charts every violation and vendor', async () => {
    ;({ db } = cappedFakeDb(tables))
    const p = await getTenantPreview('org00000')
    expect(p?.violations_donut.total).toBe(N)
    expect(p?.vendor_compliance_donut.total).toBe(N)
    expect(p?.activity_30d.reduce((s, b) => s + b.violations, 0)).toBe(N)
    expect(p?.activity_30d.reduce((s, b) => s + b.arc, 0)).toBe(N)
    expect(p?.activity_30d.reduce((s, b) => s + b.invitations, 0)).toBe(N)
  })

  it('a failed later page throws instead of reporting a smaller number', async () => {
    // units was the paged table here until BL-057 made it a head count.
    ;({ db } = cappedFakeDb(tables, { failAt: { table: 'vendor_compliance', from: 1000 } }))
    await expect(getAnalyticsData()).rejects.toThrow(/57014/)
  })
})
