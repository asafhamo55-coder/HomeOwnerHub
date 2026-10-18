import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { importLots, runUnitsImport, type LotPropertyRow, type LotResidentRow } from './import'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Synthetic fixtures only.
const ORG = 'org-1'
const ASSOC = 'assoc-1'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

const PROPS = [
  'id,address,lot_number,street,unit,zip,city,state,status,notes,address_line1,address_line2,country,property_type,occupancy_type,tenant_id',
  'src-1,,7,,,30000,Testville,GA,,,1 Test Way,,,,,',
  'src-2,,8,,,30000,Testville,GA,,,2 Test Way,,,,,',
].join('\n')
const RESIDENTS = [
  'id,property_id,profile_id,full_name,email,phone,type,move_in_date,move_out_date,is_current,first_name,last_name,created_at',
  'r1,src-1,,Owner One,one@example.test,,owner,2024-01-01,,true,,,',
  'r2,src-1,,Owner Two,two@example.test,,owner,2024-01-01,,true,,,',
  'r3,src-2,,Tenant Three,three@example.test,,tenant,2025-01-01,,true,,,',
].join('\n')

const seed = () => ({ associations: [{ id: ASSOC, organization_id: ORG, name: 'A' }] })
const run = (m: ReturnType<typeof memorySupabase>, apply = true) =>
  runUnitsImport(db(m), { orgId: ORG, associationId: ASSOC, propertiesCsv: PROPS, residentsCsv: RESIDENTS, apply })

