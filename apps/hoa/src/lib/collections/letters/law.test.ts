import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  CA_DELINQUENT_AFTER_DAYS,
  CA_IMPORTANT_NOTICE,
  CA_MAX_INTEREST_PERCENT,
  CA_PRE_LIEN_DAYS,
  CA_RIGHTS,
  FL_DEFAULT_INTEREST_PERCENT,
  FL_INTENT_BODY,
  FL_INTENT_DAYS,
  FL_LATE_NOTICE_BODY,
  FL_LATE_NOTICE_DAYS,
  GA_232C_REPLACED_ON,
  GA_FEE_NOTICE_DAYS,
  GA_FORECLOSURE_CAP_CENTS_2027,
  GA_FORECLOSURE_MONTHS_2027,
  GA_LIEN_LAPSE_YEARS_2027,
  GA_PRE_FORECLOSURE_BODY_2027,
  GA_PRE_FORECLOSURE_DAYS_2027,
  GA_PRE_FORECLOSURE_QUOTES_2027,
  GA_FEE_NOTICE_QUOTES,
  GA_FORECLOSURE_MIN_CENTS,
  GA_LIEN_LAPSE_YEARS,
  GA_MAX_INTEREST_PERCENT,
  GA_PRE_FORECLOSURE_DAYS,
  GA_PRE_FORECLOSURE_QUOTES,
  TX_CURE_DAYS,
} from './law'

