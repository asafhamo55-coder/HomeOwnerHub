import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { commitRosterHomes } from './commit'
import type { RosterRowInput } from './rows'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Synthetic fixtures only.
const ORG = 'org-1'
const ASSOC = 'assoc-1'
const row = (n: number, address: string, extra: Partial<RosterRowInput> = {}): RosterRowInput => ({
  row: n,
  address,
  unit: null,
  city: null,
  state: null,
  zip: null,
  ownerName: null,
  ownerEmail: null,
  ownerPhone: null,
  mailingAddress: null,
  tenure: null,
  ...extra,
})
const seed = () => ({ associations: [{ id: ASSOC, organization_id: ORG, name: 'A' }] })
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

describe('commitRosterHomes', () => {
  it('writes both sides of every home, its owners (several per lot), tenure and mailing address', async () => {
    const m = memorySupabase(seed())
    const r = await commitRosterHomes(db(m), {
      orgId: ORG,
      associationId: ASSOC,
      mode: 'skip',
      homes: [
        {
          rows: [
            row(2, '1 Test Way', { unit: 'Lot 4', city: 'Testville', state: 'FL', zip: '32000', ownerName: 'Owner One', ownerEmail: 'one@example.test', tenure: 'leased', mailingAddress: 'PO Box 1, Elsewhere, NY 10001' }),
            row(5, '1 Test Way', { ownerName: 'Co Owner', ownerEmail: 'co@example.test' }),
          ],
        },
        { rows: [row(3, '2 Test Way')] },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const props = m.rows('hoa_properties')
    expect(r.results).toEqual([
      { row: 2, status: 'new', propertyId: props[0].id },
      { row: 5, status: 'new', propertyId: props[0].id },
      { row: 3, status: 'new', propertyId: props[1].id },
    ])
    expect(props[0]).toMatchObject({ address: '1 Test Way', unit_number: 'Lot 4', tenure: 'leased', owner_email: 'one@example.test' })
    expect(props[0].notes).toContain('Mailing address: PO Box 1')
    expect(m.rows('units')[0]).toMatchObject({ association_id: ASSOC, city: 'Testville', state: 'FL', postal_code: '32000', legacy_hoa_property_id: props[0].id })
    expect(m.rows('ownerships').map((o) => o.owner_email)).toEqual(['one@example.test', 'co@example.test'])
    expect(m.rows('property_residents').filter((x) => x.is_primary)).toHaveLength(1)
  })

  it('is idempotent: importing the same homes again changes nothing', async () => {
    const m = memorySupabase(seed())
    const homes = [{ rows: [row(2, '1 Test Way', { ownerEmail: 'one@example.test' })] }]
    await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'update', homes })
    const before = { p: m.rows('hoa_properties').length, u: m.rows('units').length, o: m.rows('ownerships').length, r: m.rows('property_residents').length }
    const again = await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'update', homes })
    expect(again.ok && again.results[0].status).toBe('update')
    expect({ p: m.rows('hoa_properties').length, u: m.rows('units').length, o: m.rows('ownerships').length, r: m.rows('property_residents').length }).toEqual(before)
  })

  it("'skip' reports a home already on file as a duplicate and writes nothing for it", async () => {
    const m = memorySupabase({
      ...seed(),
      hoa_properties: [{ id: 'p1', org_id: ORG, address: '1 Test Way', unit_number: null, deleted_at: null }],
      units: [{ id: 'u1', organization_id: ORG, address_line1: '1 Test Way', legacy_hoa_property_id: 'p1', unit_number: null }],
    })
    const r = await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'skip', homes: [{ rows: [row(2, '1 test way', { ownerEmail: 'one@example.test' })] }] })
    expect(r).toEqual({ ok: true, results: [{ row: 2, status: 'duplicate', reason: 'Already on file.', propertyId: 'p1' }] })
    expect(m.rows('ownerships')).toHaveLength(0)
  })

  it('re-validates every row on the server: a bad row is an error, the rest still import', async () => {
    const m = memorySupabase(seed())
    const r = await commitRosterHomes(db(m), {
      orgId: ORG,
      associationId: ASSOC,
      mode: 'skip',
      homes: [{ rows: [row(2, '=CMD()')] }, { rows: [row(3, '2 Test Way', { ownerEmail: 'bad' })] }, { rows: [row(4, '3 Test Way')] }],
    })
    expect(r.ok && r.results.map((x) => [x.row, x.status, x.reason ?? null])).toEqual([
      [2, 'error', 'The address is a spreadsheet formula, not an address.'],
      [3, 'error', 'The owner email isn’t a valid email address.'],
      [4, 'new', null],
    ])
    expect(m.rows('hoa_properties')).toHaveLength(1)
  })

  it('a failed write is a row error with a plain reason, never the database text, and leaves no half home', async () => {
    const m = memorySupabase(seed(), {
      failOn: (c: MemCall, n) => (c.table === 'units' && c.op === 'insert' && n === 1 ? { code: '23505', message: 'duplicate key (address_line1)=(2 Test Way)' } : null),
    })
    const r = await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way')] }, { rows: [row(3, '2 Test Way')] }, { rows: [row(4, '3 Test Way')] }] })
    expect(r.ok && r.results.map((x) => x.status)).toEqual(['new', 'error', 'new'])
    expect(JSON.stringify(r)).not.toMatch(/duplicate key|address_line1/)
    expect(m.rows('hoa_properties').map((p) => p.address)).toEqual(['1 Test Way', '3 Test Way'])
  })

  it('an owner that fails after its home was saved is reported against that row', async () => {
    const m = memorySupabase(seed(), { failOn: (c: MemCall) => (c.table === 'ownerships' && c.op === 'insert' ? { code: 'XX000', message: 'x' } : null) })
    const r = await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way', { ownerEmail: 'one@example.test' })] }] })
    expect(r.ok && r.results[0]).toMatchObject({ row: 2, status: 'error', reason: expect.stringMatching(/home was saved, but its owner wasn’t/) })
  })

  it('a community from another org is refused before any write', async () => {
    const m = memorySupabase({ associations: [{ id: ASSOC, organization_id: 'org-2', name: 'X' }] })
    const r = await commitRosterHomes(db(m), { orgId: ORG, associationId: ASSOC, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way')] }] })
    expect(r.ok).toBe(false)
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })
})
