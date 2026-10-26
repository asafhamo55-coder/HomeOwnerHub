import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_GA_CONDO_QUOTES,
  GA_CONDO_ANNUAL_NOTICE_DAYS,
  GA_CONDO_FIXTURE,
  GA_CONDO_FORECLOSURE_FLOOR,
  GA_CONDO_FORECLOSURE_MIN_CENTS,
  GA_CONDO_FORECLOSURE_NOTICE,
  GA_CONDO_INTEREST,
  GA_CONDO_LIABILITY_AGGREGATE_CENTS,
  GA_CONDO_LIABILITY_INSURANCE,
  GA_CONDO_LIABILITY_OCCURRENCE_CENTS,
  GA_CONDO_LIEN_LAPSE,
  GA_CONDO_LIEN_LAPSE_YEARS,
  GA_CONDO_MAX_INTEREST_PERCENT,
  GA_CONDO_MEETING_NOTICE,
  GA_CONDO_NOTICE_DAYS,
  GA_CONDO_OTHER_NOTICE_DAYS,
  GA_CONDO_STATEMENT_BUSINESS_DAYS,
  GA_CONDO_STATEMENT_DEADLINE,
  GA_CONDO_STATEMENT_FEE,
  GA_CONDO_STATEMENT_FEE_CAP_CENTS,
  GA_CONDO_WATER_CERTIFICATE,
  GA_CONDO_WATER_CERTIFICATE_BUSINESS_DAYS,
  isGaCondo,
  type CondoQuote,
} from './law'

/**
 * BL-155: every Condominium Act quote is checked word for word against the
 * fixture, inside the section (and subsection) its citation names.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const text = readFileSync(path.join(root, 'scripts/fixtures/state-law', GA_CONDO_FIXTURE), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The paragraphs of one "=== O.C.G.A. Section 44-3-N |" block (metadata dropped). */
function section(num: string): string[] {
  const start = text.indexOf(`=== O.C.G.A. Section 44-3-${num} |`)
  expect(start, `§ 44-3-${num}`).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n=== ', start + 1)
  return text
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .slice(1)
    .filter((l) => l.trim() && !l.startsWith('@'))
}

/** The text the cite points at: the section, narrowed to its subsection and paragraph when the cite names them. */
function citedText(q: CondoQuote): string {
  const m = /^O\.C\.G\.A\. § 44-3-(\d+)((?:\([0-9a-z.]+\))*)$/.exec(q.cite)
  expect(m, q.cite).not.toBeNull()
  const paras = section(m![1]!)
  const parts = m![2] ? m![2].slice(1, -1).split(')(') : []
  if (parts.length === 0) return norm(paras.join(' '))
  // (a)…(z) subsections start a paragraph "(x) "; numbered paragraphs follow inside them.
  const sub = parts[0]!
  if (/^\d/.test(sub)) {
    // a definitions-style section: "(7) “Condominium” means …"
    return norm(paras.find((p) => p.startsWith(`(${sub}) `)) ?? '')
  }
  const from = paras.findIndex((p) => p.startsWith(`(${sub}) `))
  expect(from, q.cite).toBeGreaterThanOrEqual(0)
  let to = paras.findIndex((p, i) => i > from && /^\([a-z]\) /.test(p) && !p.startsWith(`(${sub}) `))
  if (to === -1) to = paras.length
  const inSub = paras.slice(from, to)
  if (parts.length === 1) return norm(inSub.join(' '))
  const num = parts[1]!
  const p = inSub.findIndex((x) => x.startsWith(`(${num}) `) || x.startsWith(`(${sub}) (${num}) `))
  expect(p, q.cite).toBeGreaterThanOrEqual(0)
  let q2 = inSub.findIndex((x, i) => i > p && /^\(\d+\) /.test(x))
  if (q2 === -1) q2 = inSub.length
  return norm(inSub.slice(p, q2).join(' '))
}

describe('every Condominium Act quote is word for word in the fixture, under its cite', () => {
  for (const q of ALL_GA_CONDO_QUOTES) {
    it(`${q.cite}: “${q.quote.slice(0, 48)}…”`, () => {
      expect(q.fixture).toBe(GA_CONDO_FIXTURE)
      expect(citedText(q)).toContain(norm(q.quote))
    })
  }

  it('a quote under the wrong subsection fails (the check narrows to the cite)', () => {
    const misfiled = { ...GA_CONDO_STATEMENT_FEE, cite: 'O.C.G.A. § 44-3-109(c)' }
    expect(citedText(misfiled)).not.toContain(norm(misfiled.quote))
    const wrongParagraph = { ...GA_CONDO_INTEREST, cite: 'O.C.G.A. § 44-3-109(b)(1)' }
    expect(citedText(wrongParagraph)).not.toContain(norm(wrongParagraph.quote))
  })

  it('no quote is listed twice', () => {
    const seen = new Set(ALL_GA_CONDO_QUOTES.map((q) => `${q.cite}|${q.quote}`))
    expect(seen.size).toBe(ALL_GA_CONDO_QUOTES.length)
  })
})

