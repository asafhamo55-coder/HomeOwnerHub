import { describe, expect, it } from 'vitest'
import type { LedgerAssessment, LedgerPayment } from '@/lib/resident-ledger'
import { flFeeCap, GA_CONDO_FEE_NOTES, GA_CONDO_NOTES } from './law'
import {
  blanksLeft,
  buildCertificate,
  checkFee,
  inferFrequency,
  chargeLines,
  jurisdictionOf,
  statuteAnswers,
  statuteProblem,
  parseMoneyCents,
  printSnapshot,
  requestProblem,
  snapshotMatches,
  valueOf,
  type EstoppelInput,
  type EstoppelRequest,
} from './model'
import { auditFigures, violationDisclosure } from './model'

const UNIT = '11111111-1111-4111-8111-111111111111'

const charge = (id: string, due: string, amount: number, type = 'regular', status = 'open'): LedgerAssessment => ({
  id,
  unit_id: UNIT,
  amount,
  due_date: due,
  status,
  assessment_type: type,
  memo_code: null,
})
const pay = (id: string, assessmentId: string | null, amount: number, paidAt: string): LedgerPayment => ({
  id,
  unit_id: UNIT,
  assessment_id: assessmentId,
  amount,
  paid_at: paidAt,
  payment_method: 'check',
})

/**
 * A Florida home, issued Mon Oct 19 2026. Monthly $300 dues on the 1st:
 * Jul and Aug paid, Sep part-paid ($100), Oct unpaid, Nov billed ahead.
 * A $500 special assessment due Dec 15, a $25 late fee waived, and a
 * $50 payment not applied to any charge.
 *   ledger balance = 2025 charged − 750 paid − 25 waived = 1250
 *   not yet due    = Nov 300 + special 500                = 800
 *   current        = 1250 − 800                            = 450
 *   owed items     = Sep 200 + Oct 300                     = 500 (and −50 unapplied)
 */
function fixture(over: Partial<EstoppelInput> = {}): EstoppelInput {
  return {
    state: 'FL',
    associationName: 'Fixture HOA',
    propertyId: '22222222-2222-4222-8222-222222222222',
    address: '14 Oak Lane',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: null,
    owners: ['Owner A'],
    charges: [
      charge('a-jul', '2026-07-01', 300),
      charge('a-aug', '2026-08-01', 300),
      charge('a-sep', '2026-09-01', 300, 'regular', 'partial'),
      charge('a-oct', '2026-10-01', 300),
      charge('a-nov', '2026-11-01', 300),
      charge('a-spec', '2026-12-15', 500, 'special'),
      charge('a-late', '2026-09-15', 25, 'late_fee', 'waived'),
    ],
    payments: [
      pay('p-jul', 'a-jul', 300, '2026-07-02T15:00:00Z'),
      pay('p-aug', 'a-aug', 300, '2026-08-03T15:00:00Z'),
      pay('p-sep', 'a-sep', 100, '2026-09-04T15:00:00Z'),
      pay('p-loose', null, 50, '2026-10-05T15:00:00Z'),
    ],
    violations: [
      { id: 'v-open', description: 'Trash cans visible', status: 'notice_sent', noticeSentAt: '2026-10-01T12:00:00Z', resolvedAt: null },
      { id: 'v-done', description: 'Old', status: 'resolved', noticeSentAt: '2026-01-01T12:00:00Z', resolvedAt: '2026-02-01T12:00:00Z' },
    ],
    plans: [],
    planInstallmentIds: [],
    collectionCase: null,
    timeZone: 'America/New_York',
    ...over,
  }
}

const req = (over: Partial<EstoppelRequest> = {}): EstoppelRequest => ({
  requestDate: '2026-10-09',
  issueDate: '2026-10-19',
  delivery: 'electronic',
  expedited: false,
  ...over,
})

