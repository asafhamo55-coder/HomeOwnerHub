import { describe, expect, it } from 'vitest'
import {
  installmentFromMemo,
  installmentMemo,
  installmentsByPlan,
  isSettled,
  planProgress,
  type InstallmentRecord,
} from './progress'
import { completePaidOffPlans, loadCompletionDays, PLAN_COMPLETED_ACTION } from './settle'
import { memDb } from './test-db'

// BL-080. Dates are association calendar days (YYYY-MM-DD) passed in
// explicitly — no clock is read anywhere in this module.

const PLAN = '1a2b3c4d-0000-4000-8000-000000000001'
const OTHER_PLAN = '9f9f9f9f-0000-4000-8000-000000000002'
const UNIT = 'unit-1'
const ASSOC = 'assoc-1'
const ORG = 'org-1'

const inst = (index: number, over: Partial<InstallmentRecord> = {}): InstallmentRecord => ({
  assessmentId: `as-${index}`,
  unitId: UNIT,
  key: '1a2b3c4d',
  index,
  dueDate: `2026-0${index}-15`,
  amount: 100,
  paid: 0,
  status: 'open',
  deleted: false,
  ...over,
})

describe('installment memo link', () => {
  it('round-trips the memo createPaymentPlan writes', () => {
    const memo = installmentMemo(2, 6, PLAN)
    expect(memo).toBe('Payment plan installment 2/6 (plan 1a2b3c4d)')
    expect(installmentFromMemo(memo)).toEqual({ index: 2, count: 6, key: '1a2b3c4d' })
  })

  it('ignores any other memo', () => {
    expect(installmentFromMemo('Payment received against assessment 1a2b3c4d')).toBeNull()
    expect(installmentFromMemo('Payment plan installment x/6 (plan 1a2b3c4d)')).toBeNull()
  })

  it('groups by memo key AND unit — a key collision on another unit is not this plan', () => {
    const plans = [{ id: PLAN, unitId: UNIT, installmentCount: 2, status: 'active' }]
    const g = installmentsByPlan(plans, [inst(1), inst(2, { unitId: 'unit-2' })])
    expect(g.get(PLAN)?.map((i) => i.index)).toEqual([1])
  })
})

describe('isSettled', () => {
  it('needs payments covering the amount to the cent', () => {
    expect(isSettled(inst(1, { paid: 99.99 }))).toBe(false)
    expect(isSettled(inst(1, { paid: 100 }))).toBe(true)
    expect(isSettled(inst(1, { amount: 0.3, paid: 0.1 + 0.2 }))).toBe(true)
  })
  it('counts waived, written-off and deleted charges as nothing owed', () => {
    expect(isSettled(inst(1, { status: 'waived' }))).toBe(true)
    expect(isSettled(inst(1, { status: 'written_off' }))).toBe(true)
    expect(isSettled(inst(1, { deleted: true }))).toBe(true)
  })
  it('does not trust a status of paid without the payments behind it', () => {
    expect(isSettled(inst(1, { status: 'paid', paid: 0 }))).toBe(false)
  })
})

describe('planProgress', () => {
  const plan = { installmentCount: 3 }

  it('paid_off when every scheduled installment is covered', () => {
    const p = planProgress(plan, [inst(1, { paid: 100 }), inst(2, { paid: 100 }), inst(3, { paid: 120 })], '2026-03-20')
    expect(p).toMatchObject({ standing: 'paid_off', found: 3, settled: 3, overdue: 0, nextDueDate: null, paidTotal: 300, scheduledTotal: 300 })
  })

  it('behind when an unpaid installment was due before the association day', () => {
    const p = planProgress(plan, [inst(1, { paid: 100 }), inst(2), inst(3)], '2026-02-16')
    expect(p).toMatchObject({ standing: 'behind', overdue: 1, nextDueDate: '2026-02-15' })
  })

  it('on the due date itself is not yet behind', () => {
    expect(planProgress(plan, [inst(1, { paid: 100 }), inst(2), inst(3)], '2026-02-15').standing).toBe('on_track')
  })

  it('overpaying one installment does not pay the next', () => {
    expect(planProgress(plan, [inst(1, { paid: 300 }), inst(2), inst(3)], '2026-01-20').standing).toBe('on_track')
  })

  it('never completes when installments are missing from the link', () => {
    const p = planProgress(plan, [inst(1, { paid: 100 }), inst(2, { paid: 100 })], '2026-01-20')
    expect(p.standing).toBe('unlinked')
  })

  it('counts a duplicated link once', () => {
    const p = planProgress({ installmentCount: 2 }, [inst(1, { paid: 100 }), inst(1, { paid: 100 }), inst(2)], '2026-01-01')
    expect(p).toMatchObject({ found: 2, settled: 1 })
  })
})