/**
 * The statute values and form wording in law.ts, checked against the
 * official text kept in the repo (BL-054 practice): the Florida Senate's
 * 2026 chapter 720, the California Legislative Counsel's bulk-data Civil
 * Code, and the Texas Legislative Council's Property Code chapter 209.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ')

const fl = squash(parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026).find((r) => r.code_citation === 'Fla. Stat. § 720.3085')?.body ?? '')

const section = (file: string, marker: string) => {
  const t = fixture(file)
  const start = t.indexOf(marker)
  if (start < 0) return ''
  const end = t.indexOf('\n=== ', start + 1)
  return squash(t.slice(start, end < 0 ? undefined : end))
}
const ca = (n: string) => section('ca-civ-davis-stirling-2026.txt', `=== Civ. Code § ${n}.  [`)
const tx = section('tx-prop-209-2026.txt', '=== Sec. 209.0064.')

/** Only the words: the form's blanks ("(name of association)") are filled in by law.ts. */
const words = (s: string) => squash(s).replace(/[’']/g, "'")

describe('Florida § 720.3085 (2026, as amended by ch. 2024-221 — HB 1203)', () => {
  it('has the section, last amended in 2024', () => {
    expect(fl.length).toBeGreaterThan(5000)
    // The parser drops the history note; this run of it is § 720.3085's
    // (s. 1, ch. 2007-183 … s. 10, ch. 2024-221), read from the page.
    expect(fixture('flsenate-ch720-2026.html')).toContain('s. 16, ch. 2018-96; s. 7, ch. 2021-91; s. 20, ch. 2023-203; s. 10, ch. 2024-221.</')
  })

  it('the notice of late assessment is (3)(d), not (3)(a)', () => {
    // (3)(a) is the late-fee cap; (3)(d) is the notice.
    expect(fl).toContain('(a) If the declaration or bylaws so provide, the association may also charge an administrative late fee')
    expect(fl).toContain('(d) An association may not require payment of attorney fees related to a past due assessment without first delivering a written notice of late assessment')
    expect(fl).toContain('must be sent by first-class United States mail')
  })

  it('30 days; the body is the statutory form word for word', () => {
    expect(FL_LATE_NOTICE_DAYS).toBe(30)
    const formText = words(fl).replace(/ \(name of association\) ,/g, ' X,').replace(/ \(name of association\) \./g, ' X.')
    const ours = words(FL_LATE_NOTICE_BODY('X'))
    expect(formText).toContain('NOTICE OF LATE ASSESSMENT RE: Parcel of')
    expect(formText).toContain(ours.replace(/:$/, ''))
    expect(fl).toContain('Maintenance due (dates) $ . Late fee, if applicable $ . Interest through (dates) * $ . TOTAL OUTSTANDING $ . *Interest accrues at the rate of percent per annum.')
  })

  it('45 days from mailing for the intent to lien; the body is the statutory form word for word', () => {
    expect(FL_INTENT_DAYS).toBe(45)
    expect(fl).toContain('Provide the owner with 45 days following the date the notice is deposited in the mail')
    const formText = words(fl).replace(/ \(name of association\) ,/g, ' X,')
    expect(formText).toContain(words(FL_INTENT_BODY('X')).replace(/:$/, ''))
    expect(fl).toContain('Certified mail charges $ . Other costs $ . TOTAL OUTSTANDING $ .')
    expect(fl).toContain('Be sent by registered or certified mail, return receipt requested, and by first-class United States mail')
  })

  it('18% simple interest when the declaration sets no rate', () => {
    expect(FL_DEFAULT_INTEREST_PERCENT).toBe(18)
    expect(fl).toContain('If no rate is provided in the declaration or bylaws, simple interest accrues at the rate of 18 percent per year')
  })

  it('the late notice promises no further action for 30 days (the waiting rule)', () => {
    expect(fl).toContain('notice to proceed with further collection action against your property no sooner than 30 days after the date of this letter')
  })
})

describe('California §§ 5650, 5660, 5665', () => {
  it('the fixture now carries the collection sections', () => {
    for (const n of ['5650', '5655', '5658', '5660', '5665']) expect(ca(n).length, `§ ${n}`).toBeGreaterThan(100)
  })

  it('§ 5660: 30 days before recording a lien, by certified mail', () => {
    expect(CA_PRE_LIEN_DAYS).toBe(30)
    expect(ca('5660')).toContain('At least 30 days prior to recording a lien upon the separate interest of the owner of record')
    expect(ca('5660')).toContain('in writing by certified mail of the following')
  })

  it('§ 5660(a): the IMPORTANT NOTICE text exactly', () => {
    expect(ca('5660')).toContain(`“${CA_IMPORTANT_NOTICE}”`)
    expect(ca('5660')).toContain('in 14-point boldface type, if printed')
  })

  it('§ 5660(a), (c)–(f): every required statement is on the letter', () => {
    expect(CA_RIGHTS.map((r) => r.cite)).toEqual(['§ 5660(a)', '§ 5660(c)', '§ 5660(d)', '§ 5660(e)', '§ 5660(f)'])
    const s = ca('5660')
    expect(s).toContain('right to inspect the association records pursuant to Section 5205')
    expect(s).toContain('shall not be liable to pay the charges, interest, and costs of collection, if it is determined the assessment was paid on time')
    expect(s).toContain('(d)The right to request a meeting with the board as provided in Section 5665.')
    expect(s).toContain('“meet and confer” program')
    expect(s).toContain('binding arbitration shall not be available if the association intends to initiate a judicial foreclosure')
    expect(ca('5665')).toContain('within 45 days of the postmark of the request, if the request is mailed within 15 days of the date of the postmark of the notice')
  })

  it('§ 5650(b): delinquent 15 days after due; interest at most 12%', () => {
    expect(CA_DELINQUENT_AFTER_DAYS).toBe(15)
    expect(ca('5650')).toContain('are delinquent 15 days after they become due')
    expect(CA_MAX_INTEREST_PERCENT).toBe(12)
    expect(ca('5650')).toContain('at an annual interest rate not to exceed 12 percent')
  })
})

describe('Texas § 209.0064', () => {
  it('is official text, fetched', () => {
    expect(tx).toContain('Sec. 209.0064. THIRD PARTY COLLECTIONS.')
    expect(tx).toContain('S.B. 1588')
  })

  it('certified mail, each delinquent amount and the total, payment plan options, at least 45 days', () => {
    expect(TX_CURE_DAYS).toBe(45)
    expect(tx).toContain('provides written notice to the owner by certified mail that')
    expect(tx).toContain('specifies each delinquent amount and the total amount of the payment required to make the account current')
    expect(tx).toContain('information regarding availability of a payment plan through the association')
    expect(tx).toContain('provides a period of at least 45 days for the owner to cure the delinquency before further collection action is taken')
  })
})

const GA_FILE = 'ga-ocga-44-3-art6-2026.txt'
const sb406_232c = section('ga-sb406-2026-2027-text.txt', '=== SECTION 5. (O.C.G.A. § 44-3-232(c)')

describe('Georgia SB 406 § 7 and O.C.G.A. § 44-3-232 (BL-148)', () => {
  const sb406 = section(GA_FILE, '=== Ga. L. 2026, SB 406, § 7 |')
  const s232 = section(GA_FILE, '=== O.C.G.A. Section 44-3-232 |')

  it('both sections are in the snapshot', () => {
    expect(sb406).toContain('@effective_date: 2026-07-01')
    expect(s232).toContain('(c) Not less than 30 days after notice is sent')
  })

  it.each(GA_FEE_NOTICE_QUOTES.map((q) => [q.cite, q] as const))('fee notice quote verbatim in SB 406 § 7: %s', (_cite, q) => {
    expect(q.fixture).toBe(GA_FILE)
    expect(sb406).toContain(squash(q.quote))
  })

  it.each(GA_PRE_FORECLOSURE_QUOTES.map((q) => [`${q.cite} — ${q.quote.slice(0, 40)}`, q] as const))('pre-foreclosure quote verbatim in § 44-3-232: %s', (_cite, q) => {
    expect(q.fixture).toBe(GA_FILE)
    expect(s232).toContain(squash(q.quote))
  })

  it('the numbers match the text', () => {
    expect(GA_FEE_NOTICE_DAYS).toBe(30)
    expect(sb406).toContain('Lot owners with 30 days from the receipt of the notice')
    expect(GA_PRE_FORECLOSURE_DAYS).toBe(30)
    expect(GA_FORECLOSURE_MIN_CENTS).toBe(200_000)
    expect(s232).toContain('unless the amount of the lien is at least $2,000.00')
    expect(GA_MAX_INTEREST_PERCENT).toBe(10)
    expect(s232).toContain('At a rate not in excess of 10 percent per annum')
    expect(GA_LIEN_LAPSE_YEARS).toBe(4)
    expect(s232).toContain('four years after the assessment or installment first became due and payable')
  })

  it('the pre-2027 quotes are the text in force until Jan 1, 2027, and not SB 406 § 5’s', () => {
    for (const q of GA_PRE_FORECLOSURE_QUOTES.filter((x) => x.cite === 'O.C.G.A. § 44-3-232(c)')) {
      expect(sb406_232c).not.toContain(squash(q.quote))
    }
  })
})

describe('Georgia § 44-3-232(c) from January 1, 2027 (BL-154: SB 406 § 5, official bill text)', () => {
  const ACT = 'ga-sb406-2026-2027-text.txt'
  const sec2 = section(ACT, '=== SECTION 2. (new O.C.G.A. Chapter 43-17A')
  const in2027 = (q: { cite: string }) =>
    q.cite.startsWith('O.C.G.A. § 44-3-232(c)') ? sb406_232c : q.cite.startsWith('O.C.G.A. § 43-17A-1(') ? sec2 : q.cite.startsWith('O.C.G.A. § 44-3-232(b)') ? section(GA_FILE, '=== O.C.G.A. Section 44-3-232 |') : ''

  it.each(GA_PRE_FORECLOSURE_QUOTES_2027.map((q) => [`${q.cite} — ${q.quote.slice(0, 40)}`, q] as const))('2027 quote verbatim in its fixture and section: %s', (_cite, q) => {
    expect(in2027(q)).toContain(squash(q.quote))
    // (b)(2), the interest cap, is unchanged by SB 406 and stays checked against the snapshot.
    expect(q.fixture).toBe(q.cite.startsWith('O.C.G.A. § 44-3-232(b)') ? GA_FILE : ACT)
  })

  it('the numbers match the 2027 text', () => {
    expect(GA_232C_REPLACED_ON).toBe('2027-01-01')
    expect(section(ACT, '=== SECTION 9.')).toContain('this Act shall become effective on January 1, 2027.')
    expect(GA_PRE_FORECLOSURE_DAYS_2027).toBe(60)
    expect(sb406_232c).toContain('(c) Not less than 60 days after notice is sent')
    expect(sb406_232c).toContain('prior to the sixtieth day following receipt of the notice')
    expect(GA_FORECLOSURE_CAP_CENTS_2027).toBe(400_000)
    expect(GA_FORECLOSURE_MONTHS_2027).toBe(12)
    expect(GA_FORECLOSURE_MIN_CENTS).toBe(200_000)
    expect(sb406_232c).toContain('at least the lesser of $4,000.00 or an amount equal to 12 months of regular assessments')
    expect(sb406_232c).toContain('in arrears but not less than $2,000.00')
    expect(GA_LIEN_LAPSE_YEARS_2027).toBe(6)
    expect(sb406_232c).toContain('six years after the assessment or installment first became due and payable')
  })

  it('the letter’s plain-words statement tracks the statute’s required statement', () => {
    expect(sb406_232c).toContain('shall state that payment of such amount prior to the sixtieth day following receipt of the notice will eliminate the right of foreclosure')
    expect(GA_PRE_FORECLOSURE_BODY_2027('X')).toContain('prior to the sixtieth day following your receipt of this notice will eliminate the right of foreclosure')
  })

  it('the snapshot serves the same 2027 text (its dated § 44-3-232 record) and is valid until 2027-07-01', () => {
    const t = fixture(GA_FILE)
    expect(t).toContain('@valid_until: 2027-07-01')
    const dated = squash(t.slice(t.lastIndexOf('=== O.C.G.A. Section 44-3-232 |')).split('\n=== ')[0]!)
    expect(dated).toContain('@effective_date: 2027-01-01')
    for (const q of GA_PRE_FORECLOSURE_QUOTES_2027.filter((x) => x.cite.startsWith('O.C.G.A. § 44-3-232(c)'))) expect(dated).toContain(squash(q.quote))
  })
})
