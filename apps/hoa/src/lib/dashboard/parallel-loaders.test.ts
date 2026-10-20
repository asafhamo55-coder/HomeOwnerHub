import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { heldDb, settle } from '@/lib/supabase/held-fake-db'
import { getDashboardKpis } from './charts'
import { getLeaseSummary } from './queries'

/**
 * BL-099 static pass: the dashboard's shared loaders send their
 * independent reads together. Each test holds one read open and checks
 * the others were already sent; awaited one after another, only the held
 * read would have started.
 */
const ORG = 'org-1'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

describe('getDashboardKpis', () => {
  const tables = {
    associations: [{ organization_id: ORG, name: 'A', state: 'FL' }],
    assessments: [
      { id: 'a1', organization_id: ORG, deleted_at: null, status: 'open', amount: 100, due_date: '2020-01-01', payments: [] },
    ],
    hoa_violations: [{ id: 'v1', org_id: ORG, deleted_at: null, status: 'open', created_at: '2020-01-01T00:00:00Z' }],
    vendors: [{ id: 'x1', organization_id: ORG, status: 'active' }],
    tickets: [{ id: 't1', organization_id: ORG, status: 'open', deleted_at: null }],
  }

  it('sends every KPI read while the time-zone read is still open', async () => {
    const { db } = cappedFakeDb(tables)
    const h = heldDb(db, ['associations'])
    const result = getDashboardKpis(ORG, h.db)
    await settle()
    expect(h.started).toEqual(
      expect.arrayContaining(['associations', 'assessments', 'hoa_violations', 'vendors', 'tickets']),
    )
    expect(h.started.filter((t) => t === 'hoa_violations')).toHaveLength(2)
    h.release()
    const kpis = await result
    // Same numbers as before the change.
    expect(kpis.failed).toBe(false)
    expect(kpis.duesOutstandingUsd).toEqual({ value: 100, previous: 100 })
    expect(kpis.openViolations).toEqual({ value: 1, previous: 1 })
    expect(kpis.activeVendors.value).toBe(1)
    expect(kpis.openTickets.value).toBe(1)
  })

  it('still reports failed when one parallel read errors', async () => {
    const { db } = cappedFakeDb(tables, { failAt: { table: 'tickets' } })
    const kpis = await getDashboardKpis(ORG, db)
    expect(kpis.failed).toBe(true)
    expect(kpis.openViolations.value).toBe(1)
  })
})

describe('getLeaseSummary', () => {
  const units = Array.from({ length: 600 }, (_, i) => ({
    id: id('u', i),
    association_id: 'assoc-1',
    legacy_hoa_property_id: id('p', i),
  }))
  const props = Array.from({ length: 600 }, (_, i) => ({
    id: id('p', i),
    deleted_at: null,
    tenure: i < 90 ? 'leased' : 'owner_occupied',
  }))
  const tables = {
    associations: [{ id: 'assoc-1', organization_id: ORG, lease_cap_pct: 25 }],
    units,
    hoa_properties: props,
    lease_waiting_list: [{ id: 'w1', association_id: 'assoc-1', status: 'waiting' }],
  }

  it('sends the waiting-list count while the units are still being read', async () => {
    const { db } = cappedFakeDb(tables)
    const h = heldDb(db, ['units'])
    const result = getLeaseSummary(ORG, h.db)
    await settle()
    expect(h.started).toContain('lease_waiting_list')
    h.release()
    expect((await result).waitingListCount).toBe(1)
  })

  it('sends every leased-count chunk at once, not one after another', async () => {
    const { db } = cappedFakeDb(tables)
    const h = heldDb(db, ['hoa_properties'])
    const result = getLeaseSummary(ORG, h.db)
    await settle()
    // 600 ids in chunks of 150: all four chunks are in flight together.
    expect(h.started.filter((t) => t === 'hoa_properties')).toHaveLength(4)
    h.release()
    const s = await result
    expect(s).toMatchObject({ failed: false, totalUnits: 600, leasedCount: 90, waitingListCount: 1 })
  })
})