describe('the numbers the app computes with match the words', () => {
  it('§ 44-3-102: 21 days before an annual meeting, 7 before any other', () => {
    expect(GA_CONDO_ANNUAL_NOTICE_DAYS).toBe(21)
    expect(GA_CONDO_OTHER_NOTICE_DAYS).toBe(7)
    expect(GA_CONDO_MEETING_NOTICE.quote).toContain('at least 21 days in advance of any annual or regularly scheduled meeting')
    expect(GA_CONDO_MEETING_NOTICE.quote).toContain('at least seven days in advance of any other meeting')
  })

  it('§ 44-3-109(d): the statement is due in five BUSINESS days (not 10), fee at most $10.00', () => {
    expect(GA_CONDO_STATEMENT_BUSINESS_DAYS).toBe(5)
    expect(GA_CONDO_STATEMENT_DEADLINE.quote).toContain('within five business days from the receipt of such request')
    expect(section('109').join(' ')).not.toMatch(/\bten (business )?days\b|\b10 (business )?days\b/)
    expect(GA_CONDO_STATEMENT_FEE_CAP_CENTS).toBe(1_000)
    expect(GA_CONDO_STATEMENT_FEE.quote).toContain('a fee not exceeding $10.00')
  })

  it('§ 44-3-109(b)–(c): 10% interest, 30 days’ notice, a $2,000 floor, a four-year lapse', () => {
    expect(GA_CONDO_MAX_INTEREST_PERCENT).toBe(10)
    expect(GA_CONDO_INTEREST.quote).toContain('not in excess of 10 percent per annum')
    expect(GA_CONDO_NOTICE_DAYS).toBe(30)
    expect(GA_CONDO_FORECLOSURE_NOTICE.quote).toMatch(/^Not less than 30 days after notice is sent by certified mail/)
    expect(GA_CONDO_FORECLOSURE_MIN_CENTS).toBe(200_000)
    expect(GA_CONDO_FORECLOSURE_FLOOR.quote).toContain('at least $2,000.00')
    expect(GA_CONDO_LIEN_LAPSE_YEARS).toBe(4)
    expect(GA_CONDO_LIEN_LAPSE.quote).toContain('four years after')
  })

  it('§ 44-3-107: $1 million / $2 million liability; certificates within five business days', () => {
    expect(GA_CONDO_LIABILITY_OCCURRENCE_CENTS).toBe(100_000_000)
    expect(GA_CONDO_LIABILITY_AGGREGATE_CENTS).toBe(200_000_000)
    expect(GA_CONDO_LIABILITY_INSURANCE.quote).toContain('not less than $1 million for a single occurrence and $2 million aggregate')
    expect(GA_CONDO_WATER_CERTIFICATE_BUSINESS_DAYS).toBe(5)
    expect(GA_CONDO_WATER_CERTIFICATE.quote).toContain('within five business days')
  })
})

describe('the fixture', () => {
  it('holds every section of Article 3, §§ 44-3-70 to 44-3-117, in order', () => {
    const nums = [...text.matchAll(/^=== O\.C\.G\.A\. Section 44-3-(\d+) \|/gm)].map((m) => Number(m[1]))
    expect(nums).toEqual(Array.from({ length: 48 }, (_, i) => 70 + i))
  })

  it('carries HB 220 (2024) in § 44-3-76 and § 44-3-106(a)(4)', () => {
    expect(section('76').join(' ')).toContain('ten days’ written notice, the association may pursue injunctive relief')
    expect(section('106').some((p) => p.startsWith('(4) Enforce all lawful provisions of the condominium instruments'))).toBe(true)
  })

  it('records a sha256 for every source it names', () => {
    const header = text.slice(0, text.indexOf('\n=== '))
    expect(header.match(/sha256 [0-9a-f]{64}/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('isGaCondo', () => {
  it('is true only for a Georgia association whose type is condo', () => {
    expect(isGaCondo('GA', 'condo')).toBe(true)
    expect(isGaCondo(' ga ', 'Condo')).toBe(true)
    expect(isGaCondo('Georgia', 'condo')).toBe(true)
    expect(isGaCondo('GA', 'hoa')).toBe(false)
    expect(isGaCondo('GA', 'coop')).toBe(false)
    expect(isGaCondo('GA', null)).toBe(false)
    expect(isGaCondo('FL', 'condo')).toBe(false)
    expect(isGaCondo(null, 'condo')).toBe(false)
  })
})
