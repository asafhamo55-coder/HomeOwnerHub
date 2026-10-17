import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { runUnitsImport } from './import'

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
