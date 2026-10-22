import { describe, expect, it } from 'vitest'
import type { LedgerAssessment, LedgerPayment } from '@/lib/resident-ledger'
import {
  blankValues,
  buildLetter,
  dueDatesLabel,
  kindsFor,
  letterBlanks,
  letterBlocked,
  letterChargeIds,
  letterDeadline,
  letterFigures,
  letterJurisdiction,
  letterProblems,
  letterTotals,
  parsePercent,
  stageAfterPrint,
  type LetterEvent,
  type LetterInput,
} from './model'
import { letterAuditRow } from './audit'
import { LETTER_ACTION, letterHref, letterSummary, readLetterPayload } from './proposal'
import { letterExecutor } from './executor'

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const CASE = '33333333-3333-4333-8333-333333333333'
const ORG = '44444444-4444-4444-8444-444444444444'
const TODAY = '2026-10-19'

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
 * A home on Mon Oct 19 2026. Monthly $300 dues on the 1st: Jul paid, Aug
 * unpaid, Sep part-paid ($100), Oct unpaid, Nov billed ahead. A $25 late
 * fee due Aug 15 unpaid, another waived, a $100 fine, and a $50 payment
 * not applied to any charge.
 *   past-due assessments = Aug 300 + Sep 200 + Oct 300 = 800
 *   late fees            = 25
 *   fine                 = 100 (left off FL / CA notices)
 *   unapplied credit     = −50
 */
function fixture(over: Partial<LetterInput> = {}): LetterInput {
  return {
    state: 'FL',
    associationName: 'Fixture HOA',
    propertyId: PROPERTY,
    address: '14 Oak Lane',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: null,
    owners: ['Owner A'],
    charges: [
      charge('a-jul', '2026-07-01', 300),
      charge('a-aug', '2026-08-01', 300),
      charge('a-sep', '2026-09-01', 300),
      charge('a-oct', '2026-10-01', 300),
      charge('a-nov', '2026-11-01', 300),
      charge('lf-aug', '2026-08-15', 25, 'late_fee'),
      charge('lf-sep', '2026-09-15', 25, 'late_fee', 'waived'),
      charge('fine-1', '2026-09-20', 100, 'fine'),
    ],
    payments: [pay('p-jul', 'a-jul', 300, '2026-07-02T15:00:00Z'), pay('p-sep', 'a-sep', 100, '2026-09-03T15:00:00Z'), pay('p-x', null, 50, '2026-09-10T15:00:00Z')],
    plans: [],
    planInstallmentIds: [],
    timeZone: 'America/New_York',
    ...over,
  }
}

const FL_VALUES = {
  mailingAddress: '14 Oak Lane, Tampa FL',
  parcel: 'Lot 7, Block B',
  interest: '12.34',
  interestThrough: 'Aug 1 – Oct 19, 2026',
  interestRate: '18',
  signer: 'Pat Board, President',
}

describe('jurisdiction and kinds', () => {
  it('maps the state, with everything else generic', () => {
    expect(letterJurisdiction('fl')).toBe('FL')
    expect(letterJurisdiction(' tx ')).toBe('TX')
    expect(letterJurisdiction('CA')).toBe('CA')
    expect(letterJurisdiction('GA')).toBe('GA')
    expect(letterJurisdiction('NY')).toBe('generic')
    expect(letterJurisdiction(null)).toBe('generic')
  })

  it('offers statutory letters first, and a past-due letter everywhere', () => {
    expect(kindsFor('FL')).toEqual(['fl_late_notice', 'fl_intent_to_lien', 'past_due'])
    expect(kindsFor('CA')).toEqual(['ca_pre_lien', 'past_due'])
    expect(kindsFor('TX')).toEqual(['tx_delinquency', 'past_due'])
    expect(kindsFor('GA')).toEqual(['ga_fee_notice', 'ga_pre_foreclosure', 'past_due'])
    expect(kindsFor('generic')).toEqual(['past_due'])
  })

  it('refuses a statutory letter for a home in another state', () => {
    const l = buildLetter(fixture({ state: 'NY' }), 'fl_late_notice', TODAY, [])
    expect(l.waiting).toMatchObject({ ok: false })
    expect(!l.waiting.ok && l.waiting.reason).toContain('for FL associations')
  })
})

