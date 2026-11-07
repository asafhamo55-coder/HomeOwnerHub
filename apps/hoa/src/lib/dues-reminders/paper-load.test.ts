import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { buildReminderPackets } from './packets'
import { loadOpenChargesByProperty } from './paper-load'

// Same thenable-builder fake as packets.test.ts: every filter returns the
// builder, awaiting it resolves { data, error } (it never rejects), a page
// past the first is empty. It also records every .eq() so scope is testable.
function table(data: unknown[], error: { message: string } | null = null, eqs: Array<[string, unknown]> = []) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'is', 'not', 'lt', 'order', 'limit']) builder[m] = () => builder
  builder.eq = (col: string, val: unknown) => {
    eqs.push([col, val])
    return builder
  }
  let from = 0
  builder.range = (f: number) => {
    from = f
    return builder
  }
  builder.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
    resolve({ data: error ? null : from > 0 ? [] : data, error })
  return builder
}

const TODAY = '2026-08-09'
const UNIT_A = { id: 'unit-a', address_line1: '14 Oak St', unit_number: null }
const UNIT_B = { id: 'unit-b', address_line1: '22 Oak St', unit_number: null }
const UNIT_C = { id: 'unit-c', address_line1: '9 Elm St', unit_number: null }

const ASSESSMENTS = [
  // partial payment
  { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [{ amount: 160 }], unit: UNIT_A },
  // fully paid: must vanish on both sides
  { id: 'a2', unit_id: 'unit-a', amount: 310, due_date: '2026-06-01', assessment_type: 'regular', payments: [{ amount: 310 }], unit: UNIT_A },
  // due today: not late yet
  { id: 'a3', unit_id: 'unit-b', amount: 200, due_date: TODAY, assessment_type: 'special', payments: null, unit: UNIT_B },
]

const UNITS = [
  { id: 'unit-a', legacy_hoa_property_id: 'p1' },
  { id: 'unit-b', legacy_hoa_property_id: 'p2' },
  { id: 'unit-c', legacy_hoa_property_id: null },
]

const OWNERSHIPS = [
  { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
  { unit_id: 'unit-b', owner_name: 'Eli', owner_email: 'eli@example.com', owner_user_id: null },
]

let eqs: Record<string, Array<[string, unknown]>>

function setup(opts: { assessments?: unknown[]; assessmentsError?: { message: string }; unitsError?: { message: string } } = {}) {
  eqs = { assessments: [], units: [], ownerships: [] }
  mockFrom.mockImplementation((name: string) => {
    if (name === 'assessments') return table(opts.assessments ?? ASSESSMENTS, opts.assessmentsError ?? null, eqs.assessments)
    if (name === 'units') return table(UNITS, opts.unitsError ?? null, eqs.units)
    if (name === 'ownerships') return table(OWNERSHIPS, null, eqs.ownerships)
    throw new Error(`unexpected table: ${name}`)
  })
}

const client = () => ({ from: mockFrom }) as never

beforeEach(() => {
  mockFrom.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})
afterEach(() => vi.useRealTimers())

describe('loadOpenChargesByProperty', () => {
  it('matches the emailed reminder balance for partial, fully paid and due-today charges', async () => {
    setup()
    const email = await buildReminderPackets('assoc-1')
    const paper = await loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY)

    const emailCharges = (unitId: string) => email.packets.flatMap((p) => p.properties).find((p) => p.unitId === unitId)!.charges
    expect(paper.byProperty.get('p1')).toEqual(emailCharges('unit-a'))
    expect(paper.byProperty.get('p2')).toEqual(emailCharges('unit-b'))
    expect(paper.byProperty.get('p1')!.map((c) => c.balance)).toEqual([150])
    // The fully paid charge is on neither side.
    expect(paper.byProperty.get('p1')!.some((c) => c.id === 'a2')).toBe(false)
    // Due today is not late.
    expect(paper.byProperty.get('p2')![0]).toMatchObject({ balance: 200, pastDue: false, daysLate: 0 })
  })

  it('counts a unit with a balance but no home record instead of dropping it silently', async () => {
    setup({
      assessments: [
        ...ASSESSMENTS,
        { id: 'a4', unit_id: 'unit-c', amount: 80, due_date: '2026-07-01', assessment_type: 'regular', payments: null, unit: UNIT_C },
        { id: 'a5', unit_id: 'unit-c', amount: 20, due_date: '2026-07-02', assessment_type: 'regular', payments: null, unit: UNIT_C },
        // fully paid on an unmapped unit is not a missing balance
        { id: 'a6', unit_id: 'unit-c', amount: 5, due_date: '2026-07-02', assessment_type: 'regular', payments: [{ amount: 5 }], unit: UNIT_C },
      ],
    })
    const paper = await loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY)
    expect(paper.unmappedUnits).toBe(1)
    expect([...paper.byProperty.keys()].sort()).toEqual(['p1', 'p2'])
  })

  it('scopes every read to the organization, and the charges to the association', async () => {
    setup()
    await loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY)
    expect(eqs.assessments).toContainEqual(['organization_id', 'o1'])
    expect(eqs.assessments).toContainEqual(['association_id', 'assoc-1'])
    expect(eqs.units).toContainEqual(['organization_id', 'o1'])
  })

  it('throws when a page fails, so the page can show a load failure', async () => {
    setup({ assessmentsError: { message: 'boom' } })
    await expect(loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY)).rejects.toThrow('paper reminders: assessments read failed')
    setup({ unitsError: { message: 'boom' } })
    await expect(loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY)).rejects.toThrow('boom')
  })

  it('writes no names, addresses or amounts to the log when a read fails', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    setup({ assessmentsError: { message: 'boom' } })
    await loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY).catch(() => {})
    setup({ unitsError: { message: 'boom' } })
    await loadOpenChargesByProperty(client(), 'o1', 'assoc-1', TODAY).catch(() => {})
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toMatch(/Dana|Eli|Oak St|Elm St|310|200/)
    vi.restoreAllMocks()
  })
})
