import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  CA_DOCUMENTS_NOT_GENERATED,
  CA_RESPONSE_DAYS,
  FL_EXPEDITED_BUSINESS_DAYS,
  FL_FEE_CAPS_CENTS,
  FL_RESPONSE_BUSINESS_DAYS,
  GA_FEE_CAP_CENTS,
  GA_RESPONSE_BUSINESS_DAYS,
  TX_DOCUMENTS_NOT_GENERATED,
  TX_FEE_CAP_CENTS,
  TX_PREPARED_WITHIN_DAYS,
  TX_RESPONSE_BUSINESS_DAYS,
  TX_UPDATE_BUSINESS_DAYS,
  TX_UPDATE_FEE_CAP_CENTS,
  flEffectiveDays,
} from './law'

/**
 * The statute values in law.ts, checked against the official text kept
 * in the repo (BL-054 practice): the Florida Senate's 2026 chapter 720
 * and the California Legislative Counsel's bulk-data Civil Code.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')

const flText = (parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026).find((r) => r.code_citation === 'Fla. Stat. § 720.30851')?.body ?? '')
  .replace(/\s+/g, ' ')

const caSection = (n: string) => {
  const t = fixture('ca-civ-davis-stirling-2026.txt')
  const start = t.indexOf(`=== Civ. Code § ${n}.  [`)
  const end = t.indexOf('\n=== ', start + 1)
  return t.slice(start, end)
}

describe('Florida § 720.30851', () => {
  it('has the section', () => {
    expect(flText.length).toBeGreaterThan(1000)
  })

  it('10 business days to respond; 3 business days for expedited', () => {
    expect(FL_RESPONSE_BUSINESS_DAYS).toBe(10)
    expect(flText).toContain('Within 10 business days after receiving a written or electronic request')
    expect(FL_EXPEDITED_BUSINESS_DAYS).toBe(3)
    expect(flText).toContain('delivered within 3 business days after the request')
  })

  it('30-day effective period by hand or e-mail, 35 by regular mail', () => {
    expect(flEffectiveDays('electronic')).toBe(30)
    expect(flEffectiveDays('hand')).toBe(30)
    expect(flEffectiveDays('mail')).toBe(35)
    expect(flText).toContain('hand delivered or sent by electronic means has a 30-day effective period')
    expect(flText).toContain('sent by regular mail has a 35-day effective period')
  })

  it('fee caps: $250 base, $100 expedited, $150 delinquent', () => {
    expect(FL_FEE_CAPS_CENTS).toEqual({ base: 25_000, expedited: 10_000, delinquent: 15_000 })
    expect(flText).toContain('which may not exceed $250')
    expect(flText).toContain('the association may charge an additional fee of $100')
    expect(flText).toContain('an additional fee for the estoppel certificate may not exceed $150')
    // ...and they are CPI-adjusted by DBPR, which the page says.
    expect(flText).toContain('adjusted every 5 years')
  })
})

describe('California §§ 4525, 4530', () => {
  it('10 days of the mailing or delivery of the request', () => {
    expect(CA_RESPONSE_DAYS).toBe(10)
    expect(caSection('4530')).toContain('within 10 days of the mailing or delivery of the request')
  })

  it('every § 4525(a) paragraph not generated here is listed, and none that is', () => {
    const s = caSection('4525')
    for (const n of [1, 2, 3, 6, 7, 9, 10, 11]) expect(s).toContain(`\n(${n})`)
    const listed = CA_DOCUMENTS_NOT_GENERATED.map((d) => d.cite)
    expect(listed).toEqual(['§ 4525(a)(1)', '§ 4525(a)(2)', '§ 4525(a)(3)', '§ 4525(a)(6)', '§ 4525(a)(7)', '§ 4525(a)(9)', '§ 4525(a)(10)', '§ 4525(a)(11)', '§ 4528'])
    // (a)(4), (a)(5) are generated and (a)(8) is a board BLANK.
    expect(listed).not.toContain('§ 4525(a)(4)')
    expect(listed).not.toContain('§ 4525(a)(5)')
    expect(s).toContain('(11)A copy of the report issued pursuant to the most recent inspection conducted pursuant to Section 5551.')
  })
})

/** Texas Property Code ch. 207, from the Texas Legislative Council's official text. */
const tx = fixture('tx-prop-207-2026.txt')
const txSection = (n: string) => {
  const start = tx.indexOf(`=== Sec. ${n}.`)
  const end = tx.indexOf('\n=== ', start + 1)
  return start < 0 ? '' : tx.slice(start, end < 0 ? undefined : end)
}

