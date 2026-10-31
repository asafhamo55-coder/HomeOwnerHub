import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/** A failed read is never shown as "none", 0, or a missing tenant. */
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

const { getPlatformStats, getTenantDetail, listPlatformAuditLog } = await import('./platform-admin')

const org = { id: 'org-a', name: 'A', hub_type: 'hoa', plan: 'pro', created_at: null, suspended_at: null }
const tables = {
  orgs: [org],
  org_members: [{ org_id: 'org-a', user_id: 'u1', role: 'admin' }],
  units: [{ id: 'u1', organization_id: 'org-a' }],
  vendors: [{ id: 'v1' }],
  ai_runs: [],
  platform_admin_audit: [
    { id: 'a1', actor_user_id: 'x', action: 'tenant.create', target_org_id: null, payload: null, created_at: '2026-01-01T00:00:00Z' },
  ],
}

describe('listPlatformAuditLog', () => {
  it('a failed read is ok:false, not an empty log', async () => {
    ;({ db } = cappedFakeDb(tables, { failAt: { table: 'platform_admin_audit' } }))
    expect(await listPlatformAuditLog()).toEqual({ ok: false })
  })
  it('success returns the rows', async () => {
    ;({ db } = cappedFakeDb(tables))
    const r = await listPlatformAuditLog()
    expect(r.ok && r.rows.map((x) => x.id)).toEqual(['a1'])
  })
  it('an empty table is ok with no rows', async () => {
    ;({ db } = cappedFakeDb({ ...tables, platform_admin_audit: [] }))
    expect(await listPlatformAuditLog()).toEqual({ ok: true, rows: [] })
  })
})

describe('getPlatformStats', () => {
  it.each([
    ['units', 'total_units'],
    ['vendors', 'total_vendors'],
  ] as const)('a failed %s count is null, not 0', async (table, key) => {
    ;({ db } = cappedFakeDb(tables, { failAt: { table } }))
    const s = await getPlatformStats()
    expect(s[key]).toBeNull()
    expect(s.total_tenants).toBe(1)
  })
  it('success keeps real counts', async () => {
    ;({ db } = cappedFakeDb(tables))
    const s = await getPlatformStats()
    expect(s).toMatchObject({ total_members: 1, total_units: 1, total_vendors: 1, ai_runs_30d: 0 })
  })
})

describe('getTenantDetail', () => {
  it('a failed org read is reason error, not a miss', async () => {
    ;({ db } = cappedFakeDb(tables, { failAt: { table: 'orgs' } }))
    expect(await getTenantDetail('org-a')).toEqual({ ok: false, reason: 'error' })
  })
  it('a real miss is not_found', async () => {
    ;({ db } = cappedFakeDb(tables))
    expect(await getTenantDetail('org-zzz')).toEqual({ ok: false, reason: 'not_found' })
  })
  it('success returns the tenant', async () => {
    ;({ db } = cappedFakeDb(tables))
    const r = await getTenantDetail('org-a')
    expect(r.ok && r.data.org.name).toBe('A')
  })
})