describe('figures', () => {
  const c = buildCertificate(fixture(), req())
  const f = c.figures

  it('splits the balance into owed today and not yet due', () => {
    expect(f.currentBalanceCents).toBe(45_000)
    expect(f.notYetDueCents).toBe(80_000)
    expect(f.owedItems.map((i) => [i.id, i.remainingCents])).toEqual([
      ['a-sep', 20_000],
      ['a-oct', 30_000],
    ])
    expect(f.unappliedCents).toBe(-5_000)
    // Sep 200 + Oct 300 past due, less the $50 not applied to a charge.
    expect(f.pastDueCents).toBe(45_000)
    expect(f.delinquent).toBe(true)
  })

  it('marks charges that fall due inside the 30-day effective period', () => {
    expect(c.deadlines.effectiveThrough).toBe('2026-11-18')
    expect(f.notYetDue.map((i) => [i.id, i.withinEffectivePeriod])).toEqual([
      ['a-nov', true],
      ['a-spec', false],
    ])
  })

  it('reads the regular assessment, frequency, paid-through and next installment', () => {
    expect(f.regular).toEqual({ amountCents: 30_000, frequency: 'monthly' })
    // Sep is the first unpaid installment: paid through the day before.
    expect(f.paidThrough).toEqual({ kind: 'date', day: '2026-08-31' })
    expect(f.nextInstallment).toEqual({ dueDate: '2026-11-01', amountCents: 30_000, billed: true })
  })

  it('lists unpaid specials, open violations, and no plan or case', () => {
    expect(f.specials.map((s) => s.id)).toEqual(['a-spec'])
    expect(f.openViolations.map((v) => [v.id, v.noticed])).toEqual([['v-open', true]])
    expect(f.activePlan).toBeNull()
    expect(f.collections).toBeNull()
  })

  it('a prepayment on a future charge stays a credit today', () => {
    const input = fixture({ payments: [...fixture().payments, pay('p-nov', 'a-nov', 300, '2026-10-10T15:00:00Z')] })
    const g = buildCertificate(input, req()).figures
    expect(g.notYetDueCents).toBe(50_000) // only the special is left
    expect(g.currentBalanceCents).toBe(45_000) // unchanged: Nov wasn't owed today
  })
})

describe('credit on account (BL-177): shown, never netted', () => {
  it('without credit the figures are what they were', () => {
    const f = buildCertificate(fixture(), req()).figures
    expect(f.creditOnAccountCents).toBe(0)
    expect(f.totalDueAfterCreditCents).toBe(f.currentBalanceCents)
    expect(printSnapshot(buildCertificate(fixture(), req()))).not.toHaveProperty('credit_cents')
  })
  it('keeps the balance before credit and adds the credit and the total after it', () => {
    const c = buildCertificate(fixture({ unappliedCreditCents: 12_500 }), req())
    expect(c.figures.currentBalanceCents).toBe(45_000)
    expect(c.figures.creditOnAccountCents).toBe(12_500)
    expect(c.figures.totalDueAfterCreditCents).toBe(32_500)
    expect(auditFigures(c)).toMatchObject({ balance_cents: 45_000, credit_cents: 12_500 })
    // A credit that changes between loading and printing refuses the print.
    const snap = printSnapshot(c)
    expect(snap.credit_cents).toBe(12_500)
    expect(snapshotMatches(c, snap)).toBe(true)
    expect(snapshotMatches(buildCertificate(fixture(), req()), snap)).toBe(false)
  })
  it('credit larger than the balance leaves a negative total after credit', () => {
    expect(buildCertificate(fixture({ unappliedCreditCents: 60_000 }), req()).figures.totalDueAfterCreditCents).toBe(-15_000)
  })
})

