import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall, type MemOptions } from '@/lib/test-utils/memory-supabase'
import { setUpAssociationCore } from '@/lib/association-setup'
import { chooseAssociation, createLot, listBillableUnits } from './lot'
import {
  UNASSIGNED_HOMES_AUDIT_ACTION,
  adoptUnassignedHomesIfSingle,
  assignUnassignedHomes,
  loadUnassignedHomes,
  unassignedHeadline,
} from './unassigned-homes'

// BL-125. Ids and fixtures are synthetic; nothing here is a real address or person.
const ORG = 'org-1'
const OTHER = 'org-2'
const USER = 'user-1'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

const fail = (table: string, op: string, nth = 0) => (c: MemCall, n: number) =>
  c.table === table && c.op === op && n === nth ? { code: 'XX000', message: 'boom' } : null

function fixture(extra: Record<string, Array<Record<string, unknown>>> = {}, opts: MemOptions = {}) {
  return memorySupabase({
    associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Willow Creek' }],
    units: [
      { id: 'u-null-1', organization_id: ORG, association_id: null, address_line1: '1 Test Way' },
      { id: 'u-null-2', organization_id: ORG, association_id: null, address_line1: '2 Test Way' },
      { id: 'u-has', organization_id: ORG, association_id: 'assoc-1', address_line1: '3 Test Way' },
      { id: 'u-other-org', organization_id: OTHER, association_id: null, address_line1: '9 Elsewhere' },
    ],
    ...extra,
  }, opts)
}

const unitsOf = (m: ReturnType<typeof memorySupabase>) =>
  Object.fromEntries(m.rows('units').map((u) => [u.id as string, u.association_id ?? null]))

describe('assignUnassignedHomes', () => {
  it('attaches only this org’s unassigned homes and audits ids and counts only', async () => {
    const m = fixture()
    const res = await assignUnassignedHomes(db(m), { orgId: ORG, associationId: 'assoc-1', userId: USER, source: 'board_bulk_assign' })
    expect(res).toEqual({ ok: true, assigned: 2, audited: true })
    expect(unitsOf(m)).toEqual({
      'u-null-1': 'assoc-1',
      'u-null-2': 'assoc-1',
      'u-has': 'assoc-1',
      // Another org's home is never touched.
      'u-other-org': null,
    })

    const audit = m.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      action: UNASSIGNED_HOMES_AUDIT_ACTION,
      org_id: ORG,
      user_id: USER,
      entity_type: 'association',
      entity_id: 'assoc-1',
      metadata: { source: 'board_bulk_assign', count: 2, unit_ids: ['u-null-1', 'u-null-2'] },
    })
    // No address (or anything else from the row) reaches the audit row or the logs.
    expect(JSON.stringify(audit)).not.toMatch(/Test Way|Elsewhere/)
    expect(JSON.stringify([...errorSpy.mock.calls, ...infoSpy.mock.calls])).not.toMatch(/Test Way|Elsewhere/)
  })

  it('is idempotent: a second run attaches nothing and writes no second audit row', async () => {
    const m = fixture()
    const args = { orgId: ORG, associationId: 'assoc-1', userId: USER, source: 'board_bulk_assign' as const }
    await assignUnassignedHomes(db(m), args)
    expect(await assignUnassignedHomes(db(m), args)).toEqual({ ok: true, assigned: 0, audited: true })
    expect(m.rows('audit_log')).toHaveLength(1)
  })

  it('never moves a home that already has an association', async () => {
    const m = fixture({
      associations: [
        { id: 'assoc-1', organization_id: ORG, name: 'Willow Creek' },
        { id: 'assoc-2', organization_id: ORG, name: 'Aspen Ridge' },
      ],
    })
    await assignUnassignedHomes(db(m), { orgId: ORG, associationId: 'assoc-2', userId: USER, source: 'board_bulk_assign' })
    expect(unitsOf(m)['u-has']).toBe('assoc-1')
    expect(unitsOf(m)['u-null-1']).toBe('assoc-2')
  })

  it('refuses an association outside the org, writing nothing', async () => {
    const m = fixture({ associations: [{ id: 'assoc-x', organization_id: OTHER, name: 'X' }] })
    const res = await assignUnassignedHomes(db(m), { orgId: ORG, associationId: 'assoc-x', userId: USER, source: 'board_bulk_assign' })
    expect(res.ok).toBe(false)
    expect(m.calls.some((c) => c.table === 'units')).toBe(false)
    expect(m.rows('audit_log')).toHaveLength(0)
  })

  it('reports a failed update and writes no audit row', async () => {
    const m = fixture({}, { failOn: fail('units', 'update') })
    const res = await assignUnassignedHomes(db(m), { orgId: ORG, associationId: 'assoc-1', userId: USER, source: 'board_bulk_assign' })
    expect(res.ok).toBe(false)
    expect(m.rows('audit_log')).toHaveLength(0)
  })

  it('keeps the assignment but says so when the audit row fails', async () => {
    const m = fixture({}, { failOn: fail('audit_log', 'insert') })
    const res = await assignUnassignedHomes(db(m), { orgId: ORG, associationId: 'assoc-1', userId: USER, source: 'board_bulk_assign' })
    expect(res).toEqual({ ok: true, assigned: 2, audited: false })
  })
})

