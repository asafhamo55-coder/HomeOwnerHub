import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { closingDay, isCalendarDay, ownershipStatus, recordSale, validateSale, type BuyerInput } from './sale'
import { asPropertyId } from './resolve'

// Ids and fixtures are synthetic; nothing here is a real address or person.
const ORG = 'org-1'
const OTHER = 'org-2'
const TODAY = '2026-10-17'
const SETTLED = '2026-10-15'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

const failAt = (table: string, op: string, nth = 0) => (c: MemCall, n: number) =>
  c.table === table && c.op === op && n === nth ? { code: 'XX000', message: 'boom (owner_email)=(seller@example.test)' } : null

const buyer = (over: Partial<BuyerInput> = {}): BuyerInput => ({
  name: 'Buyer One',
  email: 'buyer1@example.test',
  phone: '(555) 010-0101',
  mailingAddress: null,
  pct: 100,
  ...over,
})

function seeded(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  return {
    hoa_properties: [
      {
        id: 'p1',
        org_id: ORG,
        address: '1 Test Way',
        unit_number: null,
        owner_name: 'Seller One',
        owner_email: 'seller@example.test',
        owner_phone: '(555) 010-0000',
        tenure: 'leased',
        tenure_updated_at: '2025-01-01T00:00:00Z',
        tenure_updated_by: null,
        notes: null,
        deleted_at: null,
      },
    ],
    units: [{ id: 'u1', organization_id: ORG, legacy_hoa_property_id: 'p1', created_at: '2026-01-01T00:00:00Z' }],
    ownerships: [
      { id: 'o1', organization_id: ORG, unit_id: 'u1', owner_user_id: 'seller-user', owner_name: 'Seller One', owner_email: 'seller@example.test', ownership_pct: 60, valid_from: '2019-05-01', valid_to: null },
      { id: 'o2', organization_id: ORG, unit_id: 'u1', owner_user_id: null, owner_name: 'Seller Two', owner_email: null, ownership_pct: 40, valid_from: '2019-05-01', valid_to: null },
      { id: 'o0', organization_id: ORG, unit_id: 'u1', owner_user_id: null, owner_name: 'Earlier Owner', owner_email: null, ownership_pct: 100, valid_from: '2010-01-01', valid_to: '2019-05-01' },
    ],
    property_residents: [
      { id: 'r-seller', organization_id: ORG, property_id: 'p1', full_name: 'Seller One', email: 'seller@example.test', role: 'owner', moved_in_at: '2019-05-01', moved_out_at: null, deleted_at: null },
      { id: 'r-family', organization_id: ORG, property_id: 'p1', full_name: 'Seller Kid', email: null, role: 'family_member', moved_in_at: '2019-05-01', moved_out_at: null, deleted_at: null },
      { id: 'r-tenant', organization_id: ORG, property_id: 'p1', full_name: 'Tenant One', email: 'tenant@example.test', role: 'tenant', moved_in_at: '2026-02-01', moved_out_at: null, deleted_at: null },
      { id: 'r-gone', organization_id: ORG, property_id: 'p1', full_name: 'Old Tenant', email: null, role: 'tenant', moved_in_at: '2020-01-01', moved_out_at: '2021-01-01', deleted_at: null },
    ],
    tenancies: [
      { id: 't1', organization_id: ORG, unit_id: 'u1', status: 'active', lease_start: '2026-02-01', lease_end: '2027-01-31' },
    ],
    // Another org's lot with the same ids must never be touched.
    ...extra,
  }
}

const sale = (m: ReturnType<typeof memorySupabase>, over: Partial<Parameters<typeof recordSale>[1]> = {}) =>
  recordSale(db(m), {
    orgId: ORG,
    propertyId: asPropertyId('p1'),
    userId: 'user-1',
    settlementDate: SETTLED,
    buyers: [buyer()],
    carryTenants: true,
    addBuyersAsResidents: false,
    ...over,
  })

// ─── pure ────────────────────────────────────────────────────────────

