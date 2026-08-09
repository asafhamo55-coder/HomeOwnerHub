import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { buildReminderPackets, daysBetween, unitLabel } from './packets'

// The real client returns a thenable builder; every filter method returns
// `this` and awaiting it yields { data }. This fake does the same so the
// production code can chain freely without the test knowing the order.
function table(data: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data })
  return builder
}

const TODAY = '2026-08-09'

beforeEach(() => {
  mockFrom.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})

function setupTables(opts: { assessments?: unknown[]; ownerships?: unknown[] }) {
  mockFrom.mockImplementation((name: string) => {
    if (name === 'assessments') return table(opts.assessments ?? [])
    if (name === 'ownerships') return table(opts.ownerships ?? [])
    throw new Error(`unexpected table: ${name}`)
  })
}

const UNIT_A = { id: 'unit-a', address_line1: '14 Oak St', unit_number: null }
const UNIT_B = { id: 'unit-b', address_line1: '22 Oak St', unit_number: 'B' }

describe('daysBetween', () => {
  it('counts whole days between two ISO dates', () => {
    expect(daysBetween('2026-07-01', '2026-08-09')).toBe(39)
  })

  it('returns 0 for the same day', () => {
    expect(daysBetween('2026-08-09', '2026-08-09')).toBe(0)
  })
})

describe('unitLabel', () => {
  it('appends the unit number when present', () => {
    expect(unitLabel(UNIT_B)).toBe('22 Oak St · Unit B')
  })

  it('uses the address alone when there is no unit number', () => {
    expect(unitLabel(UNIT_A)).toBe('14 Oak St')
  })
})

describe('buildReminderPackets', () => {
  it('subtracts payments so a partially paid charge reports its true balance', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01',
          assessment_type: 'regular', payments: [{ amount: 160 }], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(1)
    expect(packets[0].properties[0].charges[0].balance).toBe(150)
    expect(packets[0].totalDue).toBe(150)
  })

  it('drops a charge whose payments already cover it', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01',
          assessment_type: 'regular', payments: [{ amount: 310 }], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(0)
  })

  it('treats a charge due today as not yet late', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: TODAY,
          assessment_type: 'regular', payments: [], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets[0].properties[0].charges[0].pastDue).toBe(false)
    expect(packets[0].pastDueTotal).toBe(0)
  })

  it('consolidates one owner across two properties into a single packet', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'a2', unit_id: 'unit-b', amount: 200, due_date: '2026-09-01', assessment_type: 'special', payments: [], unit: UNIT_B },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
        { unit_id: 'unit-b', owner_name: 'Dana', owner_email: 'DANA@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(1)
    expect(packets[0].email).toBe('dana@example.com')
    expect(packets[0].properties).toHaveLength(2)
    expect(packets[0].totalDue).toBe(510)
    expect(packets[0].pastDueTotal).toBe(310)
    expect(packets[0].oldestDaysLate).toBe(39)
    expect(packets[0].chargeCount).toBe(2)
  })

  it('gives each co-owner of one unit their own packet with the full picture', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
        { unit_id: 'unit-a', owner_name: 'Sam', owner_email: 'sam@example.com', owner_user_id: 'u2' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(2)
    expect(packets.every((p) => p.totalDue === 310)).toBe(true)
  })

  it('reports an owner with no email as skipped rather than dropping them silently', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Priya', owner_email: null, owner_user_id: null },
      ],
    })

    const { packets, skipped } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(0)
    expect(skipped).toEqual([{ ownerName: 'Priya', unitLabel: '14 Oak St' }])
  })

  it('sorts packets by past-due total descending', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 100, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'a2', unit_id: 'unit-b', amount: 900, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_B },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Small', owner_email: 'small@example.com', owner_user_id: null },
        { unit_id: 'unit-b', owner_name: 'Big', owner_email: 'big@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets.map((p) => p.email)).toEqual(['big@example.com', 'small@example.com'])
  })

  it('orders charges past-due-first, oldest first, then upcoming', async () => {
    setupTables({
      assessments: [
        { id: 'up', unit_id: 'unit-a', amount: 310, due_date: '2026-09-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'new', unit_id: 'unit-a', amount: 110, due_date: '2026-07-15', assessment_type: 'late_fee', payments: [], unit: UNIT_A },
        { id: 'old', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets[0].properties[0].charges.map((c) => c.id)).toEqual(['old', 'new', 'up'])
  })
})
