import { describe, expect, it } from 'vitest'
import type { LedgerAssessment } from '@/lib/resident-ledger'
import { blockingFindings } from '@/lib/compliance/statute-drift'
import {
  LETTER_META,
  addYears,
  buildLetter,
  gaLapseNotes,
  kindsFor,
  letterBlocked,
  letterDeadline,
  letterFigures,
  gaForeclosureCount,
  letterBlanks,
  letterLawCheck,
  letterMeta,
  letterProblems,
  letterTotals,
  stageAfterPrint,
  type LetterInput,
} from './model'
import { LETTER_KIND_CITATIONS, LETTER_KIND_LABELS, readLetterPayload } from './proposal'
import {
  GA_2027_FINE_NOTE,
  GA_FEE_NOTICE_BODY,
  GA_PRE_FORECLOSURE_BODY,
  GA_PRE_FORECLOSURE_BODY_2027,
  GA_PRE_FORECLOSURE_QUOTES,
  GA_PRE_FORECLOSURE_QUOTES_2027,
  gaForeclosureLaw,
  gaForeclosureThresholdCents,
} from './law'

/**
 * BL-148: the Georgia collections letters — the SB 406 § 7(f) notice
 * before attorney's fees and the § 44-3-232(c) notice before foreclosure —
 * and how the BL-130 state law check treats them.
 */

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-10-21'

const charge = (id: string, due: string, amount: number, type = 'regular'): LedgerAssessment => ({
  id,
  unit_id: UNIT,
  amount,
  due_date: due,
  status: 'open',
  assessment_type: type,
  memo_code: null,
})

/** Quarterly $600 dues unpaid since Jan, a $60 late fee, a $150 fine, and $400 of attorney's fees. */
function gaInput(over: Partial<LetterInput> = {}): LetterInput {
  return {
    state: 'GA',
    associationName: 'Peachtree Fixture HOA',
    propertyId: PROPERTY,
    address: '9 Magnolia Way, Marietta GA 30060',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: '12',
    owners: ['Owner A'],
    charges: [
      charge('q1', '2026-01-01', 600),
      charge('q2', '2026-04-01', 600),
      charge('q3', '2026-07-01', 600),
      charge('q4', '2026-10-01', 600),
      charge('lf-1', '2026-01-15', 60, 'late_fee'),
      charge('fine-1', '2026-05-01', 150, 'fine'),
      charge('legal-1', '2026-09-01', 400, 'collection_legal'),
    ],
    payments: [],
    plans: [],
    planInstallmentIds: [],
    timeZone: 'America/New_York',
    ...over,
  }
}

const FEE_VALUES = { mailingAddress: '9 Magnolia Way, Marietta GA 30060', attorneyFees: 'Demand letter review, Sep 1: $400', signer: 'Pat Board, President' }
const FORECLOSURE_VALUES = { designatedAddress: 'None', interest: '25.00', interestRate: '10', signer: 'Pat Board, President' }

describe('Georgia letter kinds', () => {
  it('a GA association gets both notices, statutory first, and the plain letter', () => {
    expect(kindsFor('GA')).toEqual(['ga_fee_notice', 'ga_pre_foreclosure', 'past_due'])
    expect(LETTER_META.ga_fee_notice).toMatchObject({ jurisdiction: 'GA', eventType: 'demand_letter_sent', listsFines: true })
    expect(LETTER_META.ga_pre_foreclosure).toMatchObject({ jurisdiction: 'GA', eventType: 'lien_letter_sent', listsFines: true })
    expect(LETTER_KIND_LABELS.ga_fee_notice).toBe('Notice before attorney’s fees')
    expect(LETTER_KIND_CITATIONS.ga_pre_foreclosure).toBe('O.C.G.A. § 44-3-232(c)')
  })

  it('a GA notice is refused for a home outside Georgia', () => {
    const l = buildLetter(gaInput({ state: 'FL' }), 'ga_fee_notice', TODAY, [])
    expect(!l.waiting.ok && l.waiting.reason).toContain('for GA associations')
  })

  it('the fee notice moves the case to "Collection letter sent" at most, never to the attorney', () => {
    expect(stageAfterPrint('ga_fee_notice', 'monitoring')).toBe('collection_letter')
    expect(stageAfterPrint('ga_fee_notice', 'lien_warning')).toBeNull()
    expect(stageAfterPrint('ga_pre_foreclosure', 'collection_letter')).toBe('lien_letter')
  })

  it('the Approvals payload accepts the GA kinds and jurisdiction', () => {
    const p = {
      version: 1,
      kind: 'ga_pre_foreclosure',
      jurisdiction: 'GA',
      caseId: '33333333-3333-4333-8333-333333333333',
      propertyId: PROPERTY,
      unitId: UNIT,
      draftedOn: TODAY,
      values: {},
      chargeIds: ['q1'],
      ledgerCents: 200_000,
      enteredCents: 0,
      totalCents: 200_000,
    }
    expect(readLetterPayload(p)).toEqual(p)
  })
})