describe('paid through', () => {
  it('runs one period past the last installment when everything is paid', () => {
    const input = fixture({
      charges: [charge('j', '2026-07-01', 300), charge('a', '2026-08-01', 300)],
      payments: [pay('pj', 'j', 300, '2026-07-01T15:00:00Z'), pay('pa', 'a', 300, '2026-08-01T15:00:00Z')],
    })
    expect(buildCertificate(input, req()).figures.paidThrough).toEqual({ kind: 'date', day: '2026-08-31' })
  })

  it('is unknown with one installment (no frequency to infer) — a BLANK', () => {
    const input = fixture({ charges: [charge('j', '2026-07-01', 300)], payments: [pay('pj', 'j', 300, '2026-07-01T15:00:00Z')] })
    const c = buildCertificate(input, req())
    expect(c.figures.regular.frequency).toBeNull()
    expect(c.figures.paidThrough).toEqual({ kind: 'unknown' })
    expect(c.fields.find((x) => x.key === 'paidThrough')!.value).toBeNull()
    expect(c.fields.find((x) => x.key === 'frequency')!.value).toBeNull()
  })

  it('says "not paid" when the first installment is unpaid', () => {
    const input = fixture({ charges: [charge('j', '2026-07-01', 300), charge('a', '2026-08-01', 300)], payments: [] })
    expect(buildCertificate(input, req()).figures.paidThrough).toEqual({ kind: 'none', firstUnpaidDue: '2026-07-01' })
  })

  it('infers quarterly and refuses uneven gaps', () => {
    const lines = (days: string[]) => chargeLines({ charges: days.map((d, i) => charge(`c${i}`, d, 900)), payments: [], planInstallmentIds: [] })
    expect(inferFrequency(lines(['2026-01-01', '2026-04-01', '2026-07-01']))).toBe('quarterly')
    expect(inferFrequency(lines(['2026-01-01', '2026-02-01', '2026-05-01']))).toBeNull()
  })
})

describe('payment plan installments', () => {
  it('are told apart from special assessments', () => {
    const input = fixture({
      charges: [charge('i1', '2026-11-05', 100, 'special'), charge('i2', '2026-12-05', 100.01, 'special'), charge('s', '2026-12-15', 500, 'special')],
      payments: [],
      plans: [{ id: 'plan-1', status: 'active', installmentAmount: 100, installmentCount: 2, totalAmount: 200.01, startDate: '2026-11-05' }],
      planInstallmentIds: ['i1', 'i2'],
    })
    const f = buildCertificate(input, req()).figures
    expect(f.specials.map((s) => s.id)).toEqual(['s'])
    expect(f.notYetDue.filter((l) => l.type === 'plan_installment').map((l) => l.id)).toEqual(['i1', 'i2'])
    expect(f.activePlan?.id).toBe('plan-1')
  })

  it('follow the plan → charge link, not a rebuilt schedule (a plan starting Jan 31)', () => {
    // lib/payment-plans.ts builds due dates with an overflowing Date.UTC:
    // Jan 31 + 1 month is Mar 3, not Feb 28. The link (the installment's
    // journal entry memo) is what makes a charge the plan's.
    const input = fixture({
      charges: [
        charge('i1', '2027-01-31', 100, 'special'),
        charge('i2', '2027-03-03', 100, 'special'),
        charge('i3', '2027-03-31', 100, 'special'),
        charge('s', '2027-02-28', 100, 'special'),
      ],
      payments: [],
      plans: [{ id: 'plan-1', status: 'active', installmentAmount: 100, installmentCount: 3, totalAmount: 300, startDate: '2027-01-31' }],
      planInstallmentIds: ['i1', 'i2', 'i3'],
    })
    const f = buildCertificate(input, req()).figures
    expect(f.notYetDue.filter((l) => l.type === 'plan_installment').map((l) => l.id)).toEqual(['i1', 'i2', 'i3'])
    // Feb 28 for $100 is exactly where a rebuilt schedule would look, but
    // no link ties it to the plan: it stays a special assessment.
    expect(f.specials.map((s) => s.id)).toEqual(['s'])
  })
})

describe('an unapplied credit and the delinquent add-on', () => {
  it('a $300 past-due charge and a $300 unlinked payment: not delinquent, no $150 add-on', () => {
    const input = fixture({
      charges: [charge('a', '2026-09-01', 300)],
      payments: [pay('p', null, 300, '2026-09-10T15:00:00Z')],
    })
    const r = req()
    const c = buildCertificate(input, r)
    expect(c.figures.currentBalanceCents).toBe(0)
    expect(c.figures.pastDueCents).toBe(0)
    expect(c.figures.delinquent).toBe(false)
    expect(checkFee('FL', c.deadlines, c.figures, r, 25_000).cap?.totalCents).toBe(25_000)
    expect(checkFee('FL', c.deadlines, c.figures, r, 40_000).problem).toMatch(/above the statutory cap/)
  })

  it('a partial credit only reduces the past-due amount', () => {
    const input = fixture({
      charges: [charge('a', '2026-09-01', 300)],
      payments: [pay('p', null, 100, '2026-09-10T15:00:00Z')],
    })
    const f = buildCertificate(input, req()).figures
    expect(f.pastDueCents).toBe(20_000)
    expect(f.delinquent).toBe(true)
  })
})

