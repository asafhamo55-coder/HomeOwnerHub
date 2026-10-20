import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cappedFakeDb, rangesFor } from '@/lib/supabase/capped-fake-db'
import {
  getAtRiskThisWeek,
  getCommunitySnapshot,
  getComplianceHeatMap,
  getLeaseSummary,
} from './queries'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getTicketCategoryDonut,
  getViolationStatusDonut,
} from './charts'

/**
 * BL-047: every dashboard number computed from rows must come from ALL the
 * rows. The fake caps each response at 1000 like PostgREST's max_rows; a
 * fixture over the cap proves the function pages to the end, and a failed
 * later page proves it reports `failed` instead of a smaller number.
 */
const ORG = 'org-1'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const dayIso = (n: number) => daysAgo(n).slice(0, 10)
const as = <T>(rows: T[]) => rows as unknown as Record<string, unknown>[]

const assoc = [{ id: 'assoc-1', organization_id: ORG, lease_cap_pct: 25 }]

describe('getLeaseSummary', () => {
  const units = Array.from({ length: 2500 }, (_, i) => ({
    id: id('u', i),
    association_id: 'assoc-1',
    legacy_hoa_property_id: id('p', i),
  }))
  const props = Array.from({ length: 2500 }, (_, i) => ({
    id: id('p', i),
    deleted_at: null,
    tenure: i < 600 ? 'leased' : 'owner_occupied',
  }))

  it('counts every unit and every leased property past the 1000-row cap', async () => {
    const { db, calls } = cappedFakeDb({ associations: assoc, units, hoa_properties: as(props) })
    const s = await getLeaseSummary(ORG, db)
    expect(s.failed).toBe(false)
    expect(s.totalUnits).toBe(2500)
    expect(s.leasedCount).toBe(600)
    expect(s.headroom).toBe(Math.floor(0.25 * 2500) - 600)
    expect(rangesFor(calls, 'units').length).toBeGreaterThan(2)
    // The id list is chunked so a 2500-id `.in()` never builds one huge URL.
    const inSizes = calls
      .filter((c) => c.table === 'hoa_properties')
      .map((c) => (c.ops.find((o) => o[0] === 'in')?.[2] as unknown[]).length)
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(150)
  })

  it('a failed units page reports failed, not a smaller denominator', async () => {
    const { db } = cappedFakeDb(
      { associations: assoc, units, hoa_properties: as(props) },
      { failAt: { table: 'units', from: 1000 } },
    )
    const s = await getLeaseSummary(ORG, db)
    expect(s.failed).toBe(true)
  })
})

describe('getCommunitySnapshot', () => {
  const props = Array.from({ length: 1500 }, (_, i) => ({ id: id('p', i), org_id: ORG, deleted_at: null }))
  const residents = Array.from({ length: 2300 }, (_, i) => ({
    id: id('r', i),
    organization_id: ORG,
    deleted_at: null,
    moved_out_at: null,
    property_id: id('p', i % 1500),
  }))

  it('counts 1500 properties and 2300 residents, not 1000 of each', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props, property_residents: residents })
    const s = await getCommunitySnapshot(ORG, db)
    expect(s).toEqual({ propertyCount: 1500, residentCount: 2300, failed: false })
  })

  it('a failed later page is failed, not a smaller roster', async () => {
    const { db } = cappedFakeDb(
      { hoa_properties: props, property_residents: residents },
      { failAt: { table: 'hoa_properties', from: 1000 } },
    )
    expect((await getCommunitySnapshot(ORG, db)).failed).toBe(true)
  })
})

describe('getAtRiskThisWeek', () => {
  const overdue = Array.from({ length: 1500 }, (_, i) => ({
    id: id('a', i),
    association_id: 'assoc-1',
    deleted_at: null,
    status: 'open',
    due_date: dayIso(45),
    amount: 100,
    unit_id: id('u', i),
    unit: { unit_number: String(i) },
  }))
  const violations = Array.from({ length: 1200 }, (_, i) => ({
    id: id('v', i),
    org_id: ORG,
    deleted_at: null,
    status: 'notice_sent',
    notice_sent_at: daysAgo(40),
    cure_period_days: 14,
    description: null,
    property: null,
  }))

  it('counts every delinquent unit and every elapsed cure deadline', async () => {
    const { db } = cappedFakeDb({ associations: assoc, assessments: overdue, hoa_violations: violations, vendor_compliance: [] })
    const r = await getAtRiskThisWeek(ORG, db)
    expect(r.failed).toBe(false)
    expect(r.counts.duesOverdueUnits).toBe(1500)
    expect(r.counts.cureDeadlinesElapsed).toBe(1200)
    expect(r.totalCount).toBe(2700)
  })

  it('counts expired and expiring vendor certificates separately, active/prospect vendors only (BL-083)', async () => {
    const coi = (i: number, day: string, status = 'active', deleted_at: string | null = null) => ({
      id: id('c', i),
      vendor_id: id('vd', i),
      organization_id: ORG,
      coi_expiration_date: day,
      vendor: { legal_name: `Vendor ${i}`, status, deleted_at },
    })
    const rows = [
      coi(1, dayIso(10)), // expired 10 days ago
      coi(2, dayIso(-5)), // expires in 5 days
      coi(3, dayIso(400)), // long expired, still active: still listed
      coi(4, dayIso(3), 'inactive'), // inactive: skipped
      coi(5, dayIso(3), 'active', daysAgo(1)), // deleted: skipped
      coi(6, dayIso(-90)), // 90 days out: not yet
    ]
    const { db } = cappedFakeDb({ associations: assoc, assessments: [], hoa_violations: [], vendor_compliance: as(rows) })
    const r = await getAtRiskThisWeek(ORG, db)
    expect(r.failed).toBe(false)
    expect(r.counts.coiExpired).toBe(2)
    expect(r.counts.coiExpiring).toBe(1)
    const titles = r.items.filter((i) => i.kind === 'coi_expiring').map((i) => [i.title, i.severity])
    expect(titles).toContainEqual(['COI expired · Vendor 1', 'red'])
    expect(titles).toContainEqual(['COI expiring · Vendor 2', 'amber'])
  })

  it('a failed later page is failed', async () => {
    const { db } = cappedFakeDb(
      { associations: assoc, assessments: overdue, hoa_violations: violations, vendor_compliance: [] },
      { failAt: { table: 'assessments', from: 1000 } },
    )
    expect((await getAtRiskThisWeek(ORG, db)).failed).toBe(true)
  })
})