describe('import writes both sides of every lot', () => {
  it('creates properties, bridged units, ownerships, owner residents and tenancies', async () => {
    const m = memorySupabase(seed())
    const r = await run(m)
    expect(r.ok).toBe(true)
    expect(r.properties).toEqual({ inserted: 2, reused: 0, errored: 0 })
    expect(r.units).toEqual({ inserted: 2, reused: 0, errored: 0 })

    const props = m.rows('hoa_properties')
    expect(props).toHaveLength(2)
    for (const u of m.rows('units')) {
      expect(props.map((p) => p.id)).toContain(u.legacy_hoa_property_id)
      expect(u).toMatchObject({ organization_id: ORG, association_id: ASSOC })
    }
    expect(m.rows('ownerships')).toHaveLength(2)
    expect(m.rows('tenancies')).toHaveLength(1)

    const residents = m.rows('property_residents')
    expect(residents).toHaveLength(2)
    expect(residents.filter((x) => x.is_primary)).toHaveLength(1)
    // The first owner fills the empty inline owner, so /properties shows it.
    const p1 = props.find((p) => p.address === '1 Test Way')!
    expect(p1).toMatchObject({ owner_email: 'one@example.test' })
  })

  it('is re-runnable: a second run reuses everything', async () => {
    const m = memorySupabase(seed())
    await run(m)
    const r = await run(m)
    expect(r.properties).toEqual({ inserted: 0, reused: 2, errored: 0 })
    expect(r.units).toEqual({ inserted: 0, reused: 2, errored: 0 })
    expect(r.ownerships.reused).toBe(2)
    expect(r.residents.reused).toBe(2)
    expect(m.rows('hoa_properties')).toHaveLength(2)
    expect(m.rows('property_residents')).toHaveLength(2)
  })

  it('links a unit from an earlier units-only import to its existing property by address', async () => {
    const m = memorySupabase({
      ...seed(),
      hoa_properties: [{ id: 'p-old', org_id: ORG, address: '1 TEST WAY.', deleted_at: null, owner_name: null, owner_email: null }],
      units: [{ id: 'u-old', organization_id: ORG, address_line1: '1 Test Way', legacy_hoa_property_id: null, created_at: null }],
    })
    const r = await run(m)
    expect(r.ok).toBe(true)
    expect(m.rows('units').find((u) => u.id === 'u-old')).toMatchObject({ legacy_hoa_property_id: 'p-old' })
    expect(m.rows('hoa_properties')).toHaveLength(2) // p-old + the new 2 Test Way
  })

  it('a failed unit insert removes the property it just created', async () => {
    const m = memorySupabase(seed(), {
      failOn: (c: MemCall, n) => (c.table === 'units' && c.op === 'insert' && n === 0 ? { code: 'XX000', message: 'x' } : null),
    })
    const r = await run(m)
    expect(r.units.errored).toBe(1)
    expect(m.rows('hoa_properties').map((p) => p.address)).toEqual(['2 Test Way'])
    expect(m.rows('units')).toHaveLength(1)
  })

  it('dry run writes nothing', async () => {
    const m = memorySupabase(seed())
    const r = await run(m, false)
    expect(r.dryRun).toBe(true)
    expect(r.properties.inserted).toBe(2)
    expect(r.residents.inserted).toBe(2)
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('refuses an association from another tenant before writing', async () => {
    const m = memorySupabase({ associations: [{ id: ASSOC, organization_id: 'org-2', name: 'X' }] })
    const r = await run(m)
    expect(r.ok).toBe(false)
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })
})

// ─── importLots: the modes the board import uses (P4) ───────────────

describe('importLots: existing homes, by mode', () => {
  const existing = (tenure = 'unknown') =>
    memorySupabase({
      ...seed(),
      hoa_properties: [
        { id: 'p1', org_id: ORG, address: '1 Test Way', unit_number: null, deleted_at: null, tenure, owner_name: 'Owner One', owner_email: 'one@example.test', owner_phone: null },
      ],
      units: [{ id: 'u1', organization_id: ORG, address_line1: '1 Test Way', legacy_hoa_property_id: 'p1', unit_number: null, city: null, created_at: '2024-01-01' }],
      ownerships: [{ id: 'o1', organization_id: ORG, unit_id: 'u1', owner_name: 'Owner One', owner_email: 'one@example.test', owner_phone: null }],
      property_residents: [
        { id: 'r1', organization_id: ORG, property_id: 'p1', full_name: 'Owner One', email: 'one@example.test', phone: null, role: 'owner', is_primary: true, moved_out_at: null, deleted_at: null },
      ],
    })
  const props: LotPropertyRow[] = [
    { id: 'row-2', address_line1: '1 TEST WAY', city: 'Testville', zip: '30000', unit: 'Lot 7', tenure: 'leased' },
    { id: 'row-3', address_line1: '2 Test Way' },
  ]
  const owners: LotResidentRow[] = [
    { id: 'own-2', property_id: 'row-2', full_name: 'Owner One', email: 'ONE@example.test', phone: '555-0100', type: 'owner', is_current: 'true' },
    { id: 'own-3', property_id: 'row-3', full_name: 'Owner Three', email: 'three@example.test', type: 'owner', is_current: 'true' },
  ]
  const go = (m: ReturnType<typeof memorySupabase>, onExisting: 'skip' | 'update', apply = true) =>
    importLots(db(m), { orgId: ORG, associationId: ASSOC, properties: props, residents: owners, apply, onExisting, onAmbiguous: 'error' })

  it("'skip' leaves an existing home and its owner untouched, and creates the new one", async () => {
    const m = existing()
    const r = await go(m, 'skip')
    expect(r.outcomes.properties['row-2']).toMatchObject({ status: 'skipped', propertyId: 'p1' })
    expect(r.outcomes.properties['row-3']).toMatchObject({ status: 'created' })
    expect(r.outcomes.residents['own-2']).toMatchObject({ status: 'skipped' })
    expect(r.skippedHomes).toBe(1)
    expect(m.rows('units').find((u) => u.id === 'u1')).toMatchObject({ city: null, unit_number: null })
    expect(m.rows('ownerships').find((o) => o.id === 'o1')).toMatchObject({ owner_phone: null })
    expect(m.calls.filter((c) => c.op !== 'select' && c.filters.some(([, , v]) => v === 'u1' || v === 'p1'))).toEqual([])
  })

  it("'update' corrects the address details, fills unknown tenure and refreshes the same owner", async () => {
    const m = existing()
    const r = await go(m, 'update')
    expect(r.outcomes.properties['row-2']).toMatchObject({ status: 'updated', propertyId: 'p1' })
    expect(r.outcomes.residents['own-2']).toMatchObject({ status: 'updated' })
    expect(m.rows('units').find((u) => u.id === 'u1')).toMatchObject({ city: 'Testville', postal_code: '30000', unit_number: 'Lot 7' })
    expect(m.rows('hoa_properties').find((p) => p.id === 'p1')).toMatchObject({ tenure: 'leased', unit_number: 'Lot 7', owner_phone: '555-0100' })
    expect(m.rows('ownerships').filter((o) => o.unit_id === 'u1')).toHaveLength(1)
    expect(m.rows('ownerships').find((o) => o.id === 'o1')).toMatchObject({ owner_phone: '555-0100' })
    expect(m.rows('property_residents').find((x) => x.id === 'r1')).toMatchObject({ phone: '555-0100' })
    expect(m.rows('units')).toHaveLength(2)
  })

  it("'update' never overwrites a tenure the board set", async () => {
    const m = existing('owner_occupied')
    await go(m, 'update')
    expect(m.rows('hoa_properties').find((p) => p.id === 'p1')).toMatchObject({ tenure: 'owner_occupied' })
  })

  it('a dry run in update mode classifies without writing', async () => {
    const m = existing()
    const r = await go(m, 'update', false)
    expect(r.outcomes.properties).toMatchObject({ 'row-2': { status: 'updated' }, 'row-3': { status: 'created' } })
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('condo units at one address stay separate homes', async () => {
    const m = memorySupabase(seed())
    const r = await importLots(db(m), {
      orgId: ORG,
      associationId: ASSOC,
      properties: [
        { id: 'a', address_line1: '10 Condo St', unit: '1' },
        { id: 'b', address_line1: '10 Condo St', unit: '2' },
      ],
      residents: [],
      apply: true,
      onExisting: 'skip',
    })
    expect(r.outcomes.properties).toMatchObject({ a: { status: 'created' }, b: { status: 'created' } })
    expect(m.rows('hoa_properties')).toHaveLength(2)
    expect(m.rows('units').map((u) => u.unit_number)).toEqual(['1', '2'])
  })

  it("onAmbiguous 'error' refuses a row that could be either of two homes", async () => {
    const m = memorySupabase({
      ...seed(),
      hoa_properties: [
        { id: 'p1', org_id: ORG, address: '10 Condo St', unit_number: '1', deleted_at: null },
        { id: 'p2', org_id: ORG, address: '10 Condo St', unit_number: '2', deleted_at: null },
      ],
    })
    const r = await importLots(db(m), {
      orgId: ORG,
      associationId: ASSOC,
      properties: [{ id: 'a', address_line1: '10 Condo Street' }],
      residents: [],
      apply: true,
      onExisting: 'update',
      onAmbiguous: 'error',
    })
    expect(r.outcomes.properties.a).toEqual({ status: 'error', reason: expect.stringMatching(/unit number/) })
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })
})