describe('print snapshot', () => {
  it('matches the certificate it was taken from', () => {
    const c = buildCertificate(fixture(), req())
    const snap = printSnapshot(c)
    expect(snap).toEqual({
      issueDate: '2026-10-19',
      balance_cents: 45_000,
      not_yet_due_cents: 80_000,
      charge_ids: ['a-nov', 'a-oct', 'a-sep', 'a-spec'],
    })
    expect(snapshotMatches(c, snap)).toBe(true)
  })

  it('does not match after a payment, a new charge, or a new day', () => {
    const page = printSnapshot(buildCertificate(fixture(), req()))
    const paid = fixture({ payments: [...fixture().payments, pay('p-oct', 'a-oct', 300, '2026-10-19T15:00:00Z')] })
    expect(snapshotMatches(buildCertificate(paid, req()), page)).toBe(false)
    const charged = fixture({ charges: [...fixture().charges, charge('a-new', '2026-12-01', 0.01)] })
    expect(snapshotMatches(buildCertificate(charged, req()), page)).toBe(false)
    expect(snapshotMatches(buildCertificate(fixture(), req({ issueDate: '2026-10-20' })), page)).toBe(false)
  })
})

describe('Florida deadlines and fees', () => {
  it('counts the 10-business-day deadline across a weekend and Columbus Day', () => {
    const d = buildCertificate(fixture(), req()).deadlines
    expect(d.responseDue).toBe('2026-10-26')
    expect(d.holidaysSkipped.map((h) => h.day)).toEqual(['2026-10-12'])
    expect(d.expeditedDue).toBe('2026-10-15')
    expect(d.late).toBe(false)
  })

  it('35 days by regular mail', () => {
    const d = buildCertificate(fixture(), req({ delivery: 'mail' })).deadlines
    expect(d.effectiveDays).toBe(35)
    expect(d.effectiveThrough).toBe('2026-11-23')
  })

  it('caps the fee at $250, +$150 delinquent, +$100 expedited (statute text)', () => {
    expect(flFeeCap({ delinquent: false, expedited: false }).totalCents).toBe(25_000)
    expect(flFeeCap({ delinquent: true, expedited: false }).totalCents).toBe(40_000)
    expect(flFeeCap({ delinquent: true, expedited: true }).totalCents).toBe(50_000)
  })

  it('rejects a fee over the cap, and any fee after the deadline', () => {
    const r = req()
    const c = buildCertificate(fixture(), r)
    expect(checkFee('FL', c.deadlines, c.figures, r, 40_000).problem).toBeNull()
    expect(checkFee('FL', c.deadlines, c.figures, r, 40_001).problem).toMatch(/above the statutory cap/)

    const lateReq = req({ requestDate: '2026-10-01' }) // due Oct 16, issued Oct 19
    const late = buildCertificate(fixture(), lateReq)
    expect(late.deadlines.responseDue).toBe('2026-10-16')
    expect(late.deadlines.late).toBe(true)
    expect(checkFee('FL', late.deadlines, late.figures, lateReq, 100).problem).toMatch(/no fee may be charged/)
    expect(checkFee('FL', late.deadlines, late.figures, lateReq, 0).problem).toBeNull()
  })

  it('drops the expedited add-on once 3 business days have passed', () => {
    const r = req({ expedited: true }) // expedited due Oct 15, issued Oct 19
    const c = buildCertificate(fixture(), r)
    expect(c.deadlines.expeditedMissed).toBe(true)
    expect(checkFee('FL', c.deadlines, c.figures, r, 50_000).cap?.totalCents).toBe(40_000)
  })
})