describe('Texas § 207.003', () => {
  const s = txSection('207.003')

  it('has the section, and there is no § 207.0035', () => {
    expect(s.length).toBeGreaterThan(3000)
    expect(txSection('207.0035')).toBe('')
  })

  it('10th business day after the request; prepared within 60 days of delivery', () => {
    expect(TX_RESPONSE_BUSINESS_DAYS).toBe(10)
    expect(s).toContain('Not later than the 10th business day after the date a written request for subdivision information is received')
    expect(TX_PREPARED_WITHIN_DAYS).toBe(60)
    expect(s).toContain('a resale certificate prepared not earlier than the 60th day before the date the certificate is delivered')
  })

  it('fee caps: $375, $75 for an update; no fee when late', () => {
    expect(TX_FEE_CAP_CENTS).toBe(37_500)
    expect(s).toContain('a reasonable and necessary fee, not to exceed $375, to assemble, copy, and deliver the information required by this section')
    expect(TX_UPDATE_FEE_CAP_CENTS).toBe(7_500)
    expect(s).toContain('not to exceed $75, to prepare and deliver an update of a resale certificate under Subsection (f)')
    expect(s).toContain('The association may not charge a fee if the certificate is not provided in the time prescribed by Subsection (a).')
    expect(TX_UPDATE_BUSINESS_DAYS).toBe(7)
    expect(s).toContain('Not later than the seventh business day after the date a written request for an update')
  })

  it('(b) has items (1) to (16); the documents not generated are (a)(1), (a)(2), (b)(7), (b)(10)', () => {
    for (let n = 1; n <= 16; n++) expect(s).toContain(`\n(${n}) `)
    expect(s).not.toContain('\n(17) ')
    expect(s).toContain("(7) the property owners' association's current operating budget and balance sheet;")
    expect(s).toContain("(10) a copy of a certificate of insurance showing the property owners' association's property and liability insurance")
    expect(TX_DOCUMENTS_NOT_GENERATED.map((d) => d.cite)).toEqual(['§ 207.003(a)(1)', '§ 207.003(a)(2)', '§ 207.003(b)(7)', '§ 207.003(b)(10)'])
  })

  it('signed and dated by an officer or agent; not for condominiums', () => {
    expect(txSection('207.001')).toContain('a written statement issued, signed, and dated by an officer or authorized agent')
    expect(txSection('207.002')).toContain('This chapter does not apply to a condominium council of owners governed by Chapter 81 or a condominium unit owners\' association governed by Chapter 82.')
  })
})

/** O.C.G.A. § 44-3-232(d), as the General Assembly reproduces it (see the fixture header). */
const ga = fixture('ga-ocga-44-3-232-2026.txt')
const gaCopy = (heading: string) => {
  const start = ga.indexOf(`=== ${heading}`)
  return ga.slice(ga.indexOf('\n', start) + 1, ga.indexOf('\n', ga.indexOf('\n', start) + 1))
}

describe('Georgia § 44-3-232(d)', () => {
  const d = gaCopy('HB 512 (2025)')

  it('two independent official reproductions agree word for word', () => {
    expect(d.startsWith('(d) Any lot owner, mortgagee of a lot')).toBe(true)
    expect(gaCopy('HB 1222 (2026)')).toBe(d)
  })

  it('five business days from receipt; a written request to the registered office', () => {
    expect(GA_RESPONSE_BUSINESS_DAYS).toBe(5)
    expect(d).toContain('within five business days from the receipt of such request')
    expect(d).toContain('Such request shall be in writing, shall be delivered to the registered office of the association')
    expect(d).toContain('the amount of assessments past due and unpaid together with late charges and interest applicable thereto')
    expect(d).toContain('shall cause the lien for assessments created by this Code section to be extinguished')
    expect(d).toContain('The information specified in such statement shall be binding upon the association and upon every lot owner.')
  })

  it('fee: not more than $10.00, and only if the instrument provides', () => {
    expect(GA_FEE_CAP_CENTS).toBe(1_000)
    expect(d).toContain('Payment of a fee not exceeding $10.00 may be required as a prerequisite to the issuance of such a statement if the instrument so provides.')
  })

  it('the 2026 act (SB 406) revises subsection (c) only', () => {
    expect(ga).toContain('Code Section 44-3-232, relating to assessments against lot owners')
    expect(ga).toMatch(/SECTION 5\..*by revising subsection \(c\) as follows:/)
  })
})
