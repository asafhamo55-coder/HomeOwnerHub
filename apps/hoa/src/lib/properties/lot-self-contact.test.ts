import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { applySelfContact } from './lot'
import type { ApplyPlan } from '@/lib/contact-updates/model'

// PR-10: a resident's approved contact update lands on every row that
// carries it — property_residents, ownerships, tenancies and the home's
// owner fields — in one place, and a failure part-way leaves nothing
// half-changed. Synthetic ids and values only.

const ORG = 'org-1'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never
vi.spyOn(console, 'error').mockImplementation(() => {})

const seed = () => ({
  property_residents: [{ id: 'r1', organization_id: ORG, property_id: 'p1', phone: '(555) 123-4567', email: 'pat@example.test', notes: null }],
  ownerships: [{ id: 'o1', organization_id: ORG, unit_id: 'u1', owner_phone: '(555) 123-4567', owner_email: 'pat@example.test' }],
  tenancies: [{ id: 't1', organization_id: ORG, unit_id: 'u1', tenant_phone: null, tenant_email: 'pat@example.test' }],
  hoa_properties: [{ id: 'p1', org_id: ORG, owner_phone: '(555) 123-4567', owner_email: 'pat@example.test' }],
})

const plan: ApplyPlan = {
  residents: [{ id: 'r1', patch: { phone: '(555) 222-3333', notes: 'Mailing address: PO Box 9' }, before: { phone: '(555) 123-4567', notes: null } }],
  ownerships: [{ id: 'o1', patch: { owner_phone: '(555) 222-3333' }, before: { owner_phone: '(555) 123-4567' } }],
  tenancies: [{ id: 't1', patch: { tenant_phone: '(555) 222-3333' }, before: { tenant_phone: null } }],
  property: { patch: { owner_phone: '(555) 222-3333' }, before: { owner_phone: '(555) 123-4567' } },
  applied: ['phone', 'mailing'],
  held: [],
  names: ['Pat'],
}

const fail = (table: string, op: string, nth = 0) => (c: MemCall, n: number) =>
  c.table === table && c.op === op && n === nth ? { code: 'XX000', message: 'boom' } : null

describe('applySelfContact', () => {
  it('writes every row in the plan, scoped to the org', async () => {
    const m = memorySupabase(seed())
    const r = await applySelfContact(db(m), { orgId: ORG, propertyId: 'p1', plan })
    expect(r).toEqual({ ok: true, data: { residents: 1, ownerships: 1, tenancies: 1, property: true } })
    expect(m.rows('property_residents')[0]).toMatchObject({ phone: '(555) 222-3333', notes: 'Mailing address: PO Box 9' })
    expect(m.rows('ownerships')[0]).toMatchObject({ owner_phone: '(555) 222-3333' })
    expect(m.rows('tenancies')[0]).toMatchObject({ tenant_phone: '(555) 222-3333' })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ owner_phone: '(555) 222-3333' })
    for (const c of m.calls.filter((c) => c.op === 'update')) {
      const orgCol = c.table === 'hoa_properties' ? 'org_id' : 'organization_id'
      expect(c.filters, c.table).toContainEqual(['eq', orgCol, ORG])
    }
  })

  it('a later failure puts every earlier row back and says nothing changed', async () => {
    const m = memorySupabase(seed(), { failOn: fail('hoa_properties', 'update') })
    const r = await applySelfContact(db(m), { orgId: ORG, propertyId: 'p1', plan })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Nothing was changed/)
    expect(m.rows('property_residents')[0]).toMatchObject({ phone: '(555) 123-4567', notes: null })
    expect(m.rows('ownerships')[0]).toMatchObject({ owner_phone: '(555) 123-4567' })
    expect(m.rows('tenancies')[0]).toMatchObject({ tenant_phone: null })
  })

  it('logs ids and codes only — never the new phone or email', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = memorySupabase(seed(), { failOn: fail('ownerships', 'update') })
    await applySelfContact(db(m), { orgId: ORG, propertyId: 'p1', plan })
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('222-3333')
    expect(logged).not.toContain('PO Box')
    expect(logged).not.toContain('example.test')
  })

  it('an empty plan writes nothing', async () => {
    const m = memorySupabase(seed())
    const r = await applySelfContact(db(m), {
      orgId: ORG,
      propertyId: 'p1',
      plan: { ...plan, residents: [], ownerships: [], tenancies: [], property: null },
    })
    expect(r).toEqual({ ok: true, data: { residents: 0, ownerships: 0, tenancies: 0, property: false } })
    expect(m.calls.filter((c) => c.op === 'update')).toEqual([])
  })
})
