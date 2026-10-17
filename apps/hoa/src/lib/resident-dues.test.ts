import { describe, expect, it } from 'vitest'
import { residentTimeZone, summarizeResidentDues, type ResidentAssessmentRow } from './resident-dues'
import { todayIn } from './association-time'
import { chargeDueText } from './resident-due-text'

// Every instant is absolute UTC and every zone explicit: nothing here
// depends on the machine's TZ.

const row = (id: string, due: string, amount = 310): ResidentAssessmentRow => ({
  id,
  unit_id: 'unit-1',
  amount,
  due_date: due,
  status: 'open',
  assessment_type: 'regular',
  memo_code: null,
})

describe('summarizeResidentDues — past due against the association day (BL-043)', () => {
  it('at 23:30 Eastern a charge due tomorrow is not "due today"', () => {
    const now = new Date('2026-10-02T03:30:00Z') // Oct 1, 23:30 EDT
    const today = todayIn(residentTimeZone([{ association_time_zone: 'America/New_York' }]), now)
    expect(today).toBe('2026-10-01')

    const dues = summarizeResidentDues([row('a1', '2026-10-02')], new Map(), today)
    expect(dues.pastDueCount).toBe(0)
    expect(dues.charges[0].pastDue).toBe(false)
    expect(chargeDueText(dues.charges[0], dues.today)).toBe('Due Oct 2, 2026')
  })

  it('at 23:30 Eastern a charge due today reads "due today", not "1 day late"', () => {
    const today = todayIn('America/New_York', new Date('2026-10-02T03:30:00Z'))
    const dues = summarizeResidentDues([row('a1', '2026-10-01')], new Map(), today)
    expect(dues.charges[0].pastDue).toBe(true)
    expect(chargeDueText(dues.charges[0], dues.today)).toBe('Due Oct 1, 2026 · due today')
  })

  it('on the spring-forward night, 23:30 EDT Mar 8 is still Mar 8', () => {
    const today = todayIn('America/New_York', new Date('2026-03-09T03:30:00Z'))
    expect(today).toBe('2026-03-08')
    const dues = summarizeResidentDues([row('a1', '2026-03-09')], new Map(), today)
    expect(dues.pastDueCount).toBe(0)
  })

  it('nets payments and orders past-due first', () => {
    const dues = summarizeResidentDues(
      [row('a1', '2026-11-01'), row('a2', '2026-09-01'), row('a3', '2026-08-01', 100)],
      new Map([['a3', 100], ['a2', 10]]),
      '2026-10-01',
    )
    expect(dues.charges.map((c) => c.id)).toEqual(['a2', 'a1'])
    expect(dues.balance).toBe(610)
    expect(dues.nextDueDate).toBe('2026-09-01')
    expect(dues.today).toBe('2026-10-01')
  })
})

describe('residentTimeZone', () => {
  it("uses the first unit's association zone, else Eastern", () => {
    expect(residentTimeZone([{ association_time_zone: null }, { association_time_zone: 'America/Denver' }])).toBe(
      'America/Denver',
    )
    expect(residentTimeZone([])).toBe('America/New_York')
  })
})
