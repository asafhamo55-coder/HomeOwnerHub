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
  letterLawCheck,
  letterProblems,
  letterTotals,
  stageAfterPrint,
  type LetterInput,
} from './model'
import { LETTER_KIND_CITATIONS, LETTER_KIND_LABELS, readLetterPayload } from './proposal'
import { GA_2027_NOT_LOADED, GA_FEE_NOTICE_BODY, GA_PRE_FORECLOSURE_BODY } from './law'

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

  it('refused from January 1, 2027: SB 406 § 5’s new text is not loaded', () => {
    const l = buildLetter(gaInput(), 'ga_pre_foreclosure', '2027-01-01', [])
    expect(l.waiting).toEqual({ ok: false, reason: GA_2027_NOT_LOADED, earliest: null })
    expect(GA_2027_NOT_LOADED).toContain('Check with your association’s attorney')
    expect(buildLetter(gaInput(), 'ga_pre_foreclosure', '2026-12-31', []).waiting.ok).toBe(true)
    // The fee notice (SB 406 § 7, in force since July 1, 2026) is not affected.
    expect(buildLetter(gaInput(), 'ga_fee_notice', '2027-01-01', []).waiting.ok).toBe(true)
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