describe('getComplianceHeatMap', () => {
  // Pinned mid-day: "overdue" is judged on the association's calendar
  // (BL-043), so a wall-clock run after 8pm Eastern would turn the UTC
  // "yesterday" below into the association's today.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T16:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sees an overdue charge that sorts after the first 1000 rows', async () => {
    const today = new Date()
    const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const paid = Array.from({ length: 1200 }, (_, i) => ({
      id: id('a', i),
      association_id: 'assoc-1',
      deleted_at: null,
      due_date: firstOfMonth,
      status: 'paid',
    }))
    const late = { id: id('z', 0), association_id: 'assoc-1', deleted_at: null, due_date: dayIso(1), status: 'open' }
    const { db } = cappedFakeDb({ associations: assoc, assessments: [...paid, late], hoa_violations: [] })
    const r = await getComplianceHeatMap(ORG, db)
    expect(r.failed).toBe(false)
    const lateCell = r.cells.find((c) => c.day === late.due_date)
    // Only when the due date falls inside the rendered window (it does unless today is the 1st).
    if (late.due_date >= firstOfMonth) expect(lateCell?.level).toBe('red')
    expect(r.cells.find((c) => c.day === firstOfMonth)?.notes.length).toBe(
      late.due_date === firstOfMonth ? 1201 : 1200,
    )
  })
})

describe('getDashboardKpis', () => {
  const open = Array.from({ length: 2400 }, (_, i) => ({
    id: id('a', i),
    organization_id: ORG,
    deleted_at: null,
    status: 'open',
    amount: 100,
    due_date: dayIso(i % 2 === 0 ? 60 : 5),
    payments: [{ amount: 25 }],
  }))

  it('sums the outstanding balance of every open charge', async () => {
    const { db } = cappedFakeDb({ assessments: open })
    const k = await getDashboardKpis(ORG, db)
    expect(k.failed).toBe(false)
    expect(k.duesOutstandingUsd.value).toBe(2400 * 75)
    expect(k.duesOutstandingUsd.previous).toBe(1200 * 75)
  })

  it('a failed later page is failed', async () => {
    const { db } = cappedFakeDb({ assessments: open }, { failAt: { table: 'assessments', from: 1000 } })
    expect((await getDashboardKpis(ORG, db)).failed).toBe(true)
  })
})

describe('dashboard charts', () => {
  const violations = Array.from({ length: 1800 }, (_, i) => ({
    id: id('v', i),
    org_id: ORG,
    deleted_at: null,
    status: i < 1300 ? 'open' : 'cured',
    created_at: daysAgo(2),
  }))
  const tickets = Array.from({ length: 1100 }, (_, i) => ({
    id: id('t', i),
    organization_id: ORG,
    deleted_at: null,
    category: i < 1050 ? 'maintenance' : 'noise',
  }))

  it('the violations donut totals every violation', async () => {
    const { db } = cappedFakeDb({ hoa_violations: violations })
    const d = await getViolationStatusDonut(ORG, db)
    expect(d.failed).toBe(false)
    expect(d.total).toBe(1800)
  })

  it('the tickets donut totals every ticket', async () => {
    const { db } = cappedFakeDb({ tickets })
    const d = await getTicketCategoryDonut(ORG, db)
    expect(d.failed).toBe(false)
    expect(d.total).toBe(1100)
  })

  it('30-day activity counts every violation in the window', async () => {
    const { db } = cappedFakeDb({ hoa_violations: violations, arc_requests: [], vendor_onboarding_invitations: [] })
    const a = await getThirtyDayActivity(ORG, db)
    expect(a.failed).toBe(false)
    expect(a.buckets.reduce((s, b) => s + b.violations, 0)).toBe(1800)
  })

  it('a failed later page fails the donut', async () => {
    const { db } = cappedFakeDb({ hoa_violations: violations }, { failAt: { table: 'hoa_violations', from: 1000 } })
    const d = await getViolationStatusDonut(ORG, db)
    expect(d).toEqual({ segments: [], total: 0, failed: true })
  })
})
