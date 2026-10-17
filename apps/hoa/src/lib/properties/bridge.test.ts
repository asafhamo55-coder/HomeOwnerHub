import { describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'
import {
  asPropertyId,
  asUnitId,
  pickCanonicalUnit,
  propertyIdsForUnits,
  resolvePropertyForUnit,
  resolveUnitForProperty,
  unitIdsForProperties,
} from './resolve'
import { resolvePropertyUrl } from './canonical'
import { propertyHref } from './href'

vi.spyOn(console, 'error').mockImplementation(() => {})

const ORG = 'org-1'
const P1 = '11111111-1111-4111-8111-111111111111'
const U1 = '22222222-2222-4222-8222-222222222221'
const U2 = '22222222-2222-4222-8222-222222222222'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

const unit = (id: string, propertyId: string | null, created_at: string | null, org = ORG) => ({
  id,
  organization_id: org,
  legacy_hoa_property_id: propertyId,
  created_at,
})

describe('pickCanonicalUnit: the view rule (created_at NULLS LAST, id)', () => {
  it('earliest created_at wins; nulls last; ties by id', () => {
    expect(pickCanonicalUnit([])).toBeNull()
    expect(
      pickCanonicalUnit([
        { id: 'b', created_at: '2026-02-01T00:00:00Z' },
        { id: 'c', created_at: null },
        { id: 'a', created_at: '2026-03-01T00:00:00Z' },
      ])?.id,
    ).toBe('b')
    expect(
      pickCanonicalUnit([
        { id: 'z', created_at: '2026-02-01T00:00:00Z' },
        { id: 'y', created_at: '2026-02-01T00:00:00Z' },
      ])?.id,
    ).toBe('y')
    expect(pickCanonicalUnit([{ id: 'q', created_at: null }, { id: 'p', created_at: null }])?.id).toBe('p')
  })
})

describe('resolveUnitForProperty: 0 / 1 / many', () => {
  it('0 units → null, not an error', async () => {
    const r = await resolveUnitForProperty(db(memorySupabase()), ORG, asPropertyId(P1))
    expect(r).toEqual({ unitId: null, unitIds: [], unitCount: 0, duplicate: false })
  })

  it('1 unit → it', async () => {
    const m = memorySupabase({ units: [unit(U1, P1, '2026-01-01T00:00:00Z')] })
    expect(await resolveUnitForProperty(db(m), ORG, asPropertyId(P1))).toMatchObject({
      unitId: U1,
      unitCount: 1,
      duplicate: false,
    })
  })

  it('many units → the canonical one plus the duplicate flag (no .maybeSingle crash)', async () => {
    const m = memorySupabase({
      units: [unit(U2, P1, '2026-02-01T00:00:00Z'), unit(U1, P1, '2026-01-01T00:00:00Z')],
    })
    expect(await resolveUnitForProperty(db(m), ORG, asPropertyId(P1))).toMatchObject({
      unitId: U1,
      unitCount: 2,
      duplicate: true,
    })
  })

  it('another org’s unit is invisible', async () => {
    const m = memorySupabase({ units: [unit(U1, P1, null, 'org-2')] })
    expect((await resolveUnitForProperty(db(m), ORG, asPropertyId(P1))).unitId).toBeNull()
  })

  it('a failed read throws (never reads as "not linked")', async () => {
    const m = memorySupabase({}, { failOn: () => ({ code: 'XX000', message: 'boom' }) })
    await expect(resolveUnitForProperty(db(m), ORG, asPropertyId(P1))).rejects.toMatchObject({ code: 'XX000' })
  })
})

describe('reverse and bulk lookups', () => {
  it('unit → property, and bulk in both directions', async () => {
    const m = memorySupabase({
      units: [unit(U1, P1, '2026-01-01T00:00:00Z'), unit(U2, P1, '2026-02-01T00:00:00Z'), unit('u-free', null, null)],
    })
    expect(await resolvePropertyForUnit(db(m), ORG, asUnitId(U2))).toBe(P1)
    expect(await resolvePropertyForUnit(db(m), ORG, asUnitId('u-free'))).toBeNull()
    expect([...(await propertyIdsForUnits(db(m), ORG, [U1, 'u-free']))]).toEqual([[U1, P1]])
    expect([...(await unitIdsForProperties(db(m), ORG, [P1]))]).toEqual([[P1, U1]])
  })
})

describe('/properties/[id] accepts either id', () => {
  const seed = () =>
    memorySupabase({
      hoa_properties: [
        { id: P1, org_id: ORG, deleted_at: null },
        { id: '33333333-3333-4333-8333-333333333333', org_id: ORG, deleted_at: '2026-10-01T00:00:00Z' },
      ],
      units: [unit(U1, P1, null), unit(U2, '33333333-3333-4333-8333-333333333333', null)],
    })

  it('a property id renders', async () => {
    expect(await resolvePropertyUrl(db(seed()), ORG, P1)).toEqual({ kind: 'property', propertyId: P1 })
  })

  it('a unit id redirects to the canonical property URL, keeping the query', async () => {
    expect(await resolvePropertyUrl(db(seed()), ORG, U1, new URLSearchParams({ tab: 'dues' }))).toEqual({
      kind: 'redirect',
      href: `/properties/${P1}?tab=dues`,
    })
  })

  it('a unit of a deleted property, another org’s id, or garbage → not found', async () => {
    expect(await resolvePropertyUrl(db(seed()), ORG, U2)).toEqual({ kind: 'not_found' })
    expect(await resolvePropertyUrl(db(seed()), 'org-2', P1)).toEqual({ kind: 'not_found' })
    expect(await resolvePropertyUrl(db(seed()), ORG, 'not-a-uuid')).toEqual({ kind: 'not_found' })
  })
})

describe('propertyHref', () => {
  it('builds the page, edit and query forms', () => {
    expect(propertyHref(asPropertyId(P1))).toBe(`/properties/${P1}`)
    expect(propertyHref(asPropertyId(P1), { edit: true })).toBe(`/properties/${P1}/edit`)
    expect(propertyHref(asUnitId(U1), { query: { tab: 'mail' } })).toBe(`/properties/${U1}?tab=mail`)
    expect(propertyHref(asPropertyId(P1), { query: '?a=1' })).toBe(`/properties/${P1}?a=1`)
    expect(propertyHref(asPropertyId(P1), { query: new URLSearchParams() })).toBe(`/properties/${P1}`)
  })
})
