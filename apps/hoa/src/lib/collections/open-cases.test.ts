import { describe, expect, it } from 'vitest'
import { todayIn } from '@/lib/association-time'
import { latestMailDelivery, sortOpenCases, withDays, type OpenCaseInput } from './open-cases'
import { listOpenCases } from './queries'

const base: OpenCaseInput = {
  caseId: 'c1',
  unitId: 'u1',
  linkId: 'p1',
  unitLabel: '101',
  status: 'collection_letter',
  attorneyFirm: null,
  openedOn: '2026-01-01',
  lastEventOn: null,
  lastEventType: null,
  mailDeliveredOn: null,
}

describe('withDays', () => {
  it('counts calendar days across the spring DST change', () => {
    const r = withDays({ ...base, openedOn: '2026-03-07', lastEventOn: '2026-03-08' }, '2026-03-09')
    expect(r.daysOpen).toBe(2)
    expect(r.daysSinceLastEvent).toBe(1)
  })

  it('counts calendar days across the fall DST change', () => {
    expect(withDays({ ...base, openedOn: '2026-10-31' }, '2026-11-02').daysOpen).toBe(2)
  })

  it('uses the association day, not the UTC day, for today', () => {
    // 2026-03-08 03:30 UTC is still 2026-03-07 in Los Angeles.
    const now = new Date('2026-03-08T03:30:00Z')
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-03-07')
    expect(withDays({ ...base, openedOn: '2026-03-07' }, todayIn('America/Los_Angeles', now)).daysOpen).toBe(0)
  })

  it('falls back to the opened date when there are no events', () => {
    expect(withDays({ ...base, openedOn: '2026-01-01' }, '2026-01-11').daysSinceLastEvent).toBe(10)
  })

  it('counts the mail clock from the delivery day', () => {
    expect(withDays({ ...base, mailDeliveredOn: '2026-01-01' }, '2026-01-31').mailClockDay).toBe(30)
    expect(withDays(base, '2026-01-31').mailClockDay).toBeNull()
  })
})

describe('sortOpenCases', () => {
  const mk = (id: string, label: string, opened: string, last: string | null) =>
    withDays({ ...base, caseId: id, unitLabel: label, openedOn: opened, lastEventOn: last }, '2026-06-01')

  it('puts the longest since last event first, then older cases, then unit label', () => {
    const rows = [
      mk('a', '2', '2026-05-01', '2026-05-30'),
      mk('b', '10', '2026-01-01', '2026-04-01'),
      mk('c', '9', '2026-02-01', '2026-04-01'),
      mk('d', '3', '2026-01-01', '2026-04-01'),
    ]
    expect(sortOpenCases(rows).map((r) => r.caseId)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const rows = [mk('a', '1', '2026-05-01', '2026-05-30'), mk('b', '2', '2026-01-01', '2026-02-01')]
    sortOpenCases(rows)
    expect(rows.map((r) => r.caseId)).toEqual(['a', 'b'])
  })
})

describe('latestMailDelivery', () => {
  it('takes the newest statutory delivery and ignores other methods', () => {
    const rec = (method: 'certified' | 'first_class', deliveredOn: string | null) => ({
      method,
      trackingNumber: null,
      mailedOn: null,
      deliveredOn,
    })
    expect(
      latestMailDelivery([rec('certified', '2026-02-01'), rec('certified', '2026-03-01'), rec('first_class', '2026-04-01')]),
    ).toBe('2026-03-01')
    expect(latestMailDelivery([])).toBeNull()
  })
})

/** Records every filter applied to each table so the test can assert org scoping. */
function mockClient(tables: Record<string, Record<string, unknown>[]>) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = []
  const client = {
    from(table: string) {
      const call = { table, eq: [] as Array<[string, unknown]> }
      calls.push(call)
      const q: Record<string, unknown> = {}
      const chain = () => q
      q.select = chain
      q.is = chain
      q.not = chain
      q.in = chain
      q.order = chain
      q.eq = (k: string, v: unknown) => (call.eq.push([k, v]), q)
      q.range = (from: number) => Promise.resolve({ data: from === 0 ? (tables[table] ?? []) : [], error: null })
      // propertyIdsForUnits awaits the query without .range().
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null })
      return q
    },
  }
  return { client: client as never, calls }
}

describe('listOpenCases', () => {
  it('scopes every read to the org', async () => {
    const { client, calls } = mockClient({
      collection_cases: [
        { id: 'c1', unit_id: 'u1', status: 'lien_letter', attorney_firm: 'Firm A', opened_on: '2026-01-01' },
        { id: 'c2', unit_id: 'u2', status: 'monitoring', attorney_firm: null, opened_on: '2026-05-01' },
      ],
      collection_events: [{ collection_case_id: 'c2', event_type: 'note', occurred_on: '2026-05-20', created_at: '2026-05-20T00:00:00Z' }],
      units: [
        { id: 'u1', unit_number: '12', address_line1: 'x', legacy_hoa_property_id: 'p1' },
        { id: 'u2', unit_number: null, address_line1: '5 Oak St', legacy_hoa_property_id: null },
      ],
    })
    const out = await listOpenCases(client, 'org-1', '2026-06-01')
    expect([...new Set(calls.map((c) => c.table))].sort()).toEqual(['collection_cases', 'collection_events', 'units'])
    for (const c of calls) expect(c.eq).toContainEqual(['organization_id', 'org-1'])
    expect(out.total).toBe(2)
    // c1 has no events: quiet since 2026-01-01, so it sorts first.
    expect(out.rows.map((r) => r.caseId)).toEqual(['c1', 'c2'])
    expect(out.rows[0]).toMatchObject({ linkId: 'p1', unitLabel: '12', attorneyFirm: 'Firm A' })
    expect(out.rows[1]).toMatchObject({ linkId: 'u2', unitLabel: '5 Oak St', lastEventOn: '2026-05-20', daysSinceLastEvent: 12 })
  })

  it('returns an empty page without reading events or units', async () => {
    const { client, calls } = mockClient({})
    expect(await listOpenCases(client, 'org-1', '2026-06-01')).toEqual({ rows: [], total: 0 })
    expect(calls.map((c) => c.table)).toEqual(['collection_cases'])
  })

  it('slices to the page after sorting and keeps the full total', async () => {
    const cases = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, unit_id: 'u1', status: 'monitoring', opened_on: `2026-0${i + 1}-01` }))
    const { client } = mockClient({ collection_cases: cases, units: [{ id: 'u1', unit_number: '1', legacy_hoa_property_id: null }] })
    const out = await listOpenCases(client, 'org-1', '2026-06-01', { limit: 2 })
    expect(out.total).toBe(5)
    expect(out.rows.map((r) => r.caseId)).toEqual(['c0', 'c1'])
  })
})
