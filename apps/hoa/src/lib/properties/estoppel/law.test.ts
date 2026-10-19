import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import { CA_DOCUMENTS_NOT_GENERATED, CA_RESPONSE_DAYS, FL_EXPEDITED_BUSINESS_DAYS, FL_FEE_CAPS_CENTS, FL_RESPONSE_BUSINESS_DAYS, flEffectiveDays } from './law'

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
