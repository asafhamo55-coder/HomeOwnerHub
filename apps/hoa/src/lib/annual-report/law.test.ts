import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_ANNUAL_REPORT_QUOTES,
  GA_ANNUAL_REPORT,
  annualReportJurisdiction,
  annualReportLawNote,
  annualReportQuotes,
} from './law'

/**
 * BL-153: every quote the annual report shows, checked word for word
 * against the statute text kept in the repo (scripts/fixtures/state-law).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** One GA section's text, from its "=== O.C.G.A. Section n |" header to the next record. */
function gaSection(text: string, n: string): string {
  const start = text.indexOf(`=== O.C.G.A. Section ${n} |`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n=== ', start + 1)
  return text.slice(start, end === -1 ? undefined : end)
}

/** Subsection "(x)" of a GA section: from its line to the next "(y) " line. */
function gaSubsection(section: string, letter: string): string {
  const lines = section.split('\n')
  const i = lines.findIndex((l) => l.startsWith(`(${letter}) `))
  expect(i).toBeGreaterThanOrEqual(0)
  const out = [lines[i]!]
  for (const l of lines.slice(i + 1)) {
    if (/^\([a-z]\) /.test(l) || l.startsWith('=== ')) break
    out.push(l)
  }
  return norm(out.join(' '))
}

describe('every annual report quote is in the statute text in the repo', () => {
  for (const q of ALL_ANNUAL_REPORT_QUOTES) {
    it(`${q.cite}: “${q.quote.slice(0, 50)}…”`, () => {
      const m = /^O\.C\.G\.A\. § (44-3-[\d.]+)\(([a-z])\)$/.exec(q.cite)
      expect(m).not.toBeNull()
      const sub = gaSubsection(gaSection(fixture(q.fixture), m![1]!), m![2]!)
      expect(sub).toContain(norm(q.quote))
    })
  }

  it('the § 44-3-230(a) quote is the subsection’s closing sentence, uncut', () => {
    const sub = gaSubsection(gaSection(fixture(GA_ANNUAL_REPORT.fixture), '44-3-230'), 'a')
    expect(sub.endsWith(norm(GA_ANNUAL_REPORT.quote))).toBe(true)
  })

  it('the Georgia Condominium Act (§ 44-3-102) is not in the repo, so it is never quoted', () => {
    const ga = fixture('ga-ocga-44-3-art6-2026.txt')
    expect(ga).not.toContain('=== O.C.G.A. Section 44-3-102 |')
    expect(ALL_ANNUAL_REPORT_QUOTES.some((q) => q.cite.includes('44-3-102'))).toBe(false)
  })
})

describe('jurisdiction', () => {
  it('only Georgia gets statute wording', () => {
    expect(annualReportJurisdiction('GA')).toBe('GA')
    expect(annualReportJurisdiction(' ga ')).toBe('GA')
    for (const s of ['FL', 'CA', 'TX', 'NC', null, undefined, '']) {
      const j = annualReportJurisdiction(s)
      expect(j).toBe('other')
      expect(annualReportQuotes(j)).toHaveLength(0)
      expect(annualReportLawNote(j)).not.toMatch(/Georgia|44-3/)
    }
    expect(annualReportQuotes('GA').map((q) => q.cite)).toContain('O.C.G.A. § 44-3-230(a)')
    expect(annualReportLawNote('GA')).toMatch(/Georgia/)
  })
})
