import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_COMPLIANCE_QUOTES,
  CA_ANNUAL_BUDGET_REPORT,
  FL_DIRECTOR_CERTIFICATE,
  GA_ANNUAL_NOTICE_DAYS,
  GA_MEETING_NOTICE,
  GA_REGISTRATION_BAR,
  GA_REGISTRATION_RENEWAL,
  GA_SB406_EFFECTIVE,
  GA_STATEMENT_DEADLINE,
  type StatuteQuote,
} from './law'

/**
 * BL-145: every statute sentence the compliance surfaces quote is checked
 * word for word against the statute text kept in the repo
 * (scripts/fixtures/state-law), inside the section its citation names.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

/** The block of a "=== heading" fixture that starts with `heading`, up to the next block. */
function block(text: string, heading: string): string {
  const start = text.indexOf(`=== ${heading}`)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n=== ', start + 1)
  return norm(text.slice(start, end === -1 ? undefined : end))
}

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)

/** The statute text the citation points at, from the fixture the quote names. */
function sectionFor(q: StatuteQuote): string {
  const text = fixture(q.fixture)
  let m: RegExpExecArray | null
  if ((m = /^O\.C\.G\.A\. § 43-17A-2/.exec(q.cite))) return block(text, 'SECTION 2. (new O.C.G.A. § 43-17A-2')
  if ((m = /^Ga\. L\. 2026, SB 406 § 9/.exec(q.cite))) return block(text, 'SECTION 9.')
  if ((m = /^O\.C\.G\.A\. § 44-3-232\(d\)/.exec(q.cite))) return block(text, 'HB 1222 (2026) reproduction of § 44-3-232(d)')
  if ((m = /^O\.C\.G\.A\. § (44-3-\d+)/.exec(q.cite))) return block(text, `O.C.G.A. Section ${m[1]} |`)
  if ((m = /^Tex\. Prop\. Code § (209\.\d+)/.exec(q.cite))) return block(text, `Tex. Prop. Code § ${m[1]} |`)
  if ((m = /^Fla\. Stat\. § (720\.\d+)/.exec(q.cite))) {
    return norm(fl.find((r) => r.code_citation === `Fla. Stat. § ${m![1]}`)?.body ?? '')
  }
  if ((m = /^Cal\. Civ\. Code § (\d+)/.exec(q.cite))) return block(text, `Civ. Code § ${m[1]}.  [`)
  throw new Error(`no section rule for ${q.cite}`)
}

describe('every compliance quote is word for word in the statute text in the repo', () => {
  for (const q of ALL_COMPLIANCE_QUOTES) {
    it(`${q.cite}: “${q.quote.slice(0, 48)}…”`, () => {
      expect(() => fixture(q.fixture)).not.toThrow()
      expect(sectionFor(q)).toContain(norm(q.quote))
    })
  }

  it('no quote is listed twice', () => {
    const seen = new Set(ALL_COMPLIANCE_QUOTES.map((q) => q.quote))
    expect(seen.size).toBe(ALL_COMPLIANCE_QUOTES.length)
  })
})

describe('the numbers the page computes with match the words', () => {
  it('GA: notice 21 days before an annual meeting', () => {
    expect(GA_MEETING_NOTICE.quote).toContain(`at least ${GA_ANNUAL_NOTICE_DAYS} days in advance of any annual`)
  })

  it('GA: registration takes effect January 1, 2027 and renews by December 31', () => {
    expect(GA_SB406_EFFECTIVE.quote).toContain('January 1, 2027')
    expect(GA_REGISTRATION_RENEWAL.quote).toContain('shall expire on December 31 of each year')
    expect(GA_REGISTRATION_BAR.quote).toContain('collect fines or fees')
  })

  it('GA: § 44-3-232(d) is the same in both General Assembly reproductions', () => {
    const text = fixture('ga-ocga-44-3-232-2026.txt')
    expect(block(text, 'HB 512 (2025) reproduction of § 44-3-232(d)')).toContain(norm(GA_STATEMENT_DEADLINE.quote))
    expect(GA_STATEMENT_DEADLINE.quote).toContain('within five business days')
  })

  it('FL: 90 days after election; CA: 30 to 90 days before the fiscal year ends', () => {
    expect(FL_DIRECTOR_CERTIFICATE.quote).toContain('Within 90 days after being elected or appointed')
    expect(CA_ANNUAL_BUDGET_REPORT.quote).toContain('30 to 90 days before the end of its fiscal year')
  })
})
