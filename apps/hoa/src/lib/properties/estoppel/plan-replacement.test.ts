// Estoppel and collections-letter figures for a home with a payment plan
// made by the 2026-10-19 fix: the replaced charges are closed and the
// installments carry the same balance, so nothing is counted twice.
import { describe, expect, it } from 'vitest'
import { createPlanWithLedger } from '@homeowner-portal/workflows/payment-plans'
import { memPlanStore, REFS, seedCharge, type MemPlanStore } from '../../../../../../packages/workflows/src/payment-plans/test-plan-store'
import type { LedgerAssessment, LedgerPayment } from '@/lib/resident-ledger'
import { letterFigures, type LetterInput } from '@/lib/collections/letters/model'
import { computeFigures, type EstoppelInput, type EstoppelPlan } from './model'

const UNIT = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-10-19'

function toInput(s: MemPlanStore): EstoppelInput {
  const charges: LedgerAssessment[] = s.charges.map((c) => ({
    id: c.id,
    unit_id: c.unitId,
    amount: c.amountCents / 100,
    due_date: c.dueDate,
    status: c.status,
    assessment_type: c.assessmentType,
    memo_code: null,
  }))
  const payments: LedgerPayment[] = s.charges.flatMap((c) =>
    c.payments.map((p, i) => ({ id: `${c.id}-p${i}`, unit_id: c.unitId, assessment_id: c.id, amount: p / 100, paid_at: '2026-09-03T15:00:00Z', payment_method: 'check' })),
  )
  const plans: EstoppelPlan[] = s.plans.map((p) => ({
    id: p.id,
    status: 'active',
    installmentAmount: p.installmentCents / 100,
    installmentCount: p.installmentCount,
    totalAmount: p.totalCents / 100,
    startDate: p.startDate,
  }))
  return {
    state: 'FL',
    associationName: 'Fixture HOA',
    propertyId: '22222222-2222-4222-8222-222222222222',
    address: '14 Oak Lane',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: null,
    owners: ['Owner A'],
    charges,
    payments,
    violations: [],
    plans,
    collectionCase: null,
    timeZone: 'America/New_York',
  }
}

function home(): MemPlanStore {
  const s = memPlanStore()
  seedCharge(s, { id: 'a-aug', unitId: UNIT, assessmentType: 'regular', dueDate: '2026-08-01', amountCents: 30_000 })
  seedCharge(s, { id: 'a-sep', unitId: UNIT, assessmentType: 'regular', dueDate: '2026-09-01', amountCents: 30_000, status: 'partial', payments: [10_000] })
  seedCharge(s, { id: 'lf-aug', unitId: UNIT, assessmentType: 'late_fee', dueDate: '2026-08-15', amountCents: 2_500 })
  return s
}

const total = (f: ReturnType<typeof computeFigures>) => f.currentBalanceCents + f.notYetDueCents

describe('a payment plan on the estoppel and the collections letter', () => {
  it('the total owed is the same before and after the plan, not doubled', async () => {
    const s = home()
    const before = computeFigures(toInput(s), TODAY, null)
    expect(total(before)).toBe(52_500)
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['a-aug', 'a-sep', 'lf-aug'], installmentCount: 3, startDate: '2026-09-30' })
    expect(r.ok).toBe(true)
    const after = computeFigures(toInput(s), TODAY, null)
    expect(total(after)).toBe(52_500)
  })

  it('what is past due is the installments that are due, not the replaced charges', async () => {
    const s = home()
    await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['a-aug', 'a-sep', 'lf-aug'], installmentCount: 3, startDate: '2026-09-30' })
    const f = computeFigures(toInput(s), TODAY, null)
    // Sep 30 is past due; Oct 30 and Nov 30 are not due yet. 52,500 / 3 = 17,500.
    expect(f.owedItems.map((l) => [l.dueDate, l.type, l.remainingCents])).toEqual([['2026-09-30', 'plan_installment', 17_500]])
    expect(f.pastDueCents).toBe(17_500)
    expect(f.notYetDue.map((l) => l.dueDate)).toEqual(['2026-10-30', '2026-11-30'])
    expect(f.specials).toEqual([])
    expect(f.activePlan).not.toBeNull()
  })

  it('the collections letter lists the overdue installment only', async () => {
    const s = home()
    await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['a-aug', 'a-sep', 'lf-aug'], installmentCount: 3, startDate: '2026-09-30' })
    const input: LetterInput = toInput(s)
    const lf = letterFigures(input, 'fl_late_notice', TODAY)
    expect(lf.assessmentLines.map((l) => l.type)).toEqual(['plan_installment'])
    expect(lf.lateFeeLines).toEqual([])
    expect(lf.ledgerCents).toBe(17_500)
  })

  it('a month-end plan made before the fix (overflowed dates) is still recognised as installments', () => {
    const s = memPlanStore()
    // The old code: Jan 31 + 1 month = Mar 3.
    seedCharge(s, { id: 'i1', unitId: UNIT, assessmentType: 'special', dueDate: '2026-01-31', amountCents: 10_000 })
    seedCharge(s, { id: 'i2', unitId: UNIT, assessmentType: 'special', dueDate: '2026-03-03', amountCents: 10_000 })
    s.plans.push({ id: 'p-old', unitId: UNIT, totalCents: 20_000, installmentCount: 2, installmentCents: 10_000, startDate: '2026-01-31' })
    const f = computeFigures(toInput(s), TODAY, null)
    expect(f.owedItems.map((l) => l.type)).toEqual(['plan_installment', 'plan_installment'])
  })
})
