import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_OWNER_RIGHTS_QUOTES,
  GA_OWNER_RIGHTS,
  GA_OWNER_RIGHTS_FROM,
  GA_OWNER_RIGHTS_INTRO,
  GA_OWNER_RIGHTS_TAKES_EFFECT,
  gaOwnerRightsInForce,
  ownerRightLink,
} from './law'

/**
 * BL-164: every right is quoted word for word from SB 406's § 43-17A-7 in
 * scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt — each one the
 * whole numbered paragraph, in order, all twelve, nothing else.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = readFileSync(path.join(root, 'scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt'), 'utf8')

function section(start: string, end: string): string {
  const a = fixture.indexOf(`\n${start}\n`)
  const b = fixture.indexOf(`\n${end}\n`, a + 1)
  expect(a).toBeGreaterThan(0)
  expect(b).toBeGreaterThan(a)
  return fixture.slice(a + start.length + 2, b)
}

describe('§ 43-17A-7 quotes are verbatim from the fixture', () => {
  const body = section('43-17A-7.', '43-17A-8.')
  const lines = body.split('\n').filter((l) => l.trim() !== '')

  it('the opening words', () => {
    expect(lines[0]).toBe(GA_OWNER_RIGHTS_INTRO.quote)
  })

  it('all twelve rights, each the whole paragraph, in order', () => {
    expect(GA_OWNER_RIGHTS).toHaveLength(12)
    expect(lines).toHaveLength(13)
    GA_OWNER_RIGHTS.forEach((r, i) => {
      expect(r.n).toBe(i + 1)
      expect(r.cite).toBe(`O.C.G.A. § 43-17A-7(${r.n})`)
      expect(lines[i + 1]).toBe(`(${r.n}) ${r.quote}`)
    })
  })

  it('every quote shown is in the checked list, and inside § 43-17A-7', () => {
    for (const q of ALL_OWNER_RIGHTS_QUOTES) expect(body).toContain(q.quote)
    expect(new Set(ALL_OWNER_RIGHTS_QUOTES.map((q) => q.quote)).size).toBe(ALL_OWNER_RIGHTS_QUOTES.length)
  })

  it('the Act takes effect on January 1, 2027 (§ 9(a)), which the date gate uses', () => {
    expect(fixture).toContain('this Act shall become effective on January 1, 2027.')
    expect(GA_OWNER_RIGHTS_FROM).toBe('2027-01-01')
    expect(GA_OWNER_RIGHTS_TAKES_EFFECT).toBe('takes effect Jan 1, 2027')
  })
})

describe('date gate', () => {
  it('in force from 2027-01-01, not the day before', () => {
    expect(gaOwnerRightsInForce('2026-12-31')).toBe(false)
    expect(gaOwnerRightsInForce('2027-01-01')).toBe(true)
    expect(gaOwnerRightsInForce('2027-06-30')).toBe(true)
  })
})

describe('links', () => {
  it('each right links to a resident page', () => {
    for (const r of GA_OWNER_RIGHTS) expect(ownerRightLink(r.place, true).href.startsWith('/resident/')).toBe(true)
  })

  it('records go to the records form, or to the board while records requests are off', () => {
    expect(ownerRightLink('records', true).href).toBe('/resident/records/new')
    expect(ownerRightLink('records', false).href).toBe('/resident/tickets/new')
    expect(ownerRightLink('insurance', true).href).toBe('/resident/insurance')
  })
})