describe('BLANKs', () => {
  it('Florida: unknown facts are BLANKs and block printing until filled', () => {
    const c = buildCertificate(fixture(), req())
    const blankKeys = c.fields.filter((f) => f.value === null).map((f) => f.key)
    expect(blankKeys).toEqual(['requestor', 'parcel', 'transferFee', 'fee', 'signer', 'parking', 'transferApproval', 'firstRefusal', 'otherAssociations', 'insurance'])
    expect(blanksLeft(c.fields, {})).toHaveLength(10)

    const values = {
      requestor: 'Title Co',
      parcel: 'Lot 14',
      transferFee: 'Yes:',
      fee: '250',
      signer: 'Treasurer',
      parking: 'None',
      transferApproval: 'No',
      firstRefusal: 'No',
      otherAssociations: 'None',
      insurance: 'Agent, 555-0100',
    }
    // "Yes" without the type and amount is still a BLANK.
    expect(blanksLeft(c.fields, values)).toEqual(['Capital contribution, resale, transfer or other fee due on sale'])
    const done = { ...values, transferFee: 'Yes: capital contribution $500' }
    expect(blanksLeft(c.fields, done)).toEqual([])
    expect(valueOf(c.fields.find((f) => f.key === 'transferFee')!, done)).toBe('Yes — capital contribution $500')
    expect(valueOf(c.fields.find((f) => f.key === 'fee')!, done)).toBe('$250.00')
  })

  it('an unparseable fee stays a BLANK', () => {
    const c = buildCertificate(fixture(), req())
    expect(blanksLeft(c.fields, { fee: 'two fifty' })).toContain('Fee charged for this certificate')
    expect(parseMoneyCents('$1,250.5')).toBe(125_050)
  })

  it('a home with no owner on record makes the owner a BLANK', () => {
    const c = buildCertificate(fixture({ owners: [] }), req())
    expect(c.fields.find((f) => f.key === 'owners')!.value).toBeNull()
  })

  it('an account with the attorney adds the attorney BLANK (FL § 720.30851(1)(e))', () => {
    const c = buildCertificate(fixture({ collectionCase: { id: 'case-1', status: 'attorney_presuit', attorneyFirm: 'Firm LLP' } }), req())
    expect(c.figures.collections).toMatchObject({ caseId: 'case-1', stage: 'With attorney — presuit', withAttorney: true })
    expect(c.fields.some((f) => f.key === 'attorney' && f.value === null)).toBe(true)
  })
})

describe('California and other states', () => {
  it('CA: 10 calendar days, no fee cap, the § 4525(a)(8) BLANK, no FL fields', () => {
    const r = req()
    const c = buildCertificate(fixture({ state: 'CA' }), r)
    expect(c.jurisdiction).toBe('CA')
    expect(c.deadlines.responseDue).toBe('2026-10-19')
    expect(c.deadlines.effectiveThrough).toBeNull()
    expect(checkFee('CA', c.deadlines, c.figures, r, 99_999).cap).toBeNull()
    const keys = c.fields.map((f) => f.key)
    expect(keys).toContain('approvedChanges')
    expect(keys).not.toContain('parking')
  })

  it('other states: no statutory deadline or fields', () => {
    const c = buildCertificate(fixture({ state: 'NV' }), req())
    expect(c.jurisdiction).toBe('generic')
    expect(c.deadlines.responseDue).toBeNull()
    expect(c.fields.map((f) => f.key)).not.toContain('parking')
    expect(c.fields.map((f) => f.key)).not.toContain('approvedChanges')
    expect(c.fields.map((f) => f.key)).not.toContain('poaAct')
    expect(c.fields.map((f) => f.key)).not.toContain('lawsuits')
    expect(checkFee('generic', c.deadlines, c.figures, req(), 99_999).cap).toBeNull()
  })

  it('reads TX and GA case-insensitively', () => {
    expect(jurisdictionOf(' tx ')).toBe('TX')
    expect(jurisdictionOf('ga')).toBe('GA')
  })
})

