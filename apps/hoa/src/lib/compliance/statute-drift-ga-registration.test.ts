import { describe, expect, it } from 'vitest'
import {
  GA_REGISTRATION_KIT,
  GA_SB406_IN_FORCE,
  GA_SB406_OPT_OUT_BAR,
  GA_SB406_REGISTRATION_BAR,
  blockingFindings,
  checkCollectionsLetter,
  checkFine,
  checkLien,
  resolveOverrides,
  type LetterCheckInput,
} from './statute-drift'

// BL-149: the SB 406 registration bar in the BL-130 state law check. A
// Georgia association not recorded as registered: a warning before
// Jan 1, 2027, a block from that day (attorney advised is the only
// override), on fines, on letters that ask for fines or fees, and on liens.

const BEFORE = '2026-12-31'
const AFTER = '2027-01-01'

describe('fines', () => {
  it('before Jan 1, 2027: a warning, with the bar quoted and a link to the kit', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaRegistration: { status: 'not_registered', today: BEFORE } })
    const f = c.findings.find((x) => x.code === 'ga_unregistered_fine')!
    expect(f.severity).toBe('warn')
    expect(f.citations).toEqual([GA_SB406_REGISTRATION_BAR, GA_SB406_IN_FORCE])
    expect(f.link).toEqual(GA_REGISTRATION_KIT)
    expect(f.message).toContain('From January 1, 2027')
    expect(blockingFindings(c)).toEqual([])
  })

  it('from Jan 1, 2027: a block, overridable only on the attorney’s advice', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaRegistration: { status: 'not_registered', today: AFTER } })
    const f = blockingFindings(c)[0]!
    expect(f.code).toBe('ga_unregistered_fine')
    expect(f.overrideReasons).toEqual(['attorney_advised'])
    expect(f.link?.href).toBe('/compliance/ga-registration')
    expect(resolveOverrides(c, {}).ok).toBe(false)
    expect(resolveOverrides(c, { ga_unregistered_fine: 'notice_sent_outside_app' }).ok).toBe(false)
    expect(resolveOverrides(c, { ga_unregistered_fine: 'attorney_advised' })).toEqual({
      ok: true,
      applied: [{ code: 'ga_unregistered_fine', reason: 'attorney_advised' }],
    })
  })

  it('a registered association gets no registration finding', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaRegistration: { status: 'registered', today: AFTER } })
    expect(c.findings.map((f) => f.code)).toEqual(['ga_fine_instrument'])
  })

  it('lapsed and unverified records block like no registration', () => {
    for (const status of ['lapsed', 'unverified'] as const) {
      const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaRegistration: { status, today: '2028-01-02' } })
      expect(blockingFindings(c).map((f) => f.code)).toEqual(['ga_unregistered_fine'])
    }
  })

  it('an association that opted out is told the opt-out rule', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaRegistration: { status: 'opted_out', today: AFTER } })
    const f = blockingFindings(c)[0]!
    expect(f.citations[0]).toBe(GA_SB406_OPT_OUT_BAR)
    expect(f.message).toContain('opted out')
  })

  it('other states, and a caller that loaded nothing, are unchanged', () => {
    expect(checkFine({ state: 'FL', dailyFineCents: 2500, gaRegistration: { status: 'not_registered', today: AFTER } }).findings.map((f) => f.code)).not.toContain(
      'ga_unregistered_fine',
    )
    expect(checkFine({ state: 'GA', dailyFineCents: 2500 }).findings.map((f) => f.code)).toEqual(['ga_fine_instrument'])
  })
})

describe('collections letters', () => {
  const letter = (over: Partial<LetterCheckInput>): LetterCheckInput => ({
    state: 'GA',
    kind: 'past_due',
    letterDate: AFTER,
    listedChargeTypes: ['regular'],
    values: {},
    events: [],
    printed: [],
    gaRegistration: { status: 'not_registered' },
    ...over,
  })

  it('a letter for dues alone is not barred', () => {
    expect(checkCollectionsLetter(letter({})).findings).toEqual([])
  })

  it('a letter that lists a fine or a late fee is blocked from Jan 1, 2027, warned before', () => {
    for (const type of ['fine', 'late_fee', 'collection_processing']) {
      const after = checkCollectionsLetter(letter({ listedChargeTypes: ['regular', type] }))
      expect(blockingFindings(after).map((f) => f.code)).toEqual(['ga_unregistered_fees'])
      const before = checkCollectionsLetter(letter({ listedChargeTypes: ['regular', type], letterDate: BEFORE }))
      expect(before.findings.map((f) => [f.code, f.severity])).toEqual([['ga_unregistered_fees', 'warn']])
    }
  })

  it('is checked on the letter date, so a letter saved in 2026 is re-checked when printed in 2027', () => {
    const saved = checkCollectionsLetter(letter({ listedChargeTypes: ['fine'], letterDate: BEFORE }))
    const printed = checkCollectionsLetter(letter({ listedChargeTypes: ['fine'], letterDate: AFTER }))
    expect(blockingFindings(saved)).toEqual([])
    expect(blockingFindings(printed)).toHaveLength(1)
  })

  it('registered: no finding', () => {
    expect(checkCollectionsLetter(letter({ listedChargeTypes: ['fine'], gaRegistration: { status: 'registered' } })).findings).toEqual([])
  })
})

describe('liens', () => {
  it('Georgia, not registered: warn before Jan 1, 2027, block from it', () => {
    expect(checkLien({ state: 'GA', gaRegistration: { status: 'not_registered', today: BEFORE } }).findings.map((f) => f.severity)).toEqual(['warn'])
    const c = checkLien({ state: 'GA', gaRegistration: { status: 'not_registered', today: AFTER } })
    expect(blockingFindings(c).map((f) => f.code)).toEqual(['ga_unregistered_lien'])
    expect(c.findings[0]!.message).toContain('filing or recording a lien')
  })

  it('registered, or another state: nothing', () => {
    expect(checkLien({ state: 'GA', gaRegistration: { status: 'registered', today: AFTER } }).findings).toEqual([])
    expect(checkLien({ state: 'Georgia', gaRegistration: { status: 'registered', today: AFTER } }).state).toBe('GA')
    expect(checkLien({ state: 'FL', gaRegistration: { status: 'not_registered', today: AFTER } }).findings).toEqual([])
  })
})
