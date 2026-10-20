import { describe, expect, it } from 'vitest'
import { createPlanWithLedger } from './create'
import { openCents, planLedger } from './ledger'
import { installmentFromMemo, replacedChargeFromMemo, planKey } from './progress'
import { addMonthsClamped, installmentSchedule, legacyDueDate } from './schedule'
import { accountBalanceCents, memPlanStore, REFS, seedCharge, unbalancedEntries, unitOwedCents, type MemPlanStore } from './test-plan-store'

const UNIT = 'u0000000-0000-4000-8000-000000000001'

function home(): MemPlanStore {
  const s = memPlanStore()
  seedCharge(s, { id: 'c-aug', unitId: UNIT, assessmentType: 'regular', dueDate: '2026-08-01', amountCents: 30_000 })
  seedCharge(s, { id: 'c-sep', unitId: UNIT, assessmentType: 'regular', dueDate: '2026-09-01', amountCents: 30_000, status: 'partial', payments: [10_000] })
  seedCharge(s, { id: 'lf-aug', unitId: UNIT, assessmentType: 'late_fee', dueDate: '2026-08-15', amountCents: 1_500 })
  return s
}

const snapshot = (s: MemPlanStore) => ({
  ar: accountBalanceCents(s, REFS.acctAR),
  assessmentIncome: accountBalanceCents(s, REFS.acctAssessmentIncome),
  lateFeeIncome: accountBalanceCents(s, REFS.acctLateFeeIncome),
  owed: unitOwedCents(s, UNIT),
})

