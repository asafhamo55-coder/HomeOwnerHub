import { describe, expect, it } from 'vitest'
import { countAudiences, resolveAudience, type AudienceKind } from './audience'

/**
 * The bug this pins: the composer counted rows while the resolver sends to
 * distinct units, so "Units late on dues (24)" produced 5 emails at Madison
 * Park — 24 overdue assessments spread across 5 units.
 *
 * These tests run both against the same fake so a future edit to one and
 * not the other fails here rather than in a board member's inbox.
 */

const ASSOC = 'assoc-1'

// Madison Park in miniature: 5 units, one of them co-owned, one leased,
// and overdue assessments clustered on a few units.
const UNITS = [
  { id: 'u1', address_line1: '3580 Allee Elm', unit_number: null, legacy_hoa_property_id: 'p1' },
  { id: 'u2', address_line1: '3597 Old Maple', unit_number: null, legacy_hoa_property_id: 'p2' },
  { id: 'u3', address_line1: '3600 Allee Elm', unit_number: null, legacy_hoa_property_id: 'p3' },
  { id: 'u4', address_line1: '914 Urban Ash', unit_number: null, legacy_hoa_property_id: 'p4' },
  { id: 'u5', address_line1: '10079 Trumpet', unit_number: null, legacy_hoa_property_id: 'p5' },
]

const OWNERSHIPS = [
  { unit_id: 'u1', owner_name: 'Kaur', owner_email: 'k@x.com', owner_phone: null, owner_user_id: null },
  // Co-owned: two active ownership rows, ONE unit, ONE email.
  { unit_id: 'u2', owner_name: 'Larry Wilson', owner_email: 'l@x.com', owner_phone: null, owner_user_id: null },
  { unit_id: 'u2', owner_name: 'Jacqueline Wilson', owner_email: 'j@x.com', owner_phone: null, owner_user_id: null },
  { unit_id: 'u3', owner_name: 'Kailasam', owner_email: 'v@x.com', owner_phone: null, owner_user_id: null },
  { unit_id: 'u4', owner_name: 'Young', owner_email: 'h@x.com', owner_phone: null, owner_user_id: null },
  { unit_id: 'u5', owner_name: 'Tanneru', owner_email: 't@x.com', owner_phone: null, owner_user_id: null },
]

const TENANCIES = [
  { unit_id: 'u5', tenant_name: 'Tenant A', tenant_email: 'a@x.com', tenant_phone: null, tenant_user_id: null, status: 'active' },
]

// 24 overdue assessment rows across only 5 units — the exact shape that
// made the chip disagree with the send.
const ASSESSMENTS = [
  ...Array.from({ length: 9 }, () => ({ unit_id: 'u2' })),
  ...Array.from({ length: 5 }, () => ({ unit_id: 'u1' })),
  ...Array.from({ length: 4 }, () => ({ unit_id: 'u5' })),
  ...Array.from({ length: 3 }, () => ({ unit_id: 'u3' })),
  ...Array.from({ length: 3 }, () => ({ unit_id: 'u4' })),
]

const VIOLATIONS = [{ property_id: 'p1' }, { property_id: 'p1' }, { property_id: 'p5' }]

/** Minimal PostgREST-shaped stub: every builder method returns `this`, and
 *  awaiting it yields the table's rows. */
function fakeDb() {
  function table(rows: unknown[]) {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'lt', 'not', 'order', 'limit']) {
      b[m] = () => b
    }
    b.then = (res: (v: { data: unknown[] }) => unknown) => res({ data: rows })
    return b
  }
  return {
    from(name: string) {
      switch (name) {
        case 'units': return table(UNITS)
        case 'ownerships': return table(OWNERSHIPS)
        case 'tenancies': return table(TENANCIES)
        case 'assessments': return table(ASSESSMENTS)
        case 'hoa_violations': return table(VIOLATIONS)
        default: return table([])
      }
    },
  } as never
}

async function resolvedCount(kind: AudienceKind): Promise<number> {
  const { recipients } = await resolveAudience(fakeDb(), ASSOC, { kind })
  return recipients.length
}

describe('countAudiences agrees with resolveAudience', () => {
  const KINDS: AudienceKind[] = [
    'everyone',
    'owners_only',
    'tenants_only',
    'late_on_dues',
    'open_violations',
  ]

  it.each(KINDS)('%s: the chip matches what would actually be sent', async (kind) => {
    const counts = await countAudiences(fakeDb(), ASSOC)
    expect(counts[kind as keyof typeof counts]).toBe(await resolvedCount(kind))
  })
})

describe('the specific mistakes that were being made', () => {
  it('late_on_dues counts units, not the 24 assessment rows', async () => {
    const counts = await countAudiences(fakeDb(), ASSOC)
    expect(ASSESSMENTS.length).toBe(24)
    expect(counts.late_on_dues).toBe(5)
  })

  it('a co-owned unit counts once, not once per owner', async () => {
    const counts = await countAudiences(fakeDb(), ASSOC)
    // Six ownership rows, five units.
    expect(OWNERSHIPS.length).toBe(6)
    expect(counts.owners_only).toBe(5)
  })

  it('tenants_only counts leased units only', async () => {
    const counts = await countAudiences(fakeDb(), ASSOC)
    expect(counts.tenants_only).toBe(1)
  })

  it('open_violations counts units, not repeated violation rows', async () => {
    const counts = await countAudiences(fakeDb(), ASSOC)
    expect(VIOLATIONS.length).toBe(3)
    expect(counts.open_violations).toBe(2)
  })
})