describe('the SB 406 § 7(f) notice before attorney’s fees', () => {
  it('itemizes every outstanding fine and fee, attorney’s fees included', () => {
    const f = letterFigures(gaInput(), 'ga_fee_notice', TODAY)
    expect(f.otherLines.map((l) => l.id).sort()).toEqual(['fine-1', 'legal-1'])
    expect(f.omittedLines).toEqual([])
    expect(f.ledgerCents).toBe(4 * 60_000 + 6_000 + 15_000 + 40_000)
  })

  it('30 days from receipt; the itemized attorney’s fee list is a BLANK that does not change the total', () => {
    const l = buildLetter(gaInput(), 'ga_fee_notice', TODAY, [])
    expect(l.waiting).toEqual({ ok: true, note: null })
    expect(letterDeadline('ga_fee_notice', TODAY)).toEqual({ label: expect.stringContaining('30 days from receipt'), day: '2026-11-20' })
    expect(l.fields.find((f) => f.key === 'attorneyFees')).toMatchObject({ value: null, kind: 'textarea' })
    expect(letterTotals(l, FEE_VALUES).totalCents).toBe(l.figures.ledgerCents)
    expect(letterBlocked(l, { ...FEE_VALUES, attorneyFees: '' }, true)).toBe('Fill in every BLANK first.')
    expect(letterBlocked(l, FEE_VALUES, true)).toBeNull()
    expect(l.meta.mailing).toContain('certified mail or statutory overnight delivery')
    expect(GA_FEE_NOTICE_BODY('X')).toContain('30 days from the day you receive this notice')
  })

  it('the state law check: no block on the notice itself, a delivery warning instead', () => {
    const l = buildLetter(gaInput(), 'ga_fee_notice', TODAY, [])
    const c = letterLawCheck(gaInput(), l, FEE_VALUES, [], [])
    expect(blockingFindings(c)).toEqual([])
    expect(c.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(['warn:ga_fee_notice_delivery'])
  })

  it('a later letter listing attorney’s fees is blocked until the notice was printed 30+ days earlier, then warns about receipt', () => {
    const l = buildLetter(gaInput(), 'past_due', TODAY, [])
    const at = (printedAt: string) => letterLawCheck(gaInput(), l, {}, [], [{ kind: 'ga_fee_notice', printedAt }])
    expect(blockingFindings(letterLawCheck(gaInput(), l, {}, [], [])).map((f) => f.code)).toEqual(['ga_attorney_fees_prerequisites'])
    // Printed 29 days before Oct 21 (association time, America/New_York).
    expect(blockingFindings(at('2026-09-22T15:00:00Z')).map((f) => f.code)).toEqual(['ga_attorney_fees_prerequisites'])
    const cleared = at('2026-09-21T15:00:00Z') // 30 days
    expect(blockingFindings(cleared)).toEqual([])
    expect(cleared.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(['warn:ga_attorney_fees_receipt'])
    // A plain past-due letter is not the § 7(f) notice.
    expect(blockingFindings(letterLawCheck(gaInput(), l, {}, [], [{ kind: 'past_due', printedAt: '2026-01-01T15:00:00Z' }]))).toHaveLength(1)
  })
})

describe('the § 44-3-232(c) notice before foreclosure', () => {
  it('goes to the lot address (from the app) and any designated address (a BLANK)', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', TODAY, [])
    expect(l.fields.find((f) => f.key === 'lotAddress')?.value).toBe('9 Magnolia Way, Marietta GA 30060')
    expect(l.fields.find((f) => f.key === 'designatedAddress')?.value).toBeNull()
    expect(l.fields.some((f) => f.key === 'mailingAddress')).toBe(false)
    expect(l.meta.mailing).toContain('return receipt requested')
    expect(l.meta.mailing).toContain('every other address the owner designated')
    expect(GA_PRE_FORECLOSURE_BODY('X')).toContain('no sooner than 30 days after this notice is sent')
  })

  it('interest above 10% a year is refused (§ 44-3-232(b)(2))', () => {
    expect(letterProblems('ga_pre_foreclosure', { interestRate: '10' })).toEqual([])
    expect(letterProblems('ga_pre_foreclosure', { interestRate: '10.5' })).toEqual(['The interest rate can’t be above 10% a year (§ 44-3-232(b)(2)).'])
    expect(letterProblems('ga_pre_foreclosure', { interestRate: 'ten' })).toEqual(['Enter the interest rate as a number, like 18 or 12.5.'])
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', TODAY, [])
    expect(letterBlocked(l, { ...FORECLOSURE_VALUES, interestRate: '18' }, true)).toContain('above 10%')
  })

  it('blocked below the $2,000 minimum, counting the entered interest', () => {
    const small = gaInput({ charges: [charge('q1', '2026-01-01', 1_900)] })
    const l = buildLetter(small, 'ga_pre_foreclosure', TODAY, [])
    expect(letterBlocked(l, { ...FORECLOSURE_VALUES, interest: '99.99' }, true)).toContain('at least $2,000')
    expect(letterBlocked(l, { ...FORECLOSURE_VALUES, interest: '100' }, true)).toBeNull()
  })

  it('the full fixture passes; its state law check flags the attorney’s fees and the delivery rule', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', TODAY, [])
    expect(letterBlocked(l, FORECLOSURE_VALUES, true)).toBeNull()
    expect(letterDeadline('ga_pre_foreclosure', TODAY)?.day).toBe('2026-11-20')
    const c = letterLawCheck(gaInput(), l, FORECLOSURE_VALUES, [], [])
    expect(c.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(['block:ga_attorney_fees_prerequisites', 'warn:ga_foreclosure_notice_delivery'])
  })


  it('names charges whose lien has lapsed or lapses within 180 days (four years after first due)', () => {
    expect(addYears('2022-10-21', 4)).toBe('2026-10-21')
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29')
    expect(addYears('2020-02-29', 3)).toBe('2023-02-28')
    const old = gaInput({ charges: [charge('old', '2022-10-01', 900), charge('soon', '2023-03-01', 900), charge('new', '2026-01-01', 900)] })
    const l = buildLetter(old, 'ga_pre_foreclosure', TODAY, [])
    const notes = gaLapseNotes(l.figures, TODAY)
    expect(notes).toHaveLength(2)
    expect(notes[0]).toContain('The lien has lapsed for one charge')
    expect(notes[1]).toContain('lapses soon')
    expect(notes[1]).toContain('Mar 1, 2027')
    expect(l.notes).toEqual(expect.arrayContaining(notes))
    expect(gaLapseNotes(buildLetter(gaInput(), 'ga_pre_foreclosure', TODAY, []).figures, TODAY)).toEqual([])
  })

  it('flags a late charge above the § 44-3-232(b)(1) cap (shared with BL-147)', () => {
    // $600 dues: cap is the greater of $10 or $60. $60 passes, $75 is flagged.
    expect(buildLetter(gaInput(), 'ga_pre_foreclosure', TODAY, []).notes.some((n) => n.includes('late charge'))).toBe(false)
    const over = gaInput({ charges: [charge('q1', '2026-01-01', 2_400), charge('lf', '2026-01-15', 500, 'late_fee')] })
    const note = buildLetter(over, 'ga_pre_foreclosure', TODAY, []).notes.find((n) => n.includes('late charge'))
    expect(note).toContain('above $240.00')
    expect(note).toContain('O.C.G.A. § 44-3-232(b)(1)')
  })
})

// ─── BL-154: SB 406 § 5's § 44-3-232(c), in force January 1, 2027 ───

describe('the notice before foreclosure switches to SB 406 § 5’s text on January 1, 2027', () => {
  const DEC31 = '2026-12-31'
  const JAN1 = '2027-01-01'
  const MID_JAN = '2027-01-15'
  const V2027 = { ...FORECLOSURE_VALUES, regularYear: '2400' }

  it('Dec 31, 2026 is exactly as before: 30 days, the $2,000 minimum, four years, fines listed, no new BLANK', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', DEC31, [])
    expect(l.waiting.ok).toBe(true)
    expect(l.meta).toBe(LETTER_META.ga_pre_foreclosure)
    expect(l.meta.label).toBe('Notice before foreclosure (§ 44-3-232(c), 30 days)')
    expect(letterDeadline('ga_pre_foreclosure', DEC31)).toEqual({ label: 'Earliest day to foreclose the lien, if sent on the letter date (30 days)', day: '2027-01-30' })
    expect(l.fields.some((f) => f.key === 'regularYear')).toBe(false)
    expect(l.figures.otherLines.map((x) => x.id)).toEqual(['fine-1', 'legal-1'])
    expect(gaForeclosureLaw(DEC31)).toMatchObject({ sb406: false, days: 30, lapseYears: 4, quotes: GA_PRE_FORECLOSURE_QUOTES })
    expect(gaForeclosureLaw(DEC31).body('X')).toBe(GA_PRE_FORECLOSURE_BODY('X'))
    expect(letterBlocked(l, FORECLOSURE_VALUES, true)).toBeNull()
  })

  it('from Jan 1, 2027 it can be drafted again (no longer refused), as a 60-day notice', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', JAN1, [])
    expect(l.waiting.ok).toBe(true)
    expect(l.waiting.ok && l.waiting.note).toContain('no sooner than 60 days')
    expect(l.meta.label).toBe('Notice before foreclosure (§ 44-3-232(c), 60 days)')
    expect(letterMeta('ga_pre_foreclosure', JAN1).description).toContain('lesser of $4,000 or 12 months of dues')
    expect(l.meta.mailing).toContain('no sooner than 60 days after it is sent')
    expect(letterDeadline('ga_pre_foreclosure', JAN1)).toEqual({ label: 'Earliest day to foreclose the lien, if sent on the letter date (60 days)', day: '2027-03-02' })
    expect(gaForeclosureLaw(JAN1)).toMatchObject({ sb406: true, days: 60, lapseYears: 6, quotes: GA_PRE_FORECLOSURE_QUOTES_2027 })
    // The other GA letter and other kinds keep their meta.
    expect(letterMeta('ga_fee_notice', JAN1)).toBe(LETTER_META.ga_fee_notice)
    expect(buildLetter(gaInput(), 'ga_fee_notice', JAN1, []).waiting.ok).toBe(true)
  })

  it('the 2027 letter states that paying before the sixtieth day after receipt ends the right of foreclosure', () => {
    const body = GA_PRE_FORECLOSURE_BODY_2027('Peachtree Fixture HOA')
    expect(body).toContain('no sooner than 60 days after this notice is sent')
    expect(body).toContain('Payment of the amount below prior to the sixtieth day following your receipt of this notice will eliminate the right of foreclosure.')
    expect(gaForeclosureLaw(JAN1).body('X')).toBe(GA_PRE_FORECLOSURE_BODY_2027('X'))
  })

  it('from 2027 it lists the assessments and late charges only: fines and fees are left off, with a note', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', MID_JAN, [])
    expect(l.figures.otherLines).toEqual([])
    expect(l.figures.omittedLines.map((x) => x.id).sort()).toEqual(['fine-1', 'legal-1'])
    expect(l.figures.lateFeeLines.map((x) => x.id)).toEqual(['lf-1'])
    expect(l.notes).toContain(GA_2027_FINE_NOTE)
    expect(letterTotals(l, V2027).totalCents).toBe(240_000 + 6_000 + 2_500)
    // Without fees listed, the attorney's-fee block no longer applies to this notice.
    const c = letterLawCheck({ ...gaInput(), gaRegistration: { status: 'registered' } }, l, V2027, [], [])
    expect(c.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(['warn:ga_foreclosure_notice_delivery', 'warn:ga_payment_order'])
    expect(blockingFindings(c)).toEqual([])
  })

  it('asks for 12 months of regular assessments (a BLANK, not printed) and won’t save without it', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', MID_JAN, [])
    const f = l.fields.find((x) => x.key === 'regularYear')!
    expect(f).toMatchObject({ kind: 'money', value: null })
    expect(letterBlanks(l, FORECLOSURE_VALUES)).toContain(f.label)
    expect(letterBlocked(l, FORECLOSURE_VALUES, true)).toBe('Fill in every BLANK first.')
    expect(letterBlocked(l, V2027, true)).toBeNull()
  })

  it('the threshold: the lesser of $4,000 or 12 months of dues, never below $2,000', () => {
    expect(gaForeclosureThresholdCents(300_000)).toBe(300_000)
    expect(gaForeclosureThresholdCents(600_000)).toBe(400_000)
    expect(gaForeclosureThresholdCents(120_000)).toBe(200_000)
    expect(gaForeclosureThresholdCents(0)).toBe(200_000)
  })

  it('blocks below the threshold, counting only regular and special assessments in arrears (no late charges, fines, fees or interest)', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', MID_JAN, [])
    expect(gaForeclosureCount(l.figures)).toEqual({ countedCents: 240_000, planCents: 0 })
    // $3,000 a year of dues: threshold $3,000 > $2,400 counted, although the letter's total is above it.
    const msg = letterBlocked(l, { ...V2027, regularYear: '3000', interest: '900' }, true)
    expect(msg).toContain('total $2,400.00')
    expect(msg).toContain('at least $3,000.00')
    expect(msg).toContain('§ 44-3-232(c)')
    expect(letterBlocked(l, { ...V2027, regularYear: '1200' }, true)).toBeNull() // $2,000 floor
    // Dues of $1,900 and $5,000 of fines: still under the $2,000 floor.
    const fines = gaInput({ charges: [charge('q1', '2026-06-01', 1_900), charge('f', '2026-06-01', 5_000, 'fine'), charge('lf', '2026-06-15', 190, 'late_fee')] })
    const lf = buildLetter(fines, 'ga_pre_foreclosure', MID_JAN, [])
    expect(letterBlocked(lf, { ...V2027, regularYear: '1000' }, true)).toContain('at least $2,000.00')
    // The same account on Dec 31, 2026: the old rule counts the whole lien (fines included).
    expect(letterBlocked(buildLetter(fines, 'ga_pre_foreclosure', DEC31, []), FORECLOSURE_VALUES, true)).toBeNull()
  })

  it('a special assessment counts; unapplied credit is taken off; plan installments are left out with a note', () => {
    const mixed = gaInput({
      charges: [charge('q1', '2026-03-01', 1_500), charge('sp', '2026-05-01', 1_000, 'special'), charge('pi', '2026-08-01', 700, 'plan_installment')],
    })
    const l = buildLetter(mixed, 'ga_pre_foreclosure', MID_JAN, [])
    expect(gaForeclosureCount(l.figures)).toEqual({ countedCents: 250_000, planCents: 70_000 })
    expect(l.notes.some((n) => n.startsWith('Payment-plan installments ($700.00) aren’t counted'))).toBe(true)
    expect(l.notes.some((n) => n.startsWith('Counted toward the foreclosure threshold: $2,500.00'))).toBe(true)
  })

  it('lapse: six years from 2027; a lien whose four years ran out before 2027 is sent to the attorney', () => {
    const old = gaInput({
      charges: [charge('gone', '2022-06-01', 900), charge('kept', '2023-03-01', 900), charge('new', '2026-01-01', 900)],
    })
    // Dec 31, 2026: four years; 2022-06-01 lapsed on 2026-06-01, 2023-03-01 lapses within 180 days.
    const dec = gaLapseNotes(buildLetter(old, 'ga_pre_foreclosure', DEC31, []).figures, DEC31)
    expect(dec[0]).toContain('first due four or more years ago')
    expect(dec[1]).toContain('lapses soon, four years after it was first due: the first on Mar 1, 2027')
    // Jan 15, 2027: 2022-06-01 lapsed before the change (attorney); 2023-03-01 now runs to 2029.
    const jan = gaLapseNotes(buildLetter(old, 'ga_pre_foreclosure', MID_JAN, []).figures, MID_JAN)
    expect(jan).toHaveLength(1)
    expect(jan[0]).toContain('lapsed before January 1, 2027, four years after it was first due (the oldest due Jun 1, 2022)')
    expect(jan[0]).toContain('ask your attorney')
    // Late 2028: the 2023 dues lapse six years after, on Mar 1, 2029.
    const later = gaLapseNotes(buildLetter(old, 'ga_pre_foreclosure', '2028-12-01', []).figures, '2028-12-01')
    expect(later.some((n) => n.includes('lapses soon, six years after it was first due: the first on Mar 1, 2029'))).toBe(true)
    expect(gaLapseNotes(buildLetter(old, 'ga_pre_foreclosure', '2029-03-01', []).figures, '2029-03-01').some((n) => n.includes('first due six or more years ago'))).toBe(true)
  })
})