describe('figures from the ledger', () => {
  it('FL: past-due assessments, late fees, the unapplied credit; the fine left off', () => {
    const f = letterFigures(fixture(), 'fl_late_notice', TODAY)
    expect(f.assessmentLines.map((l) => [l.id, l.remainingCents])).toEqual([
      ['a-aug', 30_000],
      ['a-sep', 20_000],
      ['a-oct', 30_000],
    ])
    expect(f.assessmentsCents).toBe(80_000)
    expect(f.lateFeesCents).toBe(2_500)
    expect(f.otherCents).toBe(0)
    expect(f.omittedLines.map((l) => l.id)).toEqual(['fine-1'])
    expect(f.creditCents).toBe(-5_000)
    expect(f.ledgerCents).toBe(77_500)
    expect(dueDatesLabel(f.assessmentLines)).toBe('Aug 1, 2026 – Oct 1, 2026')
  })

  it('a charge due on the letter date is not past due yet; one due the day before is', () => {
    expect(letterFigures(fixture(), 'past_due', '2026-10-01').assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep'])
    expect(letterFigures(fixture(), 'past_due', '2026-10-02').assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep', 'a-oct'])
  })

  it('past-due and TX letters list the fine', () => {
    for (const kind of ['past_due', 'tx_delinquency'] as const) {
      const f = letterFigures(fixture({ state: 'TX' }), kind, TODAY)
      expect(f.otherLines.map((l) => l.id)).toEqual(['fine-1'])
      expect(f.ledgerCents).toBe(87_500)
    }
  })

  it('CA lists only assessments delinquent under § 5650(b): 15 days after due', () => {
    const ca = fixture({ state: 'CA' })
    expect(letterFigures(ca, 'ca_pre_lien', TODAY).assessmentsCents).toBe(80_000)
    // Oct 1 + 15 = Oct 16: not delinquent on Oct 15, delinquent on Oct 16.
    expect(letterFigures(ca, 'ca_pre_lien', '2026-10-15').assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep'])
    expect(letterFigures(ca, 'ca_pre_lien', '2026-10-16').assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep', 'a-oct'])
    const l = buildLetter(ca, 'ca_pre_lien', '2026-10-15', [])
    expect(l.notes.join(' ')).toContain('not delinquent yet')
  })

  it('a payment plan installment counts as an assessment', () => {
    const input = fixture({
      charges: [charge('inst-1', '2026-09-01', 150, 'special')],
      payments: [],
      plans: [{ id: 'plan', status: 'active', installmentAmount: 150, installmentCount: 2, totalAmount: 300, startDate: '2026-09-01' }],
      planInstallmentIds: ['inst-1'],
    })
    const f = letterFigures(input, 'fl_late_notice', TODAY)
    expect(f.assessmentLines.map((l) => [l.id, l.type])).toEqual([['inst-1', 'plan_installment']])
  })
})

describe('CA delinquency period (§ 5650(b): the declaration may set a longer one)', () => {
  const ca = fixture({ state: 'CA' })
  const LABEL = 'Days after due date an assessment is delinquent (per your declaration; at least 15)'

  it('is a BLANK the board fills', () => {
    const l = buildLetter(ca, 'ca_pre_lien', TODAY, [])
    expect(letterBlanks(l, {})).toContain(LABEL)
    expect(letterBlanks(l, { delinquentDays: '30' })).not.toContain(LABEL)
    expect(letterBlocked(l, { collectionCosts: '0', attorneyFees: '0', interest: '0', interestRate: '0', mailingAddress: 'x', procedures: 'x', signer: 'x' }, true)).toBe(
      'Fill in every BLANK first.',
    )
  })

  it('a 30-day declaration leaves off an assessment only 18 days past due', () => {
    // Oct 1 is 18 days before Oct 19: delinquent at 15 days, not at 30.
    expect(buildLetter(ca, 'ca_pre_lien', TODAY, [], { delinquentDays: '15' }).figures.assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep', 'a-oct'])
    const l = buildLetter(ca, 'ca_pre_lien', TODAY, [], { delinquentDays: '30' })
    expect(l.figures.assessmentLines.map((x) => x.id)).toEqual(['a-aug', 'a-sep'])
    expect(l.figures.assessmentsCents).toBe(50_000)
    expect(l.notes.join(' ')).toContain('less than 30 days past due')
  })

  it('the waiting check counts the declaration’s period', () => {
    const input = fixture({ state: 'CA', charges: [charge('a', '2026-10-10', 300)], payments: [] })
    const l = buildLetter(input, 'ca_pre_lien', '2026-10-30', [], { delinquentDays: '30' })
    expect(l.waiting).toMatchObject({ ok: false, earliest: '2026-11-09' })
    expect(!l.waiting.ok && l.waiting.reason).toContain('30 days after it is due')
    expect(buildLetter(input, 'ca_pre_lien', '2026-11-09', [], { delinquentDays: '30' }).waiting.ok).toBe(true)
  })

  it('refuses fewer than 15 days, or anything but a whole number', () => {
    expect(letterProblems('ca_pre_lien', { delinquentDays: '14' })[0]).toContain('15')
    expect(letterProblems('ca_pre_lien', { delinquentDays: 'two weeks' })[0]).toContain('15')
    expect(letterProblems('ca_pre_lien', { delinquentDays: '15.5' })[0]).toContain('15')
    expect(letterProblems('ca_pre_lien', { delinquentDays: '45' })).toEqual([])
    // The figures never use a period shorter than the statute's.
    expect(buildLetter(ca, 'ca_pre_lien', '2026-10-15', [], { delinquentDays: '5' }).figures.assessmentLines.map((l) => l.id)).toEqual(['a-aug', 'a-sep'])
  })
})

describe('totals with the board’s entries', () => {
  it('FL late notice: ledger plus interest', () => {
    const l = buildLetter(fixture(), 'fl_late_notice', TODAY, [])
    const t = letterTotals(l, FL_VALUES)
    expect(t).toMatchObject({ ledgerCents: 77_500, enteredCents: 1_234, totalCents: 78_734 })
  })

  it('FL intent to lien: plus certified mail and other costs', () => {
    const l = buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [{ eventType: 'lien_warning_sent', occurredOn: '2026-09-01' }])
    const t = letterTotals(l, { ...FL_VALUES, certifiedMail: '8.50', otherCosts: '$150' })
    expect(t.entered.map((e) => [e.key, e.cents])).toEqual([
      ['interest', 1_234],
      ['certifiedMail', 850],
      ['otherCosts', 15_000],
    ])
    expect(t.totalCents).toBe(77_500 + 1_234 + 850 + 15_000)
  })

  it('CA: collection costs, attorney fees and interest', () => {
    const l = buildLetter(fixture({ state: 'CA' }), 'ca_pre_lien', TODAY, [])
    expect(letterTotals(l, { collectionCosts: '40', attorneyFees: '0', interest: '9.99' }).totalCents).toBe(77_500 + 4_000 + 999)
  })

  it('a money BLANK left empty leaves the total unknown, never zero', () => {
    const l = buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [{ eventType: 'lien_warning_sent', occurredOn: '2026-09-01' }])
    const t = letterTotals(l, { interest: '0' })
    expect(t.enteredCents).toBeNull()
    expect(t.totalCents).toBeNull()
  })

  it('TX and past-due letters have nothing to enter', () => {
    const l = buildLetter(fixture({ state: 'TX' }), 'tx_delinquency', TODAY, [])
    expect(letterTotals(l, {})).toMatchObject({ enteredCents: 0, totalCents: 87_500 })
  })
})

describe('BLANKs', () => {
  it('every fact the app lacks is a BLANK; the known ones are filled', () => {
    const l = buildLetter(fixture(), 'fl_late_notice', TODAY, [])
    expect(letterBlanks(l, {})).toEqual([
      'Owner’s mailing address',
      'Parcel (lot/block or parcel number)',
      'Interest owed',
      'Interest calculated through (dates)',
      'Interest rate (percent per year)',
      'Signed by (name and title)',
    ])
    expect(letterBlanks(l, FL_VALUES)).toEqual([])
  })

  it('a known lot fills the parcel; missing owners and association are BLANKs', () => {
    const l = buildLetter(fixture({ lotNumber: '7', owners: [], associationName: null }), 'fl_late_notice', TODAY, [])
    const blanks = letterBlanks(l, {})
    expect(blanks).not.toContain('Parcel (lot/block or parcel number)')
    expect(blanks).toContain('Owner(s) of record')
    expect(blanks).toContain('Association name')
  })

  it('a money BLANK needs an amount', () => {
    const l = buildLetter(fixture(), 'fl_late_notice', TODAY, [])
    expect(letterBlanks(l, { ...FL_VALUES, interest: 'about ten' })).toEqual(['Interest owed'])
  })

  it('stores only the board’s entries for this letter’s BLANKs', () => {
    const l = buildLetter(fixture({ lotNumber: '7' }), 'fl_late_notice', TODAY, [])
    expect(blankValues(l, { ...FL_VALUES, owners: 'someone else', stray: 'x' })).toEqual({
      mailingAddress: FL_VALUES.mailingAddress,
      interest: '12.34',
      interestThrough: FL_VALUES.interestThrough,
      interestRate: '18',
      signer: FL_VALUES.signer,
    })
  })

  it('interest rate: a number, and at most 12% in California (§ 5650(b)(3))', () => {
    expect(parsePercent('18')).toBe(18)
    expect(parsePercent('12.5%')).toBe(12.5)
    expect(parsePercent('ten')).toBeNull()
    expect(letterProblems('fl_late_notice', { interestRate: 'ten' })).toHaveLength(1)
    expect(letterProblems('fl_late_notice', { interestRate: '18' })).toEqual([])
    expect(letterProblems('ca_pre_lien', { interestRate: '12' })).toEqual([])
    expect(letterProblems('ca_pre_lien', { interestRate: '13' })[0]).toContain('12%')
  })
})

describe('waiting periods', () => {
  const warning = (on: string): LetterEvent => ({ eventType: 'lien_warning_sent', occurredOn: on })

  it('FL intent to lien: refused with no notice of late assessment recorded', () => {
    const l = buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [{ eventType: 'collection_letter_sent', occurredOn: '2026-08-01' }])
    expect(l.waiting.ok).toBe(false)
    expect(!l.waiting.ok && l.waiting.reason).toContain('No notice of late assessment is recorded')
  })

  it('FL intent to lien: refused until 30 days after the notice, with the day it opens', () => {
    const l = buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [warning('2026-09-25')])
    expect(l.waiting).toMatchObject({ ok: false, earliest: '2026-10-25' })
    expect(!l.waiting.ok && l.waiting.reason).toContain('Oct 25, 2026')
  })

  it('FL intent to lien: allowed exactly 30 days after the notice', () => {
    expect(buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [warning('2026-09-19')]).waiting.ok).toBe(true)
    expect(buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [warning('2026-09-20')]).waiting.ok).toBe(false)
  })

  it('FL intent to lien: an older notice counts even when a newer one is recent', () => {
    expect(buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [warning('2026-08-01'), warning('2026-10-10')]).waiting.ok).toBe(true)
  })

  it('a notice dated after the letter date does not count', () => {
    expect(buildLetter(fixture(), 'fl_intent_to_lien', '2026-09-30', [warning('2026-10-05')]).waiting.ok).toBe(false)
  })

  it('FL late notice needs a past-due assessment, not just a late fee', () => {
    const input = fixture({ charges: [charge('lf', '2026-09-15', 25, 'late_fee')], payments: [] })
    const l = buildLetter(input, 'fl_late_notice', TODAY, [])
    expect(!l.waiting.ok && l.waiting.reason).toContain('No assessment is past due')
  })

  it('CA: refused until an assessment is delinquent, with the day it becomes so', () => {
    const input = fixture({ state: 'CA', charges: [charge('a', '2026-10-10', 300)], payments: [] })
    const l = buildLetter(input, 'ca_pre_lien', TODAY, [])
    expect(l.waiting).toMatchObject({ ok: false, earliest: '2026-10-25' })
    expect(buildLetter(input, 'ca_pre_lien', '2026-10-25', []).waiting.ok).toBe(true)
  })

  it('nothing past due, or credits covering it, refuses every letter', () => {
    const paid = fixture({ charges: [charge('a', '2026-09-01', 300)], payments: [pay('p', 'a', 300, '2026-09-02T12:00:00Z')] })
    expect(buildLetter(paid, 'past_due', TODAY, []).waiting).toMatchObject({ ok: false, reason: 'Nothing is past due on this account.' })
    const credit = fixture({ charges: [charge('a', '2026-09-01', 300)], payments: [pay('p', null, 400, '2026-09-02T12:00:00Z')] })
    const l = buildLetter(credit, 'past_due', TODAY, [])
    expect(!l.waiting.ok && l.waiting.reason).toContain('cover everything past due')
  })
})

