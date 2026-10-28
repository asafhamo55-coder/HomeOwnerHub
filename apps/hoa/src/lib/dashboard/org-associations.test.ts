import { describe, expect, it, vi } from 'vitest'

// React's cache() only memoizes inside a server request. Stand in for ONE
// request here: a zero-arg cache() is created once and reused, which is what
// a request scope is.
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>()
  return {
    ...actual,
    cache: <T extends (...a: never[]) => unknown>(fn: T): T => {
      let done = false
      let value: unknown
      return ((...a: never[]) => {
        if (!done) {
          value = fn(...a)
          done = true
        }
        return value
      }) as T
    },
  }
})

import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { getApprovalsInbox, getAtRiskThisWeek, getComplianceHeatMap, getLeaseSummary } from './queries'
import { getDashboardKpis, getThirtyDayActivity } from './charts'
import { createScope, dashboardOrgTimeZone, readOrgAssociations, readOrgAssociationsIn } from './org-associations'

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const tables = {
  associations: [
    { id: 'assoc-a', organization_id: ORG_A, name: 'Alpha', state: 'CA', lease_cap_pct: 25 },
    { id: 'assoc-b', organization_id: ORG_B, name: 'Beta', state: 'FL', lease_cap_pct: 10 },
  ],
  units: [],
  hoa_properties: [],
  lease_waiting_list: [],
  assessments: [],
  hoa_violations: [],
  vendors: [],
  tickets: [],
  hoa_meeting_minutes: [],
  invoices: [],
  rfps: [],
  vendor_compliance: [],
}

describe('org associations read (per request, per org)', () => {
  it('two org ids never share a result', async () => {
    const { db, calls } = cappedFakeDb(tables)
    const scope = createScope()
    const a = await readOrgAssociationsIn(scope, ORG_A, db, db)
    const b = await readOrgAssociationsIn(scope, ORG_B, db, db)
    expect(a.rows.map((r) => r.id)).toEqual(['assoc-a'])
    expect(b.rows.map((r) => r.id)).toEqual(['assoc-b'])
    expect(calls.filter((c) => c.table === 'associations')).toHaveLength(2)
  })

  it('the same org in the same scope reads once', async () => {
    const { db, calls } = cappedFakeDb(tables)
    const scope = createScope()
    await Promise.all([readOrgAssociationsIn(scope, ORG_A, db, db), readOrgAssociationsIn(scope, ORG_A, db, db)])
    expect(calls.filter((c) => c.table === 'associations')).toHaveLength(1)
  })

  it('a new scope (a new request) never reuses an old one', async () => {
    const { db, calls } = cappedFakeDb(tables)
    await readOrgAssociationsIn(createScope(), ORG_A, db, db)
    await readOrgAssociationsIn(createScope(), ORG_A, db, db)
    expect(calls.filter((c) => c.table === 'associations')).toHaveLength(2)
  })

  it('different clients in one scope do not share', async () => {
    const one = cappedFakeDb(tables)
    const two = cappedFakeDb(tables)
    const scope = createScope()
    await readOrgAssociationsIn(scope, ORG_A, one.db, one.db)
    await readOrgAssociationsIn(scope, ORG_A, two.db, two.db)
    expect(one.calls.filter((c) => c.table === 'associations')).toHaveLength(1)
    expect(two.calls.filter((c) => c.table === 'associations')).toHaveLength(1)
  })

  it('a failed read is returned, and the zone falls back to Eastern', async () => {
    const { db } = cappedFakeDb(tables, { failAt: { table: 'associations' } })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const read = await readOrgAssociations(ORG_A, db, db)
    expect(read.error).not.toBeNull()
    expect(read.rows).toEqual([])
    expect(await dashboardOrgTimeZone(ORG_A, db, db)).toBe('America/New_York')
    err.mockRestore()
  })
})

describe('a dashboard render reads associations once', () => {
  it('KPIs, activity, approvals, lease, heat map and at-risk share one read', async () => {
    const { db, calls } = cappedFakeDb(tables)
    await Promise.all([
      getDashboardKpis(ORG_A, db),
      getThirtyDayActivity(ORG_A, db),
      getApprovalsInbox(ORG_A, db),
      getLeaseSummary(ORG_A, db),
      getComplianceHeatMap(ORG_A, db),
      getAtRiskThisWeek(ORG_A, db),
    ])
    expect(calls.filter((c) => c.table === 'associations')).toHaveLength(1)
  })
})
