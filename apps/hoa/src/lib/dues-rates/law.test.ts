import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_RATE_CITATIONS,
  CA_INCREASE_CAP,
  CA_REGULAR_CAP_PCT,
  CHECK_GOVERNING_DOCS,
  GA_DECLARANT_BUDGET,
  rateChangeRules,
  rateJurisdiction,
} from './law'

/**
 * BL-137: every quote the dues-rate screens show, checked word for word
 * against the statute text kept in the repo (scripts/fixtures/state-law),
 * and the "nothing loaded" claims checked against the same files.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const stripTags = (s: string) =>
  s
    .replace(/<span class="EnSpace"\/>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => norm(fl.find((r) => r.code_citation === cite)?.body ?? '')

const gaText = fixture('ga-ocga-44-3-art6-2026.txt')
function gaSection(n: string): string {
  const start = gaText.indexOf(`=== O.C.G.A. Section ${n} |`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = gaText.indexOf('\n=== ', start + 1)
  return norm(gaText.slice(start, end === -1 ? undefined : end))
}

const ca5605 = norm(stripTags(fixture('ca-pubinfo-2025/lobs/LAW_SECTION_TBL_24486.lob')))
const tx209 = norm(stripTags(fixture('tcss-pr209-2026-excerpt.htm')))

function sectionFor(cite: string): string {
  const fla = /^Fla\. Stat\. § (720\.\d+)/.exec(cite)
  if (fla) return flSection(`Fla. Stat. § ${fla[1]}`)
  const ga = /^O\.C\.G\.A\. § (44-3-[\d.]+?)(\(|$)/.exec(cite)
  if (ga) return gaSection(ga[1]!)
  if (cite.startsWith('Cal. Civ. Code § 5605')) return ca5605
  if (cite.startsWith('Tex. Prop. Code § 209.0058')) return tx209
  throw new Error(`unknown citation ${cite}`)
}

describe('every dues-rate quote is in the statute text in the repo', () => {
  for (const c of ALL_RATE_CITATIONS) {
    it(`${c.cite}: “${c.quote.slice(0, 50)}…”`, () => {
      expect(sectionFor(c.cite)).toContain(norm(c.quote))
    })
  }
})

describe('Georgia (O.C.G.A. § 44-3, Article 6 snapshot)', () => {
  const article = norm(gaText.slice(gaText.indexOf('=== O.C.G.A. Section 44-3-220')))

  it('§ 44-3-232.1(a)(5) is the declarant-control trigger, 30 days after the fiscal year begins', () => {
    expect(gaSection('44-3-232.1')).toContain(`(5) ${GA_DECLARANT_BUDGET.quote}; or`)
    expect(gaSection('44-3-232.1')).toContain('the right to control may pass to the property owners')
  })

  it('sets no notice period, cap or vote for an assessment increase', () => {
    expect(article).not.toMatch(/increase/i)
    expect(article).not.toMatch(/percent greater/i)
    // The only "notice of assessment" is the declarant obligation above.
    expect(article.match(/notice of assessment/g)).toHaveLength(1)
  })

  it('the snapshot carries SB 406’s 2027 text as dated records and is valid until 2027-07-01 (BL-154)', () => {
    expect(gaText).toContain('@valid_until: 2027-07-01')
    // SB 406 § 2 (in force 2027-01-01) sets the order payments are applied in and bars refusing a payment, but
    // no notice period, cap or owner vote for a dues change: the dues-rate rule above is unchanged by it.
    const ch17A = gaText.slice(gaText.indexOf('=== Ga. L. 2026, SB 406, § 2 |'))
    expect(ch17A).toContain('@effective_date: 2027-01-01')
    expect(ch17A).not.toMatch(/notice of (any )?(increase|change) in|percent greater|increase in (the )?(regular )?assessments/i)
  })
})

describe('California § 5605 (pubinfo) and § 5615 (not loaded)', () => {
  it('the cap is 20 percent', () => {
    expect(CA_REGULAR_CAP_PCT).toBe(20)
    expect(CA_INCREASE_CAP.quote).toContain('more than 20 percent greater than the regular assessment')
  })

  it('§ 5615 is in neither CA fixture, so the notice window is not quoted', () => {
    expect(fixture('ca-civ-davis-stirling-2026.txt')).not.toContain('=== Civ. Code § 5615.')
    expect(fixture('ca-pubinfo-2025/LAW_SECTION_TBL.dat')).not.toContain('`5615.`')
    expect(ALL_RATE_CITATIONS.some((c) => c.cite.includes('5615'))).toBe(false)
  })
})

describe('Texas: § 209.0051 is not loaded', () => {
  it('neither TX fixture has it', () => {
    expect(fixture('tx-prop-209-2026.txt')).not.toMatch(/Sec\. 209\.0051\./)
    expect(fixture('tcss-pr209-2026-excerpt.htm')).not.toMatch(/Sec\. 209\.0051\./)
  })
})

describe('rateChangeRules', () => {
  it('maps states', () => {
    expect(rateJurisdiction('ga')).toBe('GA')
    expect(rateJurisdiction('Florida')).toBe('FL')
    expect(rateJurisdiction('NV')).toBe('generic')
    expect(rateJurisdiction(null)).toBe('generic')
  })

  it('GA: no rule for the notice; the three citations, nothing marked as a problem', () => {
    const r = rateChangeRules('GA', 12)
    expect(r.findings.every((f) => f.tone === 'info')).toBe(true)
    expect(r.findings[0]!.text).toContain('no notice period, no cap and no owner vote')
    expect(r.findings.flatMap((f) => f.citations.map((c) => c.cite))).toContain('O.C.G.A. § 44-3-232.1(a)(5)')
  })

  it('CA: over 20% is a warning with § 5605(b) first; 20% exactly is not', () => {
    expect(rateChangeRules('CA', 20.5).findings[0]).toMatchObject({ tone: 'warn' })
    expect(rateChangeRules('CA', 20.5).findings[0]!.citations[0]).toBe(CA_INCREASE_CAP)
    expect(rateChangeRules('CA', 20).findings[0]!.tone).toBe('info')
    expect(rateChangeRules('CA', 5).findings[1]!.text).toContain('§ 5615')
  })

  it('FL: an increase flags the meeting-notice statement', () => {
    expect(rateChangeRules('FL', 3).findings[0]!.tone).toBe('warn')
    expect(rateChangeRules('FL', -3).findings[0]!.tone).toBe('info')
  })

  it('anywhere else: check your governing documents', () => {
    expect(rateChangeRules('NV', 10).findings).toEqual([{ tone: 'info', text: CHECK_GOVERNING_DOCS, citations: [] }])
  })
})
