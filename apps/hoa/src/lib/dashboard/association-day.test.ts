import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { getAtRiskThisWeek, getComplianceHeatMap, getNextMeetingResult } from './queries'
import { getDashboardKpis, getThirtyDayActivity } from './charts'

/**
 * BL-043: dashboard day math runs on the association's calendar. Pinned
 * at 23:30 Eastern on Oct 1 2026 — the UTC calendar already says Oct 2 —
 * with every instant absolute, so the machine's TZ never matters.
 */
const ORG = 'org-1'
const NOW = new Date('2026-10-02T03:30:00Z') // Thu Oct 1, 23:30 EDT
const FL = [{ id: 'assoc-1', organization_id: ORG, name: 'Palm Grove', state: 'FL' }]
const CA = [{ id: 'assoc-1', organization_id: ORG, name: 'Bay View', state: 'CA' }]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const charge = (id: string, due: string, status = 'open') => ({
  id,
  association_id: 'assoc-1',
  organization_id: ORG,
  deleted_at: null,
  due_date: due,
  status,
  amount: 100,
  unit_id: null,
  unit: null,
  payments: [],
})

describe('getComplianceHeatMap', () => {
  it('a charge due today is "due soon", not overdue, at 23:30 Eastern', async () => {
    const { db } = cappedFakeDb({ associations: FL, assessments: [charge('a1', '2026-10-01')], hoa_violations: [] })
    const r = await getComplianceHeatMap(ORG, db)
    expect(r.today).toBe('2026-10-01')
    const cell = r.cells.find((c) => c.day === '2026-10-01')
    expect(cell?.level).toBe('yellow')
  })

  it('yesterday is overdue; the window starts on the association month', async () => {
    const { db } = cappedFakeDb({ associations: FL, assessments: [charge('a1', '2026-09-30')], hoa_violations: [] })
    const r = await getComplianceHeatMap(ORG, db)
    // Sep 30 is outside an October window, so it is simply not drawn.
    expect(r.cells).toHaveLength(0)
  })

  it('a cure deadline counts from the notice day in the association zone', async () => {
    // Notice sent Sep 28 22:00 EDT (Sep 29 UTC) with a 3-day cure: due Oct 1.
    const { db } = cappedFakeDb({
      associations: FL,
      assessments: [],
      hoa_violations: [
        { id: 'v1', org_id: ORG, deleted_at: null, status: 'notice_sent', notice_sent_at: '2026-09-29T02:00:00Z', cure_period_days: 3 },
      ],
    })
    const r = await getComplianceHeatMap(ORG, db)
    expect(r.cells.map((c) => [c.day, c.level])).toEqual([['2026-10-01', 'yellow']])
  })
})

describe('getAtRiskThisWeek', () => {
  it('days overdue are whole association days', async () => {
    // Due Aug 31: 31 days before Oct 1 (Eastern). UTC math said 32.
    const { db } = cappedFakeDb({
      associations: FL,
      assessments: [charge('a1', '2026-08-31')],
      hoa_violations: [],
      vendor_compliance: [],
    })
    const r = await getAtRiskThisWeek(ORG, db)
    expect(r.items.map((i) => [i.kind, i.daysOffset])).toEqual([['dues_overdue', -31]])
  })

  it('a charge exactly 30 days old is not yet "overdue more than 30 days"', async () => {
    const { db } = cappedFakeDb({
      associations: FL,
      assessments: [charge('a1', '2026-09-01')],
      hoa_violations: [],
      vendor_compliance: [],
    })
    expect((await getAtRiskThisWeek(ORG, db)).items).toHaveLength(0)
  })

  it('a COI expiring today is 0 days out, not -1', async () => {
    const { db } = cappedFakeDb({
      associations: FL,
      assessments: [],
      hoa_violations: [],
      vendor_compliance: [{ vendor_id: 'v1', organization_id: ORG, coi_expiration_date: '2026-10-01', vendor: null }],
    })
    const r = await getAtRiskThisWeek(ORG, db)
    expect(r.items.map((i) => [i.kind, i.daysOffset, i.severity])).toEqual([['coi_expiring', 0, 'amber']])
  })
})

describe('getNextMeetingResult', () => {
  it("tonight's meeting is today (0 days), and still upcoming", async () => {
    const { db } = cappedFakeDb({
      associations: FL,
      hoa_meeting_minutes: [
        { id: 'm1', org_id: ORG, deleted_at: null, meeting_date: '2026-10-01', meeting_type: 'board', status: 'draft' },
      ],
    })
    const r = await getNextMeetingResult(ORG, db)
    expect(r.meeting).toMatchObject({ id: 'm1', daysUntil: 0 })
  })

  it("tomorrow's meeting is 1 day out for a Pacific association too", async () => {
    // 20:30 PDT Oct 1.
    const { db } = cappedFakeDb({
      associations: CA,
      hoa_meeting_minutes: [
        { id: 'm1', org_id: ORG, deleted_at: null, meeting_date: '2026-10-02', meeting_type: 'board', status: 'draft' },
      ],
    })
    expect((await getNextMeetingResult(ORG, db)).meeting).toMatchObject({ daysUntil: 1 })
  })
})

describe('getThirtyDayActivity', () => {
  it('a violation logged at 22:00 Eastern lands on that day, and the window ends today', async () => {
    const { db } = cappedFakeDb({
      associations: FL,
      hoa_violations: [{ id: 'v1', org_id: ORG, deleted_at: null, created_at: '2026-10-02T02:00:00Z' }],
      arc_requests: [],
      vendor_onboarding_invitations: [],
    })
    const a = await getThirtyDayActivity(ORG, db)
    expect(a.buckets).toHaveLength(30)
    expect(a.buckets[29]!.date).toBe('2026-10-01')
    expect(a.buckets[0]!.date).toBe('2026-09-02')
    expect(a.buckets[29]!.violations).toBe(1)
  })
})

describe('getDashboardKpis', () => {
  it('"outstanding 30+ days ago" is decided on calendar dates', async () => {
    const { db } = cappedFakeDb({
      associations: FL,
      assessments: [charge('a1', '2026-08-31'), charge('a2', '2026-09-01')],
    })
    const k = await getDashboardKpis(ORG, db)
    // Aug 31 is before Sep 1 (= Oct 1 − 30); Sep 1 is not.
    expect(k.duesOutstandingUsd.previous).toBe(100)
    expect(k.duesOutstandingUsd.value).toBe(200)
  })
})
