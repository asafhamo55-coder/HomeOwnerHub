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
