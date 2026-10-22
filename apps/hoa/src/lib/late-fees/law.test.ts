import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LATE_FEE_LAWS, NO_LOADED_RULE_NOTE, lateFeeLaw, lateFeeStateOf, statutoryCapCents } from './law'

// BL-147: every late-charge rule is quoted word for word from a statute
// fixture. If a fixture is refreshed and the text changes, this fails and
// the cap must be re-read before anyone relies on it.

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../scripts/fixtures/state-law')
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8')

describe('late-charge rules are quoted verbatim from the fixtures', () => {
  for (const law of Object.values(LATE_FEE_LAWS)) {
    it(`${law.state}: every quote is in ${law.fixture}`, () => {
      const text = fixture(law.fixture)
      expect(law.quotes.length).toBeGreaterThan(0)
      for (const q of law.quotes) expect(text).toContain(q)
    })
  }

  it('GA quotes § 44-3-232(b)(1) exactly: only if the instrument provides, the greater of $10.00 or 10 percent', () => {
    const ga = LATE_FEE_LAWS.GA
    const text = fixture('ga-ocga-44-3-art6-2026.txt')
    const section = text.slice(text.indexOf('=== O.C.G.A. Section 44-3-232 |'), text.indexOf('=== O.C.G.A. Section 44-3-232.1 |'))
    expect(section).toContain('(b) To the extent that the instrument provides, the personal obligation of the lot owner and the lien for assessments shall also include:')
    expect(section).toContain(
      '(1) A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;',
    )
    expect(ga.quotes).toEqual([
      '(b) To the extent that the instrument provides, the personal obligation of the lot owner and the lien for assessments shall also include:',
      '(1) A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;',
    ])
    expect(ga).toMatchObject({ requiresInstrument: true, floorCents: 1000, percent: 10, minGraceDays: 0 })
  })

  it('the numbers match the quoted words', () => {
    expect(LATE_FEE_LAWS.FL.quotes[0]).toContain('the greater of $25 or 5 percent')
    expect(LATE_FEE_LAWS.FL).toMatchObject({ requiresInstrument: true, floorCents: 2500, percent: 5 })
    expect(LATE_FEE_LAWS.CA.quotes.join(' ')).toContain('10 percent of the delinquent assessment or ten dollars ($10), whichever is greater')
    expect(LATE_FEE_LAWS.CA.quotes[0]).toContain('delinquent 15 days after they become due')
    expect(LATE_FEE_LAWS.CA).toMatchObject({ floorCents: 1000, percent: 10, minGraceDays: 15 })
  })
})

describe('lateFeeLaw', () => {
  it('knows GA, FL and CA; Texas and every other state have no loaded rule', () => {
    expect(lateFeeLaw('ga')?.state).toBe('GA')
    expect(lateFeeLaw(' FL ')?.state).toBe('FL')
    expect(lateFeeLaw('CA')?.state).toBe('CA')
    expect(lateFeeLaw('TX')).toBeNull()
    expect(lateFeeLaw('NY')).toBeNull()
    expect(lateFeeLaw(null)).toBeNull()
    expect(NO_LOADED_RULE_NOTE).toMatch(/Check your governing documents/)
  })

  it('reads governing_law_state before the mailing state', () => {
    expect(lateFeeStateOf({ state: 'GA', governing_law_state: 'fl' })).toBe('FL')
    expect(lateFeeStateOf({ state: 'GA', governing_law_state: null })).toBe('GA')
    expect(lateFeeStateOf(null)).toBeNull()
  })
})

describe('statutoryCapCents: the greater of the floor or the percent', () => {
  it('GA: $10 below $100 late, 10% above, never rounded up', () => {
    expect(statutoryCapCents(LATE_FEE_LAWS.GA, 5_000)).toBe(1000)
    expect(statutoryCapCents(LATE_FEE_LAWS.GA, 10_000)).toBe(1000)
    expect(statutoryCapCents(LATE_FEE_LAWS.GA, 25_000)).toBe(2500)
    expect(statutoryCapCents(LATE_FEE_LAWS.GA, 12_345)).toBe(1234)
  })

  it('FL: $25 below $500 late, 5% above', () => {
    expect(statutoryCapCents(LATE_FEE_LAWS.FL, 10_000)).toBe(2500)
    expect(statutoryCapCents(LATE_FEE_LAWS.FL, 100_000)).toBe(5000)
  })
})