describe('ownership period math', () => {
  it('a seller’s ownership ends on the settlement date, never before it began', () => {
    expect(closingDay('2026-10-15', '2019-05-01')).toBe('2026-10-15')
    expect(closingDay('2026-10-15', '2026-10-15')).toBe('2026-10-15')
    // Imported on the 16th, sale settled on the 15th: ends the day it began.
    expect(closingDay('2026-10-15', '2026-10-16')).toBe('2026-10-16')
    expect(closingDay('2026-10-15', '2026-10-16T00:00:00Z')).toBe('2026-10-16')
  })

  it('periods are [from, to): the closing day belongs to the buyer', () => {
    const seller = { valid_from: '2019-05-01', valid_to: TODAY }
    const buyerRow = { valid_from: TODAY, valid_to: null }
    expect(ownershipStatus(seller, TODAY)).toBe('past')
    expect(ownershipStatus(buyerRow, TODAY)).toBe('current')
    expect(ownershipStatus({ valid_from: '2026-11-01', valid_to: null }, TODAY)).toBe('future')
    expect(ownershipStatus({ valid_from: '2019-05-01', valid_to: '2026-12-01' }, TODAY)).toBe('current')
  })

  it('isCalendarDay rejects impossible dates', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true)
    expect(isCalendarDay('2026-02-30')).toBe(false)
    expect(isCalendarDay('10/15/2026')).toBe(false)
  })
})

describe('validateSale', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    settlementDate: SETTLED,
    buyers: [{ name: 'Buyer One', email: 'buyer1@example.test', phone: '', mailingAddress: '' }],
    carryTenants: true,
    addBuyersAsResidents: false,
    ...over,
  })

  it('accepts one buyer at 100% and trims fields', () => {
    const r = validateSale(raw({ buyers: [{ name: '  Buyer One ', email: ' buyer1@example.test ' }] }), TODAY)
    expect(r).toEqual({
      ok: true,
      value: {
        settlementDate: SETTLED,
        buyers: [{ name: 'Buyer One', email: 'buyer1@example.test', phone: null, mailingAddress: null, pct: 100 }],
        carryTenants: true,
        addBuyersAsResidents: false,
      },
    })
  })

  it('settlement today is fine; tomorrow is refused (access follows valid_to IS NULL, not dates)', () => {
    expect(validateSale(raw({ settlementDate: TODAY }), TODAY).ok).toBe(true)
    const r = validateSale(raw({ settlementDate: '2026-10-18' }), TODAY)
    expect(r).toMatchObject({ ok: false, fieldErrors: { settlementDate: expect.stringContaining('can’t be in the future') } })
    expect(validateSale(raw({ settlementDate: '' }), TODAY)).toMatchObject({ fieldErrors: { settlementDate: 'Enter the settlement date.' } })
    expect(validateSale(raw({ settlementDate: '2026-02-30' }), TODAY)).toMatchObject({ ok: false })
  })

  it('needs a buyer with a name and a plausible email', () => {
    expect(validateSale(raw({ buyers: [] }), TODAY)).toMatchObject({ fieldErrors: { buyers: 'Add the buyer.' } })
    expect(validateSale(raw({ buyers: [{ name: '' }] }), TODAY)).toMatchObject({ fieldErrors: { 'buyers.0.name': expect.any(String) } })
    expect(validateSale(raw({ buyers: [{ name: 'B', email: 'not-an-email' }] }), TODAY)).toMatchObject({
      fieldErrors: { 'buyers.0.email': expect.any(String) },
    })
  })

  it('several buyers: each share is required and they must add up to 100%', () => {
    const two = (a: unknown, b: unknown) =>
      validateSale(raw({ buyers: [{ name: 'A', email: 'a@example.test', pct: a }, { name: 'B', email: 'b@example.test', pct: b }] }), TODAY)
    expect(two('50', '50')).toMatchObject({ ok: true, value: { buyers: [{ pct: 50 }, { pct: 50 }] } })
    expect(two(33.33, 66.67)).toMatchObject({ ok: true })
    expect(two('60', '30')).toMatchObject({ ok: false, fieldErrors: { buyers: expect.stringContaining('add up to 90%') } })
    expect(two('', '100')).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.pct': expect.any(String) } })
    expect(two('0', '100')).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.pct': expect.any(String) } })
    expect(two('33.333', '66.667')).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.pct': 'Use at most two decimals.' } })
  })

  it('two buyers cannot share an email; at most six buyers', () => {
    const r = validateSale(
      raw({ buyers: [{ name: 'A', email: 'x@example.test', pct: 50 }, { name: 'B', email: 'X@example.test', pct: 50 }] }),
      TODAY,
    )
    expect(r).toMatchObject({ ok: false, fieldErrors: { 'buyers.1.email': expect.any(String) } })
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `B${i}`, pct: 100 / 7 }))
    expect(validateSale(raw({ buyers: seven }), TODAY)).toMatchObject({ ok: false, fieldErrors: { buyers: expect.stringContaining('at most 6') } })
  })

  it('a mailing address needs the household entry it is kept on', () => {
    const b = [{ name: 'A', mailingAddress: '9 Elsewhere Rd' }]
    expect(validateSale(raw({ buyers: b }), TODAY)).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.mailingAddress': expect.any(String) } })
    expect(validateSale(raw({ buyers: b, addBuyersAsResidents: true }), TODAY)).toMatchObject({ ok: true })
  })

  it('booleans must be true to count (a stray string is not consent)', () => {
    const r = validateSale(raw({ carryTenants: 'yes', addBuyersAsResidents: 'true' }), TODAY)
    expect(r).toMatchObject({ ok: true, value: { carryTenants: false, addBuyersAsResidents: false } })
  })
})