describe('Texas § 207.003 resale certificate', () => {
  it('10 business days across a weekend and Columbus Day; no effective period', () => {
    const d = buildCertificate(fixture({ state: 'TX' }), req()).deadlines
    expect(d.responseDue).toBe('2026-10-26')
    expect(d.holidaysSkipped.map((h) => h.day)).toEqual(['2026-10-12'])
    expect(d.responseRule).toMatch(/§ 207\.003\(a\)/)
    expect(d.effectiveThrough).toBeNull()
    expect(d.expeditedDue).toBeNull()
    expect(d.late).toBe(false)
  })

  it('every § 207.003(b) item the app does not hold is a BLANK; no duplicate transfer-fee line', () => {
    const c = buildCertificate(fixture({ state: 'TX' }), req())
    expect(c.fields.filter((f) => f.value === null).map((f) => f.key)).toEqual([
      'requestor',
      'parcel',
      'fee',
      'signer',
      'firstRefusal',
      'approvedSpecials',
      'capitalExpenditures',
      'reserves',
      'judgments',
      'lawsuits',
      'knownViolations',
      'governmentNotices',
      'adminTransferFee',
      'managingAgent',
      'foreclosure',
      'transferFees',
    ])
    const keys = c.fields.map((f) => f.key)
    expect(keys).not.toContain('transferFee')
    expect(keys).not.toContain('parking')
    // Every TX-only BLANK names its § 207.003(b) paragraph.
    for (const f of c.fields.filter((x) => ['firstRefusal', 'approvedSpecials', 'capitalExpenditures', 'reserves', 'judgments', 'lawsuits', 'knownViolations', 'governmentNotices', 'adminTransferFee', 'managingAgent', 'foreclosure', 'transferFees'].includes(x.key))) {
      expect(f.hint).toMatch(/§ 207\.003\(b\)\(\d+\)/)
    }
    expect(blanksLeft(c.fields, { foreclosure: 'Yes' })).not.toContain('Do the restrictions allow foreclosure of the association’s lien for failure to pay assessments?')
  })

  it('caps the fee at $375 and allows none after the deadline (§ 207.003(c), (c-1))', () => {
    const r = req()
    const c = buildCertificate(fixture({ state: 'TX' }), r)
    expect(checkFee('TX', c.deadlines, c.figures, r, 37_500)).toMatchObject({ cap: { totalCents: 37_500 }, problem: null })
    expect(checkFee('TX', c.deadlines, c.figures, r, 37_501).problem).toMatch(/above the statutory cap of \$375\.00/)

    const lateReq = req({ requestDate: '2026-10-01' }) // due Oct 16, issued Oct 19
    const late = buildCertificate(fixture({ state: 'TX' }), lateReq)
    expect(late.deadlines.late).toBe(true)
    expect(checkFee('TX', late.deadlines, late.figures, lateReq, 100).problem).toMatch(/§ 207\.003\(c-1\)/)
    expect(checkFee('TX', late.deadlines, late.figures, lateReq, 0).problem).toBeNull()
  })
})

describe('Georgia § 44-3-232(d) statement of amounts due', () => {
  it('5 business days from receipt, skipping Columbus Day', () => {
    const d = buildCertificate(fixture({ state: 'GA' }), req()).deadlines
    expect(d.responseDue).toBe('2026-10-19')
    expect(d.holidaysSkipped.map((h) => h.day)).toEqual(['2026-10-12'])
    expect(d.responseRule).toMatch(/§ 44-3-232\(d\)/)
    expect(d.late).toBe(false)
    expect(buildCertificate(fixture({ state: 'GA' }), req({ requestDate: '2026-10-08' })).deadlines.late).toBe(true)
  })

  it('marks charges falling due by the end of the five-business-day period', () => {
    const input = fixture({ state: 'GA', charges: [...fixture().charges, charge('a-mid', '2026-10-21', 40, 'special')] })
    const c = buildCertificate(input, req({ requestDate: '2026-10-15' })) // due Oct 22
    expect(c.deadlines.responseDue).toBe('2026-10-22')
    expect(c.figures.notYetDue.map((i) => [i.id, i.withinEffectivePeriod])).toEqual([
      ['a-mid', true],
      ['a-nov', false],
      ['a-spec', false],
    ])
  })

  it('the POA Act and the declaration’s fee are board BLANKs', () => {
    const c = buildCertificate(fixture({ state: 'GA' }), req())
    expect(c.fields.filter((f) => f.value === null).map((f) => f.key)).toEqual(['requestor', 'parcel', 'transferFee', 'fee', 'signer', 'poaAct', 'instrumentFee'])
    expect(statuteAnswers('GA', { poaAct: 'Yes', instrumentFee: 'No' })).toEqual({ poaAct: true, feeAuthorized: false })
    expect(statuteAnswers('GA', {})).toEqual({ poaAct: null, feeAuthorized: null })
    expect(statuteAnswers('TX', { poaAct: 'Yes' })).toEqual({})
  })

  it('a No to the POA Act stops the statement', () => {
    expect(statuteProblem('GA', { poaAct: false })).toMatch(/applies only to associations submitted/)
    expect(statuteProblem('GA', { poaAct: true })).toBeNull()
    expect(statuteProblem('GA', { poaAct: null })).toBeNull() // still a BLANK
    expect(statuteProblem('TX', { poaAct: false })).toBeNull()
  })

  it('fee: $10.00 at most, and only if the declaration provides for one', () => {
    const r = req()
    const c = buildCertificate(fixture({ state: 'GA' }), r)
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_000, { feeAuthorized: true })).toMatchObject({ cap: { totalCents: 1_000 }, problem: null })
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_001, { feeAuthorized: true }).problem).toMatch(/\$10\.00/)
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_000, { feeAuthorized: false }).problem).toMatch(/declaration provides/)
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_000).problem).toMatch(/declaration provides/)
    expect(checkFee('GA', c.deadlines, c.figures, r, 0, { feeAuthorized: false }).problem).toBeNull()
  })
})