describe('adoptUnassignedHomesIfSingle', () => {
  it('attaches when the org has exactly one association', async () => {
    const m = fixture()
    expect(await adoptUnassignedHomesIfSingle(db(m), { orgId: ORG, associationId: 'assoc-1', userId: USER })).toEqual({
      ok: true,
      assigned: 2,
    })
    expect(m.rows('audit_log')[0]).toMatchObject({ metadata: { source: 'association_setup' } })
  })

  it('does not guess with several associations', async () => {
    const m = fixture({
      associations: [
        { id: 'assoc-1', organization_id: ORG, name: 'Willow Creek' },
        { id: 'assoc-2', organization_id: ORG, name: 'Aspen Ridge' },
      ],
    })
    expect(await adoptUnassignedHomesIfSingle(db(m), { orgId: ORG, associationId: 'assoc-1', userId: USER })).toEqual({
      ok: true,
      assigned: 0,
      skipped: 'several_associations',
    })
    expect(unitsOf(m)['u-null-1']).toBeNull()
  })
})

describe('loadUnassignedHomes', () => {
  it('counts only this org’s unassigned homes and lists its associations by name', async () => {
    const m = fixture({
      associations: [
        { id: 'assoc-2', organization_id: ORG, name: 'Willow Creek' },
        { id: 'assoc-1', organization_id: ORG, name: 'Aspen Ridge' },
        { id: 'assoc-x', organization_id: OTHER, name: 'X' },
      ],
    })
    expect(await loadUnassignedHomes(db(m), ORG)).toEqual({
      ok: true,
      data: {
        count: 2,
        associations: [
          { id: 'assoc-1', name: 'Aspen Ridge' },
          { id: 'assoc-2', name: 'Willow Creek' },
        ],
      },
    })
  })

  it('a failed read is a failure, never "0 unassigned"', async () => {
    const m = fixture({}, { failOn: fail('units', 'select') })
    expect(await loadUnassignedHomes(db(m), ORG)).toEqual({ ok: false })
  })
})

describe('unassignedHeadline', () => {
  it('reads naturally for one and many', () => {
    expect(unassignedHeadline(1)).toBe('1 home isn’t assigned to an association')
    expect(unassignedHeadline(1200)).toBe('1,200 homes aren’t assigned to an association')
  })
})

// The bug as a board meets it: add a home before the association exists,
// set up the association, generate dues — the home must be billed.
describe('BL-125 regression: a home added before the association is billed', () => {
  it('add a home → set up the association → the home is billable', async () => {
    const m = memorySupabase()
    const choice = await chooseAssociation(db(m), ORG, null)
    expect(choice).toEqual({ ok: true, data: { associationId: null } })
    const lot = await createLot(db(m), {
      orgId: ORG,
      associationId: null,
      address: '1 Test Way',
      unitNumber: null,
      owner: { name: null, email: null, phone: null },
      notes: null,
      today: '2026-10-20',
      userId: USER,
    })
    expect(lot.ok).toBe(true)
    if (!lot.ok) return

    const setup = await setUpAssociationCore(db(m), {
      orgId: ORG,
      userId: USER,
      year: 2026,
      input: { name: 'Willow Creek', state: 'FL', type: 'hoa' },
    })
    expect(setup).toMatchObject({ ok: true, created: true, adoptedHomes: 1 })
    if (!setup.ok) return

    const billable = await listBillableUnits(db(m), ORG, setup.associationId)
    expect(billable.map((u) => u.id)).toEqual([lot.data.unitId])

    // A home added AFTER setup gets the one association directly.
    expect(await chooseAssociation(db(m), ORG, null)).toEqual({ ok: true, data: { associationId: setup.associationId } })
  })

  it('"Open the books" on an existing association also catches stragglers', async () => {
    const m = fixture()
    const res = await setUpAssociationCore(db(m), { orgId: ORG, userId: USER, year: 2026, associationId: 'assoc-1' })
    expect(res).toMatchObject({ ok: true, created: false, adoptedHomes: 2 })
  })

  it('a failed adoption does not fail the setup; it reads as null', async () => {
    const m = fixture({}, { failOn: fail('units', 'update') })
    const res = await setUpAssociationCore(db(m), { orgId: ORG, userId: USER, year: 2026, associationId: 'assoc-1' })
    expect(res).toMatchObject({ ok: true, adoptedHomes: null })
  })
})
