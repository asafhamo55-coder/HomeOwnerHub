import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_ADOPTION_CITATIONS,
  CA_BUDGET_REPORT,
  FL_ASSESSMENT_STATEMENT,
  FL_BUDGET_COPY,
  FL_NOTICE_DAYS,
  FL_SPECIAL_ASSESSMENT,
} from './law'
import { CA_WINDOW_DAYS } from '@/lib/budget-notice/law'

/**
 * BL-138: every quote the adoption kit shows, checked word for word
 * against the official statute text kept in the repo
 * (scripts/fixtures/state-law), and every number the deadline math uses,
 * checked against the words in the same text.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')

const norm = (s: string) => s.replace(/\s+/g, ' ')
const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => norm(fl.find((r) => r.code_citation === cite)?.body ?? '')

const caText = fixture('ca-civ-davis-stirling-2026.txt')
const caSection = (n: string) => {
  const start = caText.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = caText.indexOf('\n=== ', start + 1)
  return norm(caText.slice(start, end === -1 ? undefined : end))
}

function sectionFor(cite: string): string {
  const fla = /^Fla\. Stat\. § (720\.\d+)/.exec(cite)
  if (fla) return flSection(`Fla. Stat. § ${fla[1]}`)
  const cal = /^Cal\. Civ\. Code § (\d+)/.exec(cite)
  if (cal) return caSection(cal[1]!)
  throw new Error(`unknown citation ${cite}`)
}

describe('every adoption-kit quote is in the statute text in the repo', () => {
  for (const c of ALL_ADOPTION_CITATIONS) {
    it(`${c.cite}: “${c.quote.slice(0, 50)}…”`, () => {
      expect(sectionFor(c.cite)).toContain(norm(c.quote))
    })
  }
})

describe('Florida § 720.303(2)(c)2', () => {
  const s = flSection('Fla. Stat. § 720.303')

  it('the assessment statement and the special-assessment rule are the two sentences of paragraph 2, in order', () => {
    expect(s).toContain(`2. ${FL_ASSESSMENT_STATEMENT.quote} ${FL_SPECIAL_ASSESSMENT.quote}`)
  })

  it('the day counts match the words: 48 hours, 7 days, 14 days', () => {
    expect(FL_NOTICE_DAYS).toEqual({ posted: 2, mailed: 7, special: 14 })
    expect(s).toContain('at least 48 hours in advance of a meeting')
    expect(s).toContain('at least 7 days before the meeting')
    expect(FL_SPECIAL_ASSESSMENT.quote).toContain('not less than 14 days before the meeting')
    expect(FL_SPECIAL_ASSESSMENT.quote).toContain('posted conspicuously on the property')
  })

  it('§ 720.303(6)(a): a copy of the budget or notice one is available', () => {
    expect(s).toContain(FL_BUDGET_COPY.quote)
  })
})

describe('California § 5300(a)', () => {
  it('30 to 90 days before the end of the fiscal year', () => {
    expect(caSection('5300')).toContain(CA_BUDGET_REPORT.quote)
    expect(CA_BUDGET_REPORT.quote).toContain('30 to 90 days before the end of its fiscal year')
    expect(CA_WINDOW_DAYS).toEqual({ earliest: 90, latest: 30 })
  })

  it('the board-meeting notice section (§ 4920) is not in the fixture, so the kit does not quote it', () => {
    expect(caText.includes('=== Civ. Code § 4920.')).toBe(false)
    expect(ALL_ADOPTION_CITATIONS.some((c) => c.cite.includes('4920'))).toBe(false)
  })
})