describe('BL-155: a Georgia condominium gets § 44-3-109(d), an HOA keeps § 44-3-232(d)', () => {
  const condo = (over: Partial<EstoppelInput> = {}) => fixture({ state: 'GA', associationType: 'condo', ...over })

  it('5 business days from receipt under § 44-3-109(d), never § 44-3-232', () => {
    const c = buildCertificate(condo(), req())
    expect(c.gaCondo).toBe(true)
    expect(c.deadlines.responseDue).toBe('2026-10-19')
    expect(c.deadlines.responseRule).toMatch(/§ 44-3-109\(d\)/)
    expect(JSON.stringify(c)).not.toContain('44-3-232')
    expect(GA_CONDO_NOTES.join(' ')).not.toContain('44-3-232')
    expect(GA_CONDO_FEE_NOTES.join(' ')).not.toContain('44-3-232')
    expect(GA_CONDO_NOTES.join(' ')).toContain('five business days')
  })

  it('asks about the Condominium Act instead of the POA Act; a No stops the statement', () => {
    const c = buildCertificate(condo(), req())
    expect(c.fields.filter((f) => f.value === null).map((f) => f.key)).toEqual(['requestor', 'parcel', 'transferFee', 'fee', 'signer', 'condoAct', 'instrumentFee'])
    expect(statuteAnswers('GA', { condoAct: 'Yes', instrumentFee: 'No' }, true)).toEqual({ condoAct: true, feeAuthorized: false })
    expect(statuteProblem('GA', { condoAct: false }, true)).toMatch(/Georgia Condominium Act/)
    expect(statuteProblem('GA', { condoAct: true }, true)).toBeNull()
    expect(statuteProblem('GA', { condoAct: null }, true)).toBeNull()
    // the POA answer means nothing to a condo statement
    expect(statuteProblem('GA', { poaAct: false }, true)).toBeNull()
  })

  it('fee: $10.00 at most, and only if the condominium instruments provide for one', () => {
    const r = req()
    const c = buildCertificate(condo(), r)
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_000, { feeAuthorized: true }, true)).toMatchObject({ cap: { totalCents: 1_000 }, problem: null })
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_001, { feeAuthorized: true }, true).problem).toMatch(/§ 44-3-109\(d\)/)
    expect(checkFee('GA', c.deadlines, c.figures, r, 1_000, { feeAuthorized: false }, true).problem).toMatch(/condominium instruments/)
    expect(checkFee('GA', c.deadlines, c.figures, r, 0, {}, true).problem).toBeNull()
  })

  it('an HOA, a co-op and an untyped Georgia association keep the POA Act statement', () => {
    for (const associationType of ['hoa', 'coop', null, undefined]) {
      const c = buildCertificate(fixture({ state: 'GA', associationType }), req())
      expect(c.gaCondo).toBe(false)
      expect(c.deadlines.responseRule).toMatch(/§ 44-3-232\(d\)/)
      expect(c.fields.map((f) => f.key)).toContain('poaAct')
      expect(c.fields.map((f) => f.key)).not.toContain('condoAct')
    }
    // a condo outside Georgia is not the Georgia Act
    expect(buildCertificate(fixture({ state: 'FL', associationType: 'condo' }), req()).gaCondo).toBe(false)
  })
})