// ─── recordSale ──────────────────────────────────────────────────────

describe('recordSale: a happy sale', () => {
  it('closes every current ownership at the settlement date and opens the buyer’s from it', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const owns = m.rows('ownerships')
    expect(owns.find((o) => o.id === 'o1')).toMatchObject({ valid_to: SETTLED })
    expect(owns.find((o) => o.id === 'o2')).toMatchObject({ valid_to: SETTLED })
    // A row already closed keeps its own end.
    expect(owns.find((o) => o.id === 'o0')).toMatchObject({ valid_to: '2019-05-01' })
    const opened = owns.filter((o) => o.source === 'sale')
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({
      organization_id: ORG,
      unit_id: 'u1',
      owner_name: 'Buyer One',
      owner_email: 'buyer1@example.test',
      ownership_pct: 100,
      valid_from: SETTLED,
      created_by: 'user-1',
    })
    expect(opened[0]!.valid_to ?? null).toBeNull()
    expect(opened[0]!.owner_user_id ?? null).toBeNull()
    expect(r.data.closedOwnershipIds.sort()).toEqual(['o1', 'o2'])
  })

  it('never closes before valid_from (an ownership imported after the settlement)', async () => {
    const s = seeded()
    s.ownerships = [{ ...s.ownerships[0]!, valid_from: '2026-10-16' }]
    const m = memorySupabase(s)
    expect((await sale(m)).ok).toBe(true)
    expect(m.rows('ownerships').find((o) => o.id === 'o1')).toMatchObject({ valid_to: '2026-10-16' })
    expect(m.rows('ownerships').find((o) => o.source === 'sale')).toMatchObject({ valid_from: SETTLED })
  })

  it('points the home’s owner fields at the primary buyer (both records stay in sync)', async () => {
    const m = memorySupabase(seeded())
    await sale(m, {
      buyers: [buyer({ name: 'Buyer A', email: 'a@example.test', pct: 50 }), buyer({ name: 'Buyer B', email: 'b@example.test', phone: null, pct: 50 })],
    })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ owner_name: 'Buyer A', owner_email: 'a@example.test', owner_phone: '(555) 010-0101' })
    const opened = m.rows('ownerships').filter((o) => o.source === 'sale')
    expect(opened.map((o) => [o.owner_email, o.ownership_pct])).toEqual([
      ['a@example.test', 50],
      ['b@example.test', 50],
    ])
  })

  it('ends the seller’s portal access: owner and household rows move out at settlement; tenants stay when carried over', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m, { carryTenants: true })
    expect(r.ok && r.data.movedOutResidentIds.sort()).toEqual(['r-family', 'r-seller'])
    const res = m.rows('property_residents')
    expect(res.find((x) => x.id === 'r-seller')).toMatchObject({ moved_out_at: SETTLED })
    expect(res.find((x) => x.id === 'r-family')).toMatchObject({ moved_out_at: SETTLED })
    expect(res.find((x) => x.id === 'r-tenant')).toMatchObject({ moved_out_at: null })
    expect(res.find((x) => x.id === 'r-gone')).toMatchObject({ moved_out_at: '2021-01-01' })
    // What 0061's auth_resident_unit_ids reads for the seller: nothing current.
    const sellerCurrent = m.rows('ownerships').filter((o) => o.owner_user_id === 'seller-user' && (o.valid_to ?? null) === null)
    const sellerResident = res.filter((x) => x.email === 'seller@example.test' && x.moved_out_at === null)
    expect(sellerCurrent).toHaveLength(0)
    expect(sellerResident).toHaveLength(0)
    // Lease and tenure untouched.
    expect(m.rows('tenancies')[0]).toMatchObject({ status: 'active', lease_end: '2027-01-31' })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ tenure: 'leased' })
  })

  it('tenants not carried over: leases end at settlement, tenant rows move out, tenure resets to unknown', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m, { carryTenants: false })
    expect(r).toMatchObject({ ok: true, data: { endedTenancyIds: ['t1'], tenureReset: true } })
    expect(m.rows('tenancies')[0]).toMatchObject({ status: 'ended', lease_end: SETTLED })
    expect(m.rows('property_residents').find((x) => x.id === 'r-tenant')).toMatchObject({ moved_out_at: SETTLED })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ tenure: 'unknown', tenure_updated_by: 'user-1' })
  })

  it('optionally lists the buyers as owner residents (mailing address in the note) — and sends nothing', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m, {
      addBuyersAsResidents: true,
      buyers: [buyer({ mailingAddress: '9 Elsewhere Rd, Far, CA 90000', pct: 70 }), buyer({ name: 'Buyer Two', email: null, pct: 30 })],
    })
    expect(r.ok).toBe(true)
    const added = m.rows('property_residents').filter((x) => x.moved_in_at === SETTLED)
    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({ role: 'owner', is_primary: true, full_name: 'Buyer One', notes: 'Mailing address: 9 Elsewhere Rd, Far, CA 90000' })
    expect(added[1]).toMatchObject({ role: 'owner', is_primary: false, full_name: 'Buyer Two', notes: null })
    // Only these tables are written — no invitation, no auth user, no message.
    const written = new Set(m.calls.filter((c) => c.op !== 'select').map((c) => c.table))
    expect([...written].sort()).toEqual(['hoa_properties', 'ownerships', 'property_events', 'property_residents'])
  })

  it('a buyer already on the household list is neither moved out nor added twice', async () => {
    const m = memorySupabase(seeded())
    // The tenant is buying the home.
    const r = await sale(m, { carryTenants: false, addBuyersAsResidents: true, buyers: [buyer({ name: 'Tenant One', email: 'tenant@example.test' })] })
    expect(r.ok).toBe(true)
    const tenant = m.rows('property_residents').filter((x) => x.email === 'tenant@example.test')
    expect(tenant).toHaveLength(1)
    expect(tenant[0]).toMatchObject({ moved_out_at: null })
  })

  it('writes one ownership_changed event with ids, counts and the date — no names, emails or addresses', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m, { carryTenants: false, addBuyersAsResidents: true })
    expect(r.ok).toBe(true)
    const [ev] = m.rows('property_events')
    expect(ev).toMatchObject({
      organization_id: ORG,
      property_id: 'p1',
      kind: 'ownership_changed',
      created_by: 'user-1',
      payload: {
        reason: 'sale',
        settlement_date: SETTLED,
        unit_id: 'u1',
        buyers: 1,
        moved_out_residents: 3,
        ended_leases: 1,
        buyers_listed: 1,
        tenants_carried: false,
        tenure_reset: true,
      },
    })
    const text = JSON.stringify(ev)
    for (const pii of ['Buyer One', 'buyer1@example.test', 'Seller', 'seller@example.test', '555', 'Test Way']) expect(text).not.toContain(pii)
    const logged = JSON.stringify([...infoSpy.mock.calls, ...errSpy.mock.calls])
    for (const pii of ['Buyer One', 'buyer1@example.test', 'seller@example.test', '555']) expect(logged).not.toContain(pii)
  })

  it('closes the seller on a duplicate unit too, and opens the buyer only on the canonical one', async () => {
    const s = seeded()
    s.units.push({ id: 'u2', organization_id: ORG, legacy_hoa_property_id: 'p1', created_at: '2026-05-01T00:00:00Z' })
    s.ownerships.push({ id: 'o3', organization_id: ORG, unit_id: 'u2', owner_user_id: 'seller-user', owner_name: 'Seller One', owner_email: 'seller@example.test', ownership_pct: 100, valid_from: '2026-05-01', valid_to: null })
    const m = memorySupabase(s)
    expect((await sale(m)).ok).toBe(true)
    expect(m.rows('ownerships').find((o) => o.id === 'o3')).toMatchObject({ valid_to: SETTLED })
    expect(m.rows('ownerships').filter((o) => o.source === 'sale').map((o) => o.unit_id)).toEqual(['u1'])
  })
})