// ─── the write path ────────────────────────────────────────────────

function fixture(paid: number[], opts: { status?: string; otherAssociation?: boolean } = {}) {
  const assessments = paid.map((p, i) => ({
    id: `as-${i + 1}`,
    association_id: ASSOC,
    unit_id: UNIT,
    amount: 100,
    due_date: `2026-0${i + 1}-15`,
    status: p >= 100 ? 'paid' : 'open',
    deleted_at: null,
    payments: p > 0 ? [{ amount: p }] : [],
  }))
  const jes = paid.map((_, i) => ({
    id: `je-${i + 1}`,
    association_id: ASSOC,
    source: 'ar_payment',
    source_id: `as-${i + 1}`,
    memo: installmentMemo(i + 1, paid.length, PLAN),
  }))
  return memDb({
    payment_plans: [
      {
        id: PLAN,
        organization_id: ORG,
        unit_id: UNIT,
        installment_count: paid.length,
        status: opts.status ?? 'active',
        unit: { association_id: opts.otherAssociation ? 'assoc-2' : ASSOC },
      },
    ],
    journal_entries: [
      ...jes,
      // A payment entry against an installment: never read as a link.
      { id: 'je-pay', association_id: ASSOC, source: 'ar_payment', source_id: 'pay-1', memo: 'Payment received against assessment as-1' },
    ],
    assessments,
    audit_log: [],
  })
}

const input = { organizationId: ORG, associationId: ASSOC, today: '2026-03-20', actorUserId: 'user-1', trigger: 'payment' as const }

describe('completePaidOffPlans', () => {
  it('completes a paid-off plan and writes one audit row with the day — ids and counts only', async () => {
    const m = fixture([100, 100, 100])
    const r = await completePaidOffPlans(m.db, { ...input, unitIds: [UNIT] })
    expect(r).toEqual({ checked: 1, completed: [PLAN], auditFailed: 0 })
    expect(m.tables.payment_plans[0].status).toBe('completed')
    expect(m.tables.audit_log).toEqual([
      expect.objectContaining({
        org_id: ORG,
        user_id: 'user-1',
        action: PLAN_COMPLETED_ACTION,
        entity_type: 'payment_plan',
        entity_id: PLAN,
        metadata: { completed_on: '2026-03-20', unit_id: UNIT, installments: 3, trigger: 'payment' },
      }),
    ])
  })

  it('leaves a plan with an unpaid installment active, and writes nothing', async () => {
    const m = fixture([100, 100, 40])
    const r = await completePaidOffPlans(m.db, input)
    expect(r.completed).toEqual([])
    expect(m.tables.payment_plans[0].status).toBe('active')
    expect(m.writes).toEqual([])
  })

  it('a second run finds nothing to do (the status write is a claim)', async () => {
    const m = fixture([100, 100])
    await completePaidOffPlans(m.db, input)
    const again = await completePaidOffPlans(m.db, { ...input, trigger: 'nightly', actorUserId: null })
    expect(again).toEqual({ checked: 0, completed: [], auditFailed: 0 })
    expect(m.tables.audit_log).toHaveLength(1)
  })

  it('ignores a plan on another association’s unit', async () => {
    const m = fixture([100, 100], { otherAssociation: true })
    expect((await completePaidOffPlans(m.db, input)).checked).toBe(0)
  })

  it('throws on a failed read instead of reading it as nothing paid', async () => {
    const m = memDb({ payment_plans: [] }, { failTable: 'payment_plans' })
    await expect(completePaidOffPlans(m.db, input)).rejects.toThrow(/payment plans read failed \(57014\)/)
  })

  it('the board reads the completion day back from the audit row', async () => {
    const m = fixture([100, 100])
    await completePaidOffPlans(m.db, input)
    const days = await loadCompletionDays(m.db, ORG, [PLAN])
    expect(days.get(PLAN)).toBe('2026-03-20')
  })
})
