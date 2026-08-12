import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { buildReminderPackets, daysBetween, unitLabel } from './packets'

// The real client returns a thenable builder; every filter method returns
// `this` and awaiting it yields { data, error }. This fake does the same so
// the production code can chain freely without the test knowing the order.
// Note it RESOLVES with an error rather than rejecting — that is what
// supabase-js does, and the whole point of the error tests below.
function table(data: unknown[], error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
    resolve({ data: error ? null : data, error })
  return builder
}

const TODAY = '2026-08-09'

beforeEach(() => {
  mockFrom.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})

function setupTables(opts: {
  assessments?: unknown[]
  ownerships?: unknown[]
  assessmentsError?: { message: string }
  ownershipsError?: { message: string }
}) {
  mockFrom.mockImplementation((name: string) => {
    if (name === 'assessments') return table(opts.assessments ?? [], opts.assessmentsError ?? null)
    if (name === 'ownerships') return table(opts.ownerships ?? [], opts.ownershipsError ?? null)
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

  it('counts a unit once when the same owner holds two active ownership rows for it', async () => {
    // `ownerships` has no unique constraint on active rows, so a re-run
    // csv_import leaves two. Emails differing only by case land on the same
    // packet key too. Either way the unit must be counted once — otherwise
    // the resident is told they owe twice what they owe.
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'DANA@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(1)
    expect(packets[0].properties).toHaveLength(1)
    expect(packets[0].totalDue).toBe(310)
    expect(packets[0].pastDueTotal).toBe(310)
    expect(packets[0].chargeCount).toBe(1)
  })

  it('still takes the user id from a duplicate row that carries one', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: null, owner_email: 'dana@example.com', owner_user_id: null },
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets[0].properties).toHaveLength(1)
    expect(packets[0].ownerName).toBe('Dana')
    expect(packets[0].userId).toBe('u1')
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

describe('buildReminderPackets query failures', () => {
  // supabase-js resolves — it does not reject — when a query fails, so an
  // unread `error` would turn an RLS change into an empty packet list. The
  // panel renders an empty list as "nobody owes anything", which is the one
  // wrong answer a dues page must never give. These prove it rejects
  // instead, which is what the panel's error card is wired to.
  it('rejects instead of reporting nobody owes when the assessments read fails', async () => {
    setupTables({ assessmentsError: { message: 'permission denied for table assessments' } })

    await expect(buildReminderPackets('assoc-1')).rejects.toThrow(
      /permission denied for table assessments/,
    )
  })

  it('rejects instead of reporting nobody owes when the ownerships read fails', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownershipsError: { message: 'column ownerships.valid_to does not exist' },
    })

    await expect(buildReminderPackets('assoc-1')).rejects.toThrow(
      /column ownerships.valid_to does not exist/,
    )
  })
})
