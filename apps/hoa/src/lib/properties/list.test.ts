import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { parsePropertyListParams } from './list-params'
import { listProperties, readPropertyRows } from './list'

const ORG = 'org-1'
const NOW = new Date('2026-10-17T12:00:00Z')

const viewRow = (i: number, over: Record<string, unknown> = {}) => ({
  id: `p${i}`,
  org_id: ORG,
  address: `${i} Elm St`,
  unit_number: null,
  owner_name: `Owner ${i}`,
  owner_email: `owner${i}@example.test`,
  owner_phone: null,
  tenure: 'owner_occupied',
  unit_id: `u${i}`,
  balance: 0,
  oldest_due_date: null,
  days_overdue: 0,
  open_violations: 0,
  violations_past_cure: 0,
  threads_needing_reply: 0,
  has_owner: true,
  has_tenure: true,
  has_unit_link: true,
  severity_rank: 6,
  needs_attention: false,
  on_waiting_list: false,
  ...over,
})

function db(opts: { failSignals?: boolean } = {}) {
  const view = Array.from({ length: 1200 }, (_, i) => viewRow(i + 1))
  view[4] = viewRow(5, { owner_phone: '(555) 010-1234' })
  return cappedFakeDb(
    {
      hoa_property_list_v: view,
      property_residents: [
        { id: 'r1', organization_id: ORG, property_id: 'p7', full_name: 'Jordan Tenant', email: 'jt@example.test', phone: null, moved_out_at: null, deleted_at: null },
        { id: 'r2', organization_id: ORG, property_id: 'p8', full_name: 'Jordan Former', email: null, phone: null, moved_out_at: '2026-01-01', deleted_at: null },
      ],
      units: view.map((v) => ({ id: v.unit_id, organization_id: ORG, legacy_hoa_property_id: v.id })),
      arc_requests: [{ id: 'a1', organization_id: ORG, unit_id: 'u3', status: 'submitted', submitted_at: '2026-10-10T00:00:00Z', board_response_at: null, deleted_at: null }],
      property_events: [],
      hoa_violations: [],
      inbox_threads: [],
      payments: [],
    },
    opts.failSignals ? { failAt: { table: 'arc_requests' } } : {},
  )
}

describe('readPropertyRows search', () => {
  it('reads the whole roster past the row cap when there is no search', async () => {
    const { db: d } = db()
    expect(await readPropertyRows(d, ORG, '')).toHaveLength(1200)
  })

  it('finds a home by a current resident’s name, not a moved-out one', async () => {
    const { db: d } = db()
    expect((await readPropertyRows(d, ORG, 'jordan')).map((r) => r.id)).toEqual(['p7'])
  })

  it('finds a home by the owner’s phone, however it is typed', async () => {
    const { db: d } = db()
    expect((await readPropertyRows(d, ORG, '555-010-1234')).map((r) => r.id)).toEqual(['p5'])
  })

  it('does not read residents when there is no search', async () => {
    const { db: d, calls } = db()
    await readPropertyRows(d, ORG, '')
    expect(calls.some((c) => c.table === 'property_residents')).toBe(false)
  })
})

describe('listProperties', () => {
  it('merges open ARC and last activity, and the association size comes from the same read', async () => {
    const { db: d } = db()
    const r = await listProperties(d, ORG, parsePropertyListParams({ sort: 'arc' }), NOW)
    expect(r.signalsOk).toBe(true)
    expect(r.rows[0]).toMatchObject({ id: 'p3', openArc: 1, lastActivityAt: '2026-10-10T00:00:00Z' })
    expect(r.rows[1].openArc).toBe(0)
    expect(r.allCount).toBe(1200)
  })

  it('a search narrows the rows but the association size stays the whole roster', async () => {
    const { db: d } = db()
    const r = await listProperties(d, ORG, parsePropertyListParams({ q: 'jordan' }), NOW)
    expect(r.total).toBe(1)
    expect(r.allCount).toBe(1200)
  })

  it('a failed signal read keeps the list, with ARC and activity unknown rather than 0', async () => {
    const { db: d } = db({ failSignals: true })
    const r = await listProperties(d, ORG, parsePropertyListParams({}), NOW)
    expect(r.signalsOk).toBe(false)
    expect(r.rows).toHaveLength(50)
    expect(r.rows.every((row) => row.openArc === null && row.lastActivityAt === null)).toBe(true)
  })
})
