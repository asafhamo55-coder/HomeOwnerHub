import { describe, expect, it } from 'vitest'
import { NUDGE_TABLE, isNudgeKey, nextNudge, nthWeekdayOfMonth, nudgeDigestLine, ruleDate } from './nudge'
import { getOccasion } from './occasions'

const rule = (id: string) => NUDGE_TABLE.find((e) => e.occasionId === id)!.rule

describe('nudge date table', () => {
  it('computes Thanksgiving (fourth Thursday of November) for several years', () => {
    const expected: Record<number, string> = {
      2024: '2024-11-28',
      2025: '2025-11-27',
      2026: '2026-11-26',
      2027: '2027-11-25',
      2028: '2028-11-23',
      2029: '2029-11-22',
      2030: '2030-11-28',
      2031: '2031-11-27',
    }
    for (const [year, date] of Object.entries(expected)) {
      expect(ruleDate(rule('thanksgiving'), Number(year))).toBe(date)
    }
  })

  it('computes the last and first Mondays (Memorial Day, Labor Day)', () => {
    expect(ruleDate(rule('pool-opening'), 2026)).toBe('2026-05-25')
    expect(ruleDate(rule('pool-opening'), 2027)).toBe('2027-05-31')
    expect(ruleDate(rule('pool-closing'), 2026)).toBe('2026-09-07')
    expect(ruleDate(rule('pool-closing'), 2027)).toBe('2027-09-06')
    expect(nthWeekdayOfMonth(2026, 2, 1, -1)).toBe(23)
  })

  it('keeps fixed dates fixed', () => {
    expect(ruleDate(rule('halloween-party'), 2026)).toBe('2026-10-31')
    expect(ruleDate(rule('fourth-of-july'), 2031)).toBe('2031-07-04')
  })

  it('only points at real occasions', () => {
    for (const e of NUDGE_TABLE) expect(getOccasion(e.occasionId), e.occasionId).not.toBeNull()
  })
})

describe('nextNudge', () => {
  it('suggests Halloween five days out', () => {
    const n = nextNudge('2026-10-26')!
    expect(n.occasionId).toBe('halloween-party')
    expect(n.key).toBe('halloween-party:2026')
    expect(n.date).toBe('2026-10-31')
    expect(n.daysAway).toBe(5)
    expect(n.headline).toBe('Halloween is Saturday')
    expect(nudgeDigestLine(n)).toBe('Halloween is Saturday: a community notice is ready to send')
  })

  it('says today and tomorrow', () => {
    expect(nextNudge('2026-10-31')!.headline).toBe('Halloween is today')
    expect(nextNudge('2026-10-30')!.headline).toBe('Halloween is tomorrow')
  })

  it('stays quiet more than 7 days out and after the day', () => {
    expect(nextNudge('2026-10-23')).toBeNull()
    expect(nextNudge('2026-10-24')!.daysAway).toBe(7)
    expect(nextNudge('2026-11-01')).toBeNull()
  })

  it('does not show a dismissed occasion, but shows it again next year', () => {
    expect(nextNudge('2026-10-26', new Set(['halloween-party:2026']))).toBeNull()
    expect(nextNudge('2027-10-26', new Set(['halloween-party:2026']))!.key).toBe('halloween-party:2027')
  })

  it('looks across the new year', () => {
    const n = nextNudge('2026-12-28')!
    expect(n.occasionId).toBe('new-year')
    expect(n.key).toBe('new-year:2027')
    expect(n.date).toBe('2027-01-01')
  })

  it('uses the computed Thanksgiving date, and the nearest occasion when two are close', () => {
    expect(nextNudge('2026-11-20')!.occasionId).toBe('thanksgiving')
    expect(nextNudge('2026-11-26')!.headline).toBe('Thanksgiving is today')
    expect(nextNudge('2026-12-20')!.occasionId).toBe('happy-holidays')
  })

  it('validates nudge keys', () => {
    expect(isNudgeKey('halloween-party:2026')).toBe(true)
    expect(isNudgeKey('yard-sale:2026')).toBe(false)
    expect(isNudgeKey('halloween-party:26')).toBe(false)
    expect(isNudgeKey(42)).toBe(false)
  })
})
