import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_KIT_QUOTES, KIT_QUOTES } from './kit-quotes'
import { GA_SB406_IN_FORCE, GA_SB406_OPT_OUT_BAR, GA_SB406_REGISTRATION_BAR } from '@/lib/compliance/statute-drift'

/**
 * BL-149: every sentence the Georgia registration kit and its state law
 * check quote is word for word in
 * scripts/fixtures/state-law/ga-sb406-2026-registration.txt, inside the
 * section and subsection its citation names.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const FIXTURE = 'ga-sb406-2026-registration.txt'
const text = readFileSync(path.join(root, 'scripts/fixtures/state-law', FIXTURE), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

function block(heading: string): string {
  const start = text.indexOf(`=== ${heading}`)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n=== ', start + 1)
  return norm(text.slice(start, end === -1 ? undefined : end))
}

const section2 = block('SECTION 2. (new O.C.G.A. § 43-17A-2,')
const section9 = block('SECTION 9.')

function sectionFor(cite: string): string {
  if (cite.startsWith('O.C.G.A. § 43-17A-2')) return section2
  if (cite.startsWith('Ga. L. 2026, SB 406 § 9')) return section9
  throw new Error(`no section rule for ${cite}`)
}

const ALL = [...ALL_KIT_QUOTES, GA_SB406_REGISTRATION_BAR, GA_SB406_OPT_OUT_BAR, GA_SB406_IN_FORCE]

describe('every registration quote is word for word in the SB 406 fixture', () => {
  for (const q of ALL) {
    it(`${q.cite}: “${q.quote.slice(0, 48)}…”`, () => {
      expect(q.fixture).toBe(FIXTURE)
      expect(sectionFor(q.cite)).toContain(norm(q.quote))
    })
  }
})

describe('each quote sits in the subsection it cites', () => {
  const opens = (marker: string, quote: string) => expect(section2).toContain(norm(`${marker} ${quote}`))

  it('(a)(2)(A), (a)(2)(B)(ii), (a)(3), (a)(3)(A), (a)(3)(B), (c), (d), (e)', () => {
    opens('(2)(A)', KIT_QUOTES.bar.quote)
    opens('(ii)', KIT_QUOTES.optOut.quote)
    opens('(3)', KIT_QUOTES.filing.quote)
    opens('(A)', KIT_QUOTES.formMinimum.quote)
    opens('(B)', KIT_QUOTES.financials.quote)
    opens('(c)', KIT_QUOTES.renewal.quote)
    opens('(d)', KIT_QUOTES.amendment.quote)
    opens('(e)', KIT_QUOTES.fee.quote)
  })

  it('(b): the filing day is the effective date', () => {
    const b = section2.indexOf('(b) Upon the Secretary of State')
    const c = section2.indexOf('(c) Each registration statement')
    const at = section2.indexOf(KIT_QUOTES.effectiveOnFiling.quote)
    expect(at).toBeGreaterThan(b)
    expect(at).toBeLessThan(c)
  })

  it('§ 9(a): in force January 1, 2027', () => {
    expect(section9).toContain(`(a) ${KIT_QUOTES.inForce.quote}`)
  })

  it('the gate quotes are the same words as the kit’s', () => {
    expect(GA_SB406_REGISTRATION_BAR.quote).toBe(KIT_QUOTES.bar.quote)
    expect(GA_SB406_OPT_OUT_BAR.quote).toBe(KIT_QUOTES.optOut.quote)
    expect(GA_SB406_IN_FORCE.quote).toBe(KIT_QUOTES.inForce.quote)
  })
})

describe('the gap is said, not filled', () => {
  it('the fixture names no registered agent or unit count, so the kit quotes none', () => {
    expect(text.toLowerCase()).not.toContain('registered agent')
    expect(text.toLowerCase()).not.toContain('number of units')
    for (const q of ALL) {
      expect(q.quote.toLowerCase()).not.toContain('agent of record')
      expect(q.quote.toLowerCase()).not.toContain('units')
    }
  })
})