describe('schedule: month-end clamp', () => {
  it('Jan 31 → Feb 28 → Mar 31 → Apr 30, never two in March', () => {
    expect(installmentSchedule('2026-01-31', 4, 40_000).map((i) => i.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('leap years and year rollover', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-12-31', 2)).toBe('2027-02-28')
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28')
  })
  it('legacyDueDate reproduces the old overflow (kept only to recognise old installments)', () => {
    expect(legacyDueDate('2026-01-31', 1)).toBe('2026-03-03')
  })
  it('amounts add to the total, drift on the last', () => {
    const s = installmentSchedule('2026-10-01', 3, 10_000)
    expect(s.map((i) => i.amountCents)).toEqual([3_333, 3_333, 3_334])
    expect(s.reduce((t, i) => t + i.amountCents, 0)).toBe(10_000)
  })
})

describe('createPlanWithLedger', () => {
  it('net balance, AR and total income do not change; income is recognised once', async () => {
    const s = home()
    const before = snapshot(s)
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug', 'c-sep', 'lf-aug'], installmentCount: 3, startDate: '2026-10-31' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const after = snapshot(s)
    expect(r.totalCents).toBe(30_000 + 20_000 + 1_500)
    expect(after.owed).toBe(before.owed)
    expect(after.ar).toBe(before.ar)
    // Income once: total income (credit-normal, so negative) is unchanged.
    expect(after.assessmentIncome + after.lateFeeIncome).toBe(before.assessmentIncome + before.lateFeeIncome)
    // The income originally billed, never more: 600 + 15 billed, both still counted once.
    expect(-(after.assessmentIncome + after.lateFeeIncome)).toBe(61_500)
  })

  it('every entry balances overall and per fund', async () => {
    const s = home()
    await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug', 'c-sep', 'lf-aug'], installmentCount: 4, startDate: '2026-11-15' })
    expect(unbalancedEntries(s)).toEqual([])
  })

  it('closes the replaced charges (waived) and links them and the installments to the plan by memo', async () => {
    const s = home()
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug', 'c-sep'], installmentCount: 2, startDate: '2027-01-31' })
    if (!r.ok) throw new Error(r.error)
    expect(s.charges.filter((c) => c.id.startsWith('c-')).map((c) => c.status)).toEqual(['waived', 'waived'])
    expect(s.charges.find((c) => c.id === 'lf-aug')!.status).toBe('open')
    const key = planKey(r.planId)
    const closing = s.entries.filter((e) => replacedChargeFromMemo(e.memo)?.key === key)
    expect(closing.map((e) => e.sourceId).sort()).toEqual(['c-aug', 'c-sep'])
    // Partly paid: closed for what was left (200), not the full 300.
    expect(closing.find((e) => e.sourceId === 'c-sep')!.lines[1]).toMatchObject({ accountId: REFS.acctAR, credit: 200 })
    const inst = s.entries.filter((e) => installmentFromMemo(e.memo)?.key === key)
    expect(inst).toHaveLength(2)
    const installments = s.charges.filter((c) => r.installmentIds.includes(c.id))
    expect(installments.map((c) => [c.dueDate, c.amountCents])).toEqual([
      ['2027-01-31', 25_000],
      ['2027-02-28', 25_000],
    ])
  })

  it('a late fee is closed against late-fee income', async () => {
    const s = home()
    await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['lf-aug'], installmentCount: 2, startDate: '2026-11-01' })
    expect(accountBalanceCents(s, REFS.acctLateFeeIncome)).toBe(0)
  })

  it('refuses a charge that is not open, before writing anything', async () => {
    const s = home()
    s.charges[0]!.status = 'paid'
    const n = s.entries.length
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug'], installmentCount: 2, startDate: '2026-11-01' })
    expect(r.ok).toBe(false)
    expect(s.entries).toHaveLength(n)
    expect(s.plans).toHaveLength(0)
  })

  it('refuses when the open balance moved since the form loaded', async () => {
    const s = home()
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug'], installmentCount: 2, startDate: '2026-11-01', expectedTotalCents: 29_000 })
    expect(r).toMatchObject({ ok: false })
    expect(s.plans).toHaveLength(0)
  })

  it('refuses too many installments for the balance', async () => {
    const s = memPlanStore()
    seedCharge(s, { id: 'tiny', unitId: UNIT, assessmentType: 'regular', dueDate: '2026-08-01', amountCents: 9 })
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['tiny'], installmentCount: 6, startDate: '2026-11-01' })
    expect(r.ok).toBe(false)
  })

  it('a charge paid meanwhile: everything is undone and the books are as before', async () => {
    const s = home()
    s.failClaimFor = 'c-sep'
    const before = snapshot(s)
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug', 'c-sep'], installmentCount: 2, startDate: '2026-11-01' })
    expect(r.ok).toBe(false)
    expect(snapshot(s)).toEqual(before)
    expect(s.charges.find((c) => c.id === 'c-aug')!.status).toBe('open')
    expect(s.plans).toHaveLength(0)
    expect(unbalancedEntries(s)).toEqual([])
  })

  it('an installment entry failing: closings reversed, charges re-opened, installments removed', async () => {
    const s = home()
    s.failPostAt = 3 // 2 closings post, then installment 1 fails
    const before = snapshot(s)
    const r = await createPlanWithLedger(s, REFS, { unitId: UNIT, chargeIds: ['c-aug', 'c-sep'], installmentCount: 2, startDate: '2026-11-01' })
    expect(r.ok).toBe(false)
    expect(snapshot(s)).toEqual(before)
    expect(s.charges.map((c) => c.status)).toEqual(['open', 'partial', 'open'])
    expect(s.entries.filter((e) => e.source === 'reversing')).toHaveLength(2)
  })
})

describe('planLedger', () => {
  it('openCents ignores closed and deleted charges', () => {
    expect(openCents({ amountCents: 100, paidCents: 0, status: 'waived', deleted: false })).toBe(0)
    expect(openCents({ amountCents: 100, paidCents: 0, status: 'open', deleted: true })).toBe(0)
    expect(openCents({ amountCents: 100, paidCents: 30, status: 'partial', deleted: false })).toBe(70)
  })
  it('installment total equals what the replaced charges had open', () => {
    const l = planLedger({
      planId: '1a2b3c4d-0000-4000-8000-000000000001',
      startDate: '2026-10-31',
      installmentCount: 7,
      charges: [{ id: 'x', assessmentType: 'regular', dueDate: '2026-09-01', amountCents: 100_001, paidCents: 1, status: 'partial', deleted: false }],
      refs: REFS,
    })
    expect(l.installments.reduce((t, i) => t + i.amountCents, 0)).toBe(l.totalCents)
    expect(l.totalCents).toBe(100_000)
  })
})
