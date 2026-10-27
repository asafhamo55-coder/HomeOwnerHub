import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GA_CONFLICT_DISCLOSURE_QUOTE, disclosureMode, quoteFor } from './law'

/** BL-165: § 43-17A-7(10) is quoted word for word from the SB 406 fixture. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = readFileSync(path.join(root, 'scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt'), 'utf8')

describe('§ 43-17A-7(10) quote', () => {
  it('is the whole numbered paragraph in the fixture', () => {
    const a = fixture.indexOf('\n43-17A-7.\n')
    const b = fixture.indexOf('\n43-17A-8.\n', a + 1)
    expect(a).toBeGreaterThan(0)
    const lines = fixture.slice(a, b).split('\n')
    expect(lines).toContain(`(10) ${GA_CONFLICT_DISCLOSURE_QUOTE.quote}`)
    expect(GA_CONFLICT_DISCLOSURE_QUOTE.cite).toBe('O.C.G.A. § 43-17A-7(10)')
  })
})

describe('mode by state and day', () => {
  it('Georgia: recommended the day before, required from 2027-01-01', () => {
    expect(disclosureMode('GA', '2026-12-31')).toBe('recommended')
    expect(disclosureMode('GA', '2027-01-01')).toBe('required')
  })
  it('other states and unset: best practice on both sides of the date', () => {
    for (const s of ['FL', 'CA', 'TX', null]) {
      expect(disclosureMode(s, '2026-12-31')).toBe('best_practice')
      expect(disclosureMode(s, '2027-06-01')).toBe('best_practice')
    }
  })
  it('only Georgia quotes the statute', () => {
    expect(quoteFor('best_practice')).toBeNull()
    expect(quoteFor('recommended')).toBe(GA_CONFLICT_DISCLOSURE_QUOTE)
    expect(quoteFor('required')).toBe(GA_CONFLICT_DISCLOSURE_QUOTE)
  })
})