describe('dates the letter states', () => {
  it('counts calendar days from the letter date', () => {
    expect(letterDeadline('fl_late_notice', TODAY)?.day).toBe('2026-11-18')
    expect(letterDeadline('fl_intent_to_lien', TODAY)?.day).toBe('2026-12-03')
    expect(letterDeadline('ca_pre_lien', TODAY)?.day).toBe('2026-11-18')
    expect(letterDeadline('tx_delinquency', TODAY)?.day).toBe('2026-12-03')
    expect(letterDeadline('past_due', TODAY)).toBeNull()
    // Across a month end and a year end.
    expect(letterDeadline('tx_delinquency', '2026-12-20')?.day).toBe('2027-02-03')
  })
})

describe('letterBlocked', () => {
  it('waits for the waiting period, then the BLANKs, then the tick', () => {
    const early = buildLetter(fixture(), 'fl_intent_to_lien', TODAY, [])
    expect(letterBlocked(early, {}, true)).toContain('No notice of late assessment')
    const l = buildLetter(fixture(), 'fl_late_notice', TODAY, [])
    expect(letterBlocked(l, {}, true)).toBe('Fill in every BLANK first.')
    expect(letterBlocked(l, { ...FL_VALUES, interestRate: 'x' }, true)).toContain('interest rate')
    expect(letterBlocked(l, FL_VALUES, false)).toBe('Tick “I’ve verified these figures” first.')
    expect(letterBlocked(l, FL_VALUES, true)).toBeNull()
  })
})

