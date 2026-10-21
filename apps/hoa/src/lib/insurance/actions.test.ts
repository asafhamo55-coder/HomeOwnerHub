import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-132 (migration 0068, M4_APPLIED). Flag off: no database call at all,
// the board is told why. Flag on: role first, then validation, then the
// association check, then one write through the board's own client.

const h = vi.hoisted(() => ({
  m4: false,
  gate: { ok: true, orgId: 'org-1' } as { ok: boolean; orgId?: string; error?: string },
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  answers: {} as Record<string, { data: unknown; error: unknown }>,
}))

vi.mock('@homeowner-portal/db/m4', () => ({
  get M4_APPLIED() {
    return h.m4
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))

function fakeDb() {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {}
      let first: string | null = null
      for (const op of ['select', 'eq', 'order', 'range', 'insert', 'update', 'delete']) {
        b[op] = (...args: unknown[]) => {
          if (!first || (first === 'select' && op !== 'eq' && op !== 'order' && op !== 'range' && op !== 'select')) first = op
          h.calls.push({ table, op, args })
          return b
        }
      }
      b.then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve(h.answers[`${table}.${first}`] ?? h.answers[table] ?? { data: [], error: null }).then(resolve)
      return b
    },
  }
}
const db = fakeDb()
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))

import { deleteInsurancePolicy, saveInsurancePolicy } from './actions'
import { INSURANCE_NOT_LIVE } from './model'
import { loadInsuranceDocumentOptions, loadInsurancePolicies } from './queries'

const ASSOC = '11111111-1111-4111-8111-111111111111'
const POLICY_ID = '22222222-2222-4222-8222-222222222222'
const good = {
  associationId: ASSOC,
  kind: 'fidelity' as const,
  carrier: 'Acme Mutual',
  policyNumber: 'P-1',
  coverageLimit: '250,000',
  deductible: '1000',
  premium: '',
  effectiveOn: '2026-01-01',
  expiresOn: '2027-01-01',
  documentId: null,
  notes: '',
}

beforeEach(() => {
  h.m4 = false
  h.gate = { ok: true, orgId: 'org-1' }
  h.calls = []
  h.answers = {}
})

describe('flag off (M4_APPLIED false): a no-op that never touches the database', () => {
  it('save and delete refuse with the not-live message', async () => {
    expect(await saveInsurancePolicy({ policy: good })).toEqual({ ok: false, error: INSURANCE_NOT_LIVE })
    expect(await deleteInsurancePolicy(POLICY_ID)).toEqual({ ok: false, error: INSURANCE_NOT_LIVE })
    expect(h.calls).toEqual([])
  })

  it('the loaders return nothing without a query', async () => {
    expect(await loadInsurancePolicies(db, 'org-1')).toEqual([])
    expect(await loadInsuranceDocumentOptions(db, 'org-1')).toEqual([])
    expect(h.calls).toEqual([])
  })
})

describe('flag on', () => {
  beforeEach(() => {
    h.m4 = true
  })

  it('a resident (gate refused) gets the gate error and no query', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await saveInsurancePolicy({ policy: good })).toEqual({ ok: false, error: 'denied' })
    expect(await deleteInsurancePolicy(POLICY_ID)).toEqual({ ok: false, error: 'denied' })
    expect(h.calls).toEqual([])
  })

  it('creates a policy scoped to the org, dollars stored as cents', async () => {
    h.answers['associations.select'] = { data: [{ id: ASSOC }], error: null }
    h.answers['insurance_policies.insert'] = { data: [{ id: POLICY_ID }], error: null }
    const res = await saveInsurancePolicy({ policy: good })
    expect(res).toEqual({ ok: true, id: POLICY_ID })
    const insert = h.calls.find((c) => c.table === 'insurance_policies' && c.op === 'insert')!
    expect(insert.args[0]).toMatchObject({
      organization_id: 'org-1',
      association_id: ASSOC,
      kind: 'fidelity',
      coverage_limit_cents: 25_000_000,
      deductible_cents: 100_000,
      premium_cents: null,
      notes: null,
    })
    expect(h.calls).toContainEqual({ table: 'associations', op: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('refuses another org’s association before writing', async () => {
    h.answers['associations.select'] = { data: [], error: null }
    const res = await saveInsurancePolicy({ policy: good })
    expect(res).toMatchObject({ ok: false, error: 'That association isn’t part of your organization.' })
    expect(h.calls.some((c) => c.table === 'insurance_policies')).toBe(false)
  })

  it('validation: bad kind, end before start, negative or junk money', async () => {
    const res = await saveInsurancePolicy({
      policy: { ...good, kind: 'boat' as never, effectiveOn: '2027-02-01', coverageLimit: '-5' },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(['coverageLimit', 'kind'])
    const dates = await saveInsurancePolicy({ policy: { ...good, effectiveOn: '2027-02-01' } })
    expect(!dates.ok && dates.fieldErrors?.expiresOn).toBeTruthy()
    expect(h.calls).toEqual([])
  })

  it('an update is scoped by id and org; another org’s document maps 23503 to plain words', async () => {
    h.answers['associations.select'] = { data: [{ id: ASSOC }], error: null }
    h.answers['insurance_policies.update'] = { data: null, error: { code: '23503' } }
    const res = await saveInsurancePolicy({ id: POLICY_ID, policy: good })
    expect(res).toEqual({ ok: false, error: 'That document isn’t in your association’s library.' })
    expect(h.calls).toContainEqual({ table: 'insurance_policies', op: 'eq', args: ['id', POLICY_ID] })
    expect(h.calls).toContainEqual({ table: 'insurance_policies', op: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('delete is scoped by id and org; nothing deleted says so', async () => {
    h.answers['insurance_policies.delete'] = { data: [], error: null }
    expect(await deleteInsurancePolicy(POLICY_ID)).toEqual({ ok: false, error: 'That policy isn’t here any more.' })
    expect(await deleteInsurancePolicy('not-a-uuid')).toEqual({ ok: false, error: 'Invalid input.' })
  })

  it('the loaders read the org’s rows; a failed read is null, not empty', async () => {
    h.answers['insurance_policies.select'] = {
      data: [{ id: POLICY_ID, kind: 'flood', carrier: 'C', expires_on: '2027-01-01' }],
      error: null,
    }
    const rows = await loadInsurancePolicies(db, 'org-1')
    expect(rows?.map((r) => r.id)).toEqual([POLICY_ID])
    expect(h.calls).toContainEqual({ table: 'insurance_policies', op: 'eq', args: ['organization_id', 'org-1'] })
    h.answers['insurance_policies.select'] = { data: null, error: { code: 'XX000' } }
    expect(await loadInsurancePolicies(db, 'org-1')).toBeNull()
  })
})
