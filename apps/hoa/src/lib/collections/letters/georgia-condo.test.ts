import { describe, expect, it } from 'vitest'
import type { LedgerAssessment } from '@/lib/resident-ledger'
import { GA_CONDO_FORECLOSURE_NOTICE } from '@/lib/ga-condo/law'
import {
  LETTER_META,
  buildLetter,
  gaLapseNotes,
  kindsFor,
  letterBlocked,
  letterDeadline,
  letterLawCheck,
  letterProblems,
  stageAfterPrint,
  type LetterInput,
} from './model'
import { LETTER_KIND_CITATIONS, LETTER_KIND_LABELS, readLetterPayload } from './proposal'
import { GA_CONDO_PRE_FORECLOSURE_BODY, GA_CONDO_PRE_FORECLOSURE_QUOTES } from './law'

/**
 * BL-155: a Georgia association whose type is 'condo' gets the Condominium
 * Act's § 44-3-109(c) notice before foreclosure instead of the POA Act's
 * § 44-3-232(c) notice and SB 406 § 7 fee notice. HOAs are unchanged
 * (georgia.test.ts).
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

function condoInput(over: Partial<LetterInput> = {}): LetterInput {
  return {
    state: 'GA',
    associationType: 'condo',
    associationName: 'Midtown Fixture Condominium Association',
    propertyId: PROPERTY,
    address: '100 Peachtree St, Atlanta GA 30303',
    unitNumber: '4B',
    unitId: UNIT,
    lotNumber: null,
    owners: ['Owner A'],
    charges: [
      charge('q1', '2026-01-01', 600),
      charge('q2', '2026-04-01', 600),
      charge('q3', '2026-07-01', 600),
      charge('q4', '2026-10-01', 600),
      charge('lf-1', '2026-01-15', 60, 'late_fee'),
      charge('legal-1', '2026-09-01', 400, 'collection_legal'),
    ],
    payments: [],
    plans: [],
    planInstallmentIds: [],
    timeZone: 'America/New_York',
    ...over,
  }
}

const VALUES = { designatedAddress: 'None', interest: '25.00', interestRate: '10', signer: 'Pat Board, President' }

describe('which letters a Georgia condominium gets', () => {
  it('the § 44-3-109(c) notice and the past-due letter; no POA Act or SB 406 § 7 notice', () => {
    expect(kindsFor('GA', true)).toEqual(['ga_condo_pre_foreclosure', 'past_due'])
    expect(kindsFor('GA')).toEqual(['ga_fee_notice', 'ga_pre_foreclosure', 'past_due'])
    expect(kindsFor('FL', true)).toEqual(kindsFor('FL'))
    expect(LETTER_META.ga_condo_pre_foreclosure).toMatchObject({ jurisdiction: 'GA', gaAct: 'condo', eventType: 'lien_letter_sent', listsFines: true })
    expect(LETTER_KIND_CITATIONS.ga_condo_pre_foreclosure).toBe('O.C.G.A. § 44-3-109(c)')
    expect(LETTER_KIND_LABELS.ga_condo_pre_foreclosure).toContain('condominium')
    expect(stageAfterPrint('ga_condo_pre_foreclosure', 'collection_letter')).toBe('lien_letter')
  })

  it('a POA Act notice is refused for a condo, and the condo notice for an HOA', () => {
    const poa = buildLetter(condoInput(), 'ga_pre_foreclosure', TODAY, [])
    expect(poa.waiting.ok).toBe(false)
    expect(poa.waiting.ok ? '' : poa.waiting.reason).toContain('§ 44-3-235(b)')
    expect(buildLetter(condoInput(), 'ga_fee_notice', TODAY, []).waiting.ok).toBe(false)
    const hoa = buildLetter(condoInput({ associationType: 'hoa' }), 'ga_condo_pre_foreclosure', TODAY, [])
    expect(hoa.waiting.ok ? '' : hoa.waiting.reason).toContain('isn’t set up as a condominium')
  })

  it('the saved payload accepts the new kind', () => {
    const payload = readLetterPayload({
      version: 1,
      kind: 'ga_condo_pre_foreclosure',
      jurisdiction: 'GA',
      caseId: '33333333-3333-4333-8333-333333333333',
      propertyId: PROPERTY,
      unitId: UNIT,
      draftedOn: TODAY,
      values: VALUES,
      chargeIds: ['q1'],
      ledgerCents: 290_000,
      enteredCents: 2_500,
      totalCents: 292_500,
    })
    expect(payload?.kind).toBe('ga_condo_pre_foreclosure')
  })
})

describe('the § 44-3-109(c) notice before foreclosure', () => {
  it('goes to the unit address and any designated address; cites § 44-3-109(c), never § 44-3-232', () => {
    const l = buildLetter(condoInput(), 'ga_condo_pre_foreclosure', TODAY, [])
    expect(l.fields.find((f) => f.key === 'lotAddress')).toMatchObject({ label: 'The unit’s address', value: '100 Peachtree St, Atlanta GA 30303, Unit 4B' })
    expect(l.fields.find((f) => f.key === 'designatedAddress')?.value).toBeNull()
    expect(l.meta.citation).toBe('O.C.G.A. § 44-3-109(c)')
    expect(l.meta.mailing).toContain('return receipt requested')
    expect(l.meta.mailing).toContain('(§ 44-3-109(c))')
    expect(GA_CONDO_PRE_FORECLOSURE_BODY('X')).toContain('O.C.G.A. § 44-3-109(c)')
    expect(GA_CONDO_PRE_FORECLOSURE_BODY('X')).toContain('your unit')
    const everything = JSON.stringify({ l, quotes: GA_CONDO_PRE_FORECLOSURE_QUOTES, body: GA_CONDO_PRE_FORECLOSURE_BODY('X') })
    expect(everything).not.toContain('44-3-232')
    expect(everything).not.toContain('SB 406')
    expect(GA_CONDO_PRE_FORECLOSURE_QUOTES.every((q) => q.cite.startsWith('O.C.G.A. § 44-3-109'))).toBe(true)
  })

  it('interest above 10% a year is refused under § 44-3-109(b)(2); below $2,000 is blocked under § 44-3-109(c)', () => {
    expect(letterProblems('ga_condo_pre_foreclosure', { interestRate: '10' })).toEqual([])
    expect(letterProblems('ga_condo_pre_foreclosure', { interestRate: '10.5' })).toEqual(['The interest rate can’t be above 10% a year (§ 44-3-109(b)(2)).'])
    const small = buildLetter(condoInput({ charges: [charge('q1', '2026-01-01', 1_900)] }), 'ga_condo_pre_foreclosure', TODAY, [])
    expect(letterBlocked(small, { ...VALUES, interest: '99.99' }, true)).toContain('(§ 44-3-109(c))')
    expect(letterBlocked(small, { ...VALUES, interest: '100' }, true)).toBeNull()
  })

  it('NOT cut off on January 1, 2027: SB 406 does not amend Article 3', () => {
    expect(buildLetter(condoInput(), 'ga_condo_pre_foreclosure', '2027-01-01', []).waiting.ok).toBe(true)
    expect(buildLetter(condoInput(), 'ga_condo_pre_foreclosure', '2027-06-30', []).waiting.ok).toBe(true)
    expect(letterDeadline('ga_condo_pre_foreclosure', TODAY)?.day).toBe('2026-11-20')
  })

  it('the state law check: the condo delivery warning, and no SB 406 § 7 attorney’s-fee block', () => {
    const l = buildLetter(condoInput(), 'ga_condo_pre_foreclosure', TODAY, [])
    expect(letterBlocked(l, VALUES, true)).toBeNull()
    const c = letterLawCheck(condoInput(), l, VALUES, [], [])
    expect(c.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(['warn:ga_condo_foreclosure_notice_delivery'])
    expect(c.findings[0]!.citations).toEqual([GA_CONDO_FORECLOSURE_NOTICE])
  })

  it('the SB 406 registration bar still applies to a condominium', () => {
    const l = buildLetter(condoInput(), 'ga_condo_pre_foreclosure', '2027-02-01', [])
    const c = letterLawCheck(condoInput({ gaRegistration: { status: 'not_registered' } }), l, VALUES, [], [])
    expect(c.findings.map((f) => f.code)).toContain('ga_unregistered_lien')
  })

  it('BL-161: the SB 406 complaint stay blocks a condo letter that lists fines or fees (§ 43-17A-5 covers condominiums)', () => {
    const date = '2027-02-01'
    const l = buildLetter(condoInput(), 'ga_condo_pre_foreclosure', date, [])
    const stay = { verified: true, complaints: [{ filedOn: '2027-01-15', conclusionsOn: null, extended: false }] }
    const c = letterLawCheck(condoInput({ gaComplaintStay: stay }), l, VALUES, [], [])
    expect(c.findings.find((f) => f.code === 'ga_complaint_stay')?.severity).toBe('block')
    const none = letterLawCheck(condoInput({ gaComplaintStay: { verified: true, complaints: [] } }), l, VALUES, [], [])
    expect(none.findings.map((f) => f.code)).not.toContain('ga_complaint_stay')
  })

  it('lapse and late-charge notes cite the Condominium Act', () => {
    const old = condoInput({ charges: [charge('old', '2022-10-01', 2_400), charge('lf', '2022-10-15', 500, 'late_fee')] })
    const l = buildLetter(old, 'ga_condo_pre_foreclosure', TODAY, [])
    expect(gaLapseNotes(l.figures, TODAY, true)[0]).toContain('(§ 44-3-109(c))')
    const late = l.notes.find((n) => n.includes('late charge'))
    expect(late).toContain('O.C.G.A. § 44-3-109(b)(1)')
    expect(l.notes.join(' ')).not.toContain('44-3-232')
  })
})