describe('the case after printing', () => {
  it('moves forward a rung, never back', () => {
    expect(stageAfterPrint('fl_late_notice', 'collection_letter')).toBe('lien_warning')
    expect(stageAfterPrint('fl_intent_to_lien', 'lien_warning')).toBe('lien_letter')
    expect(stageAfterPrint('past_due', 'monitoring')).toBe('collection_letter')
    expect(stageAfterPrint('past_due', 'lien_letter')).toBeNull()
    expect(stageAfterPrint('ca_pre_lien', 'attorney_presuit')).toBeNull()
  })
})

describe('the Approvals payload and the audit row', () => {
  const payloadFor = () => {
    const l = buildLetter(fixture(), 'fl_late_notice', TODAY, [])
    const t = letterTotals(l, FL_VALUES)
    return {
      version: 1 as const,
      kind: l.kind,
      jurisdiction: l.jurisdiction,
      caseId: CASE,
      propertyId: PROPERTY,
      unitId: UNIT,
      draftedOn: TODAY,
      values: blankValues(l, FL_VALUES),
      chargeIds: letterChargeIds(l),
      ledgerCents: t.ledgerCents,
      enteredCents: t.enteredCents!,
      totalCents: t.totalCents!,
    }
  }

  it('round-trips through the schema; the charge ids are the figures’ own', () => {
    const p = payloadFor()
    expect(p.chargeIds).toEqual(['a-aug', 'a-oct', 'a-sep', 'lf-aug'])
    expect(readLetterPayload(p)).toEqual(p)
    expect(readLetterPayload({ ...p, totalCents: 0 })).toBeNull()
    expect(readLetterPayload({ ...p, kind: 'lien_filed' })).toBeNull()
  })

  it('summary and link', () => {
    expect(letterSummary('fl_late_notice', '14 Oak Lane')).toBe('Notice of late assessment — 14 Oak Lane')
    expect(letterHref(PROPERTY)).toBe(`/properties/${PROPERTY}/collections-letter`)
    expect(LETTER_ACTION).toBe('collections.letter')
  })

  it('the audit row holds ids, days, the kind and cents — no BLANK entries', () => {
    const p = payloadFor()
    const row = letterAuditRow({
      orgId: ORG,
      userId: 'u-1',
      metadata: {
        approval_request_id: '55555555-5555-4555-8555-555555555555',
        collection_case_id: CASE,
        collection_event_id: null,
        property_id: PROPERTY,
        unit_id: UNIT,
        kind: p.kind,
        jurisdiction: p.jurisdiction,
        letter_date: TODAY,
        ledger_cents: p.ledgerCents,
        entered_cents: p.enteredCents,
        total_cents: p.totalCents,
        charge_ids: p.chargeIds,
        reprint: false,
      },
    })
    expect(row).toMatchObject({ action: 'collections_letter_printed', entity_type: 'collections_letter', entity_id: '55555555-5555-4555-8555-555555555555' })
    const text = JSON.stringify(row)
    for (const v of Object.values(FL_VALUES)) expect(text).not.toContain(v)
    expect(text).not.toContain('Oak')
    expect(text).not.toContain('Owner A')
  })
})

