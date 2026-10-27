import { describe, expect, it } from 'vitest'
import {
  GA_17A5_STAY,
  GA_17A5_STAY_ENDS,
  GA_SB406_2027_IN_FORCE,
  blockingFindings,
  checkCollectionsLetter,
  checkFine,
  resolveOverrides,
  type LetterCheckInput,
} from './statute-drift'

// BL-161: the § 43-17A-5(c) automatic stay in the BL-130 state law check.
// While a resident's Secretary of State complaint runs: a warning before
// Jan 1, 2027, a block from that day (attorney advised is the only
// override), on fines and on letters that list fines or fees for the home.

const BEFORE = '2026-12-31'
const AFTER = '2027-01-01'
const running = { verified: true, complaints: [{ filedOn: '2026-12-01', conclusionsOn: null, extended: false }] }
const ended = { verified: true, complaints: [{ filedOn: '2026-12-01', conclusionsOn: '2026-12-20', extended: false }] }

const codes = (c: ReturnType<typeof checkFine>) => c.findings.map((f) => [f.code, f.severity])

describe('fines', () => {
  it('before Jan 1, 2027: a warning, quoting (c) and § 9(a)', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaComplaintStay: { ...running, today: BEFORE } })
    const f = c.findings.find((x) => x.code === 'ga_complaint_stay')!
    expect(f.severity).toBe('warn')
    expect(f.citations).toEqual([GA_17A5_STAY, GA_17A5_STAY_ENDS, GA_SB406_2027_IN_FORCE])
    expect(f.message).toContain('From January 1, 2027')
    expect(blockingFindings(c)).toEqual([])
  })

  it('from Jan 1, 2027: a block, overridable only on the attorney’s advice', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaComplaintStay: { ...running, today: AFTER } })
    expect(blockingFindings(c).map((f) => [f.code, f.overrideReasons])).toEqual([['ga_complaint_stay', ['attorney_advised']]])
    expect(resolveOverrides(c, {}).ok).toBe(false)
    expect(resolveOverrides(c, { ga_complaint_stay: 'notice_sent_outside_app' }).ok).toBe(false)
    expect(resolveOverrides(c, { ga_complaint_stay: 'attorney_advised' })).toEqual({ ok: true, applied: [{ code: 'ga_complaint_stay', reason: 'attorney_advised' }] })
  })

  it('a stay that ended, or no complaint, adds nothing', () => {
    expect(codes(checkFine({ state: 'GA', dailyFineCents: 2500, gaComplaintStay: { ...ended, today: AFTER } }))).toEqual([['ga_fine_instrument', 'warn']])
    expect(codes(checkFine({ state: 'GA', dailyFineCents: 2500, gaComplaintStay: { verified: true, complaints: [], today: AFTER } }))).toEqual([
      ['ga_fine_instrument', 'warn'],
    ])
  })

  it('an unverified record blocks from Jan 1, 2027 (a stay can’t be ruled out)', () => {
    const c = checkFine({ state: 'GA', dailyFineCents: 2500, gaComplaintStay: { verified: false, complaints: [], today: AFTER } })
    expect(blockingFindings(c)[0]!.message).toContain('can’t be verified')
  })

  it('other states are never checked', () => {
    expect(codes(checkFine({ state: 'TX', dailyFineCents: 2500, gaComplaintStay: { ...running, today: AFTER } })).map(([c]) => c)).not.toContain('ga_complaint_stay')
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
    gaComplaintStay: running,
    ...over,
  })
  const stayOf = (c: ReturnType<typeof checkCollectionsLetter>) => c.findings.filter((f) => f.code === 'ga_complaint_stay').map((f) => f.severity)

  it('a dues-only letter is not barred by the stay', () => {
    expect(stayOf(checkCollectionsLetter(letter({})))).toEqual([])
  })

  it('a letter listing a fine or a fee: blocked from Jan 1, 2027, warned before', () => {
    for (const type of ['fine', 'late_fee', 'collection_legal']) {
      expect(stayOf(checkCollectionsLetter(letter({ listedChargeTypes: ['regular', type] })))).toEqual(['block'])
      expect(stayOf(checkCollectionsLetter(letter({ listedChargeTypes: ['regular', type], letterDate: BEFORE })))).toEqual(['warn'])
    }
  })

  it('is checked on the letter date: after the conclusions the letter passes', () => {
    const c = checkCollectionsLetter(letter({ listedChargeTypes: ['fine'], gaComplaintStay: { verified: true, complaints: [{ filedOn: '2027-01-02', conclusionsOn: '2027-02-01', extended: true }] }, letterDate: '2027-02-16' }))
    expect(stayOf(c)).toEqual(['block'])
    const later = checkCollectionsLetter(letter({ listedChargeTypes: ['fine'], gaComplaintStay: { verified: true, complaints: [{ filedOn: '2027-01-02', conclusionsOn: '2027-02-01', extended: true }] }, letterDate: '2027-02-17' }))
    expect(stayOf(later)).toEqual([])
  })
})