describe('recordSale: refusals', () => {
  it('another org’s property is not found, and nothing is written', async () => {
    const m = memorySupabase(seeded())
    const r = await recordSale(db(m), { orgId: OTHER, propertyId: asPropertyId('p1'), userId: 'x', settlementDate: SETTLED, buyers: [buyer()], carryTenants: true, addBuyersAsResidents: false })
    expect(r).toEqual({ ok: false, error: 'Property not found.' })
    expect(m.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('an archived property is not found', async () => {
    const s = seeded()
    ;(s.hoa_properties[0] as Record<string, unknown>).deleted_at = '2026-10-01T00:00:00Z'
    expect(await sale(memorySupabase(s))).toEqual({ ok: false, error: 'Property not found.' })
  })

  it('no unit linked: says so, writes nothing', async () => {
    const m = memorySupabase({ ...seeded(), units: [] })
    const r = await sale(m)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('isn’t linked to a unit record') })
    expect(m.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('a buyer with the current owner’s email is a contact fix, not a sale', async () => {
    const m = memorySupabase(seeded())
    const r = await sale(m, { buyers: [buyer({ email: 'SELLER@example.test' })] })
    expect(r).toMatchObject({ ok: false, field: 'buyers.0.email' })
    expect(m.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('a failed read returns a generic message, never database text', async () => {
    const m = memorySupabase(seeded(), { failOn: failAt('ownerships', 'select') })
    const r = await sale(m)
    expect(r).toEqual({ ok: false, error: 'Couldn’t record the sale. Nothing was changed. Try again.' })
  })
})

describe('recordSale: a failure mid-way undoes every earlier write, in reverse order', () => {
  const snapshot = (m: ReturnType<typeof memorySupabase>) =>
    JSON.stringify(['hoa_properties', 'ownerships', 'property_residents', 'tenancies', 'property_events'].map((t) => m.rows(t)))

  const cases: Array<[string, (c: MemCall, n: number) => { code: string; message: string } | null]> = [
    ['closing the second seller ownership', failAt('ownerships', 'update', 1)],
    ['opening the buyer ownership', failAt('ownerships', 'insert')],
    ['updating the home’s owner fields', failAt('hoa_properties', 'update')],
    ['moving the seller household out', failAt('property_residents', 'update')],
    ['ending the lease', failAt('tenancies', 'update')],
    ['listing the buyer as a resident', failAt('property_residents', 'insert')],
    ['writing the ownership_changed event', failAt('property_events', 'insert')],
  ]

  for (const [step, failOn] of cases) {
    it(`fails at ${step} → the lot is exactly as before`, async () => {
      const before = memorySupabase(seeded())
      const m = memorySupabase(seeded(), { failOn })
      const r = await sale(m, { carryTenants: false, addBuyersAsResidents: true })
      expect(r).toEqual({ ok: false, error: 'Couldn’t record the sale. Nothing was changed. Try again.' })
      // Same rows as an untouched copy (tenure_updated_at aside: restored to its old value).
      expect(snapshot(m)).toBe(snapshot(before))
    })
  }

  it('compensation runs newest-first', async () => {
    const m = memorySupabase(seeded(), { failOn: failAt('property_events', 'insert') })
    await sale(m, { carryTenants: false, addBuyersAsResidents: true })
    const writes = m.calls.filter((c) => c.op !== 'select').map((c) => `${c.table}:${c.op}`)
    const firstUndo = writes.indexOf('property_events:insert') + 1
    expect(writes.slice(firstUndo)).toEqual([
      'property_residents:delete', // buyers listed
      'tenancies:update', // lease restored
      'property_residents:update', // household moved back in
      'hoa_properties:update', // owner fields restored
      'ownerships:delete', // buyer ownership removed
      'ownerships:update', // sellers reopened
    ])
  })

  it('a failing compensation is logged by code only and never masks the original error', async () => {
    errSpy.mockClear()
    const m = memorySupabase(seeded(), {
      failOn: (c, n) =>
        (c.table === 'property_events' && c.op === 'insert') || (c.table === 'ownerships' && c.op === 'delete' && n === 0)
          ? { code: 'XX000', message: 'boom buyer1@example.test' }
          : null,
    })
    const r = await sale(m)
    expect(r).toEqual({ ok: false, error: 'Couldn’t record the sale. Nothing was changed. Try again.' })
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).toContain('compensate.ownerships.open')
    expect(logged).not.toContain('buyer1@example.test')
    expect(logged).not.toContain('boom')
  })
})