describe('letterExecutor', () => {
  const request = (payload: unknown) => ({ id: 'r', organization_id: ORG, payload }) as never
  const db = (row: unknown, error: unknown = null) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error }) }
    return { from: () => q } as never
  }
  const payload = {
    version: 1,
    kind: 'past_due',
    jurisdiction: 'generic',
    caseId: CASE,
    propertyId: PROPERTY,
    unitId: UNIT,
    draftedOn: TODAY,
    values: {},
    chargeIds: ['a'],
    ledgerCents: 100,
    enteredCents: 0,
    totalCents: 100,
  }

  it('approves an open case in the same org, with the case as the result', async () => {
    expect(await letterExecutor(db({ id: CASE, organization_id: ORG, status: 'lien_warning', deleted_at: null }), request(payload))).toEqual({ ok: true, resultRef: CASE })
  })

  it.each([
    ['closed', { id: CASE, organization_id: ORG, status: 'resolved', deleted_at: null }],
    ['deleted', { id: CASE, organization_id: ORG, status: 'monitoring', deleted_at: '2026-10-01' }],
    ['another org', { id: CASE, organization_id: 'other', status: 'monitoring', deleted_at: null }],
    ['missing', null],
  ])('refuses a %s case', async (_label, row) => {
    expect((await letterExecutor(db(row), request(payload))).ok).toBe(false)
  })

  it('refuses an unreadable payload', async () => {
    expect((await letterExecutor(db(null), request({ nope: true }))).ok).toBe(false)
  })
})