describe('request and audit', () => {
  it('refuses a request date after today or not a day', () => {
    expect(requestProblem({ requestDate: '2026-10-20', issueDate: '2026-10-19' })).toMatch(/after today/)
    expect(requestProblem({ requestDate: '', issueDate: '2026-10-19' })).toMatch(/Enter/)
    expect(requestProblem({ requestDate: '2026-10-09', issueDate: '2026-10-19' })).toBeNull()
  })

  it('audit figures hold ids and cents only', () => {
    const a = auditFigures(buildCertificate(fixture(), req()))
    expect(a).toEqual({
      jurisdiction: 'FL',
      balance_cents: 45_000,
      past_due_cents: 45_000, // net of the $50 unapplied payment
      not_yet_due_cents: 80_000,
      open_violation_ids: ['v-open'],
      payment_plan_id: null,
      collection_case_id: null,
    })
    const text = JSON.stringify(a)
    expect(text).not.toMatch(/Owner A|Oak|Trash/)
  })
})

describe('violationDisclosure — only what each statute asks', () => {
  const violations = [
    { id: 'v-noticed', description: 'Trash cans visible', status: 'notice_sent', noticeSentAt: '2026-10-01T12:00:00Z', resolvedAt: null },
    { id: 'v-fined', description: 'Mailbox leaning', status: 'fined', noticeSentAt: null, resolvedAt: null },
    { id: 'v-quiet', description: 'Lawn not mowed', status: 'open', noticeSentAt: null, resolvedAt: null },
  ]
  const figuresFor = (state: string) => buildCertificate(fixture({ state, violations }), req()).figures
  const ids = (vs: { id: string }[]) => vs.map((v) => v.id)

  it('FL item 7 counts only violations noticed to the owner; the rest go to the board, not the certificate', () => {
    const d = violationDisclosure('FL', figuresFor('FL'))
    expect(d.label).toMatch(/noticed to the parcel owner in the association official records/)
    expect(ids(d.listed)).toEqual(['v-noticed', 'v-fined'])
    expect(ids(d.boardCheck)).toEqual(['v-quiet'])
    expect(d.boardCheckLabel).toMatch(/not yet noticed/i)
    expect(d.boardCheckHint).toMatch(/720\.30851\(1\)\(h\)/)
  })

  it('FL with only an un-noticed open violation answers No', () => {
    const d = violationDisclosure('FL', buildCertificate(fixture({ violations: [violations[2]!] }), req()).figures)
    expect(d.listed).toEqual([])
    expect(ids(d.boardCheck)).toEqual(['v-quiet'])
  })

  it('CA § 4525(a)(5) summarises notices sent, same split', () => {
    const d = violationDisclosure('CA', figuresFor('CA'))
    expect(d.label).toMatch(/4525\(a\)\(5\)/)
    expect(ids(d.listed)).toEqual(['v-noticed', 'v-fined'])
    expect(ids(d.boardCheck)).toEqual(['v-quiet'])
  })

  it('TX § 207.003(b)(11) is actual knowledge, not notice: every open violation is listed', () => {
    const d = violationDisclosure('TX', figuresFor('TX'))
    expect(ids(d.listed)).toEqual(['v-noticed', 'v-fined', 'v-quiet'])
    expect(d.boardCheck).toEqual([])
  })

  it('GA and generic list every open violation on record', () => {
    for (const s of ['GA', 'NY']) {
      const d = violationDisclosure(jurisdictionOf(s), figuresFor(s))
      expect(d.label).toBe('Open violations')
      expect(ids(d.listed)).toEqual(['v-noticed', 'v-fined', 'v-quiet'])
      expect(d.boardCheck).toEqual([])
    }
  })
})
