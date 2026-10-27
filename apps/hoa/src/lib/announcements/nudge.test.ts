import { describe, expect, it } from 'vitest'
import { NUDGE_TABLE, NUDGE_WINDOW_DAYS, isNudgeKey, leadDaysOf, nextNudge, nthWeekdayOfMonth, nudgeDigestLine, ruleDate } from './nudge'
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

  it('stays quiet beyond the lead time and after the day', () => {
    expect(nextNudge('2026-10-20')).toBeNull()
    expect(nextNudge('2026-10-21')!.daysAway).toBe(10)
    expect(nextNudge('2026-11-02')).toBeNull()
  })

  it('does not show a dismissed occasion, but shows it again next year', () => {
    expect(nextNudge('2026-10-26', new Set(['halloween-party:2026', 'dst-ends:2026']))).toBeNull()
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
    expect(nextNudge('2026-12-12')!.occasionId).toBe('happy-holidays')
  })

  it('validates nudge keys', () => {
    expect(isNudgeKey('halloween-party:2026')).toBe(true)
    expect(isNudgeKey('yard-sale:2026')).toBe(false)
    expect(isNudgeKey('halloween-party:26')).toBe(false)
    expect(isNudgeKey(42)).toBe(false)
  })
})

describe('national holidays and observances', () => {
  const cases: Array<[string, string, string]> = [
    ['mlk-day', '2026-01-19', '2027-01-18'],
    ['presidents-day', '2026-02-16', '2027-02-15'],
    ['mothers-day', '2026-05-10', '2027-05-09'],
    ['fathers-day', '2026-06-21', '2027-06-20'],
    ['dst-ends', '2026-11-01', '2027-11-07'],
    ['dst-starts', '2026-03-08', '2027-03-14'],
  ]
  for (const [id, d2026, d2027] of cases) {
    it(`computes ${id} for 2026 and 2027`, () => {
      expect(ruleDate(rule(id), 2026)).toBe(d2026)
      expect(ruleDate(rule(id), 2027)).toBe(d2027)
    })
  }

  it('keeps the fixed observances on their dates', () => {
    expect(ruleDate(rule('juneteenth'), 2027)).toBe('2027-06-19')
    expect(ruleDate(rule('veterans-day'), 2026)).toBe('2026-11-11')
    expect(ruleDate(rule('earth-day'), 2027)).toBe('2027-04-22')
    expect(ruleDate(rule('valentines-day'), 2026)).toBe('2026-02-14')
    expect(ruleDate(rule('fire-prevention'), 2026)).toBe('2026-10-09')
    expect(ruleDate(rule('happy-holidays'), 2026)).toBe('2026-12-15')
  })

  it('gives every entry a real lead time and both-language templates', () => {
    for (const e of NUDGE_TABLE) {
      expect(leadDaysOf(e), e.occasionId).toBeGreaterThanOrEqual(3)
      expect(leadDaysOf(e), e.occasionId).toBeLessThanOrEqual(14)
      const o = getOccasion(e.occasionId)!
      expect(o.en.lead.length, e.occasionId).toBeGreaterThan(10)
      expect(o.es.lead.length, e.occasionId).toBeGreaterThan(10)
    }
    expect(new Set(NUDGE_TABLE.map((e) => e.occasionId)).size).toBe(NUDGE_TABLE.length)
    expect(leadDaysOf({ occasionId: 'x', name: 'x', rule: { kind: 'fixed', month: 1, day: 1 } })).toBe(NUDGE_WINDOW_DAYS)
  })

  it('greetings appear 3 to 5 days ahead, not before', () => {
    expect(nextNudge('2027-01-13')!.occasionId).toBe('mlk-day')
    expect(nextNudge('2027-01-12')).toBeNull()
    expect(nextNudge('2026-02-11')!.occasionId).toBe('valentines-day')
    expect(nextNudge('2026-02-10')).toBeNull()
    expect(nextNudge('2026-11-06')!.occasionId).toBe('veterans-day')
    expect(nextNudge('2026-11-05')).toBeNull()
  })

  it('events that need planning appear 10 to 14 days ahead', () => {
    const skip = new Set(['juneteenth:2026', 'fathers-day:2026'])
    expect(nextNudge('2026-06-20', skip)!.occasionId).toBe('fourth-of-july')
    expect(nextNudge('2026-06-19', skip)).toBeNull()
    expect(nextNudge('2026-11-16')!.occasionId).toBe('thanksgiving')
    expect(nextNudge('2026-11-15')).toBeNull()
    const noTurkey = new Set(['thanksgiving:2026'])
    expect(nextNudge('2026-11-17', noTurkey)!.occasionId).toBe('holiday-lights')
    expect(nextNudge('2026-11-16', noTurkey)).toBeNull()
  })

  it('nudges happy holidays in mid-December and the new year in late December', () => {
    expect(nextNudge('2026-12-08')!.occasionId).toBe('happy-holidays')
    expect(nextNudge('2026-12-07')).toBeNull()
    expect(nextNudge('2026-12-16')).toBeNull()
    expect(nextNudge('2026-12-25')!.occasionId).toBe('new-year')
    expect(nextNudge('2026-12-24')).toBeNull()
  })

  it('daylight saving: the clock-change note shows the week before', () => {
    expect(nextNudge('2027-03-07')!.occasionId).toBe('dst-starts')
    expect(nextNudge('2027-03-07')!.key).toBe('dst-starts:2027')
    expect(nextNudge('2027-11-01')!.occasionId).toBe('dst-ends')
  })

  it('shows the nearest when two overlap and lists the rest, one card only', () => {
    const n = nextNudge('2026-10-28')!
    expect(n.occasionId).toBe('halloween-party')
    expect(n.others.map((o) => o.occasionId)).toEqual(['dst-ends'])
    const june = nextNudge('2026-06-20')!
    expect(june.occasionId).toBe('fathers-day')
    expect(june.others.map((o) => o.occasionId)).toEqual(['fourth-of-july'])
    expect(nextNudge('2026-10-26', new Set(['dst-ends:2026']))!.others).toEqual([])
  })

  it('dismissal stays per occasion and year', () => {
    const d = new Set(['mlk-day:2026'])
    expect(nextNudge('2026-01-16', d)).toBeNull()
    expect(nextNudge('2027-01-14', d)!.key).toBe('mlk-day:2027')
    expect(isNudgeKey('dst-ends:2027')).toBe(true)
  })
})
