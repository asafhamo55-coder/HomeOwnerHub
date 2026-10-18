import { describe, expect, it } from 'vitest'
import { todayIn } from '../association-time'
import {
  EXPIRED_GRACE_DAYS,
  coiMilestone,
  coiNoticeEntityId,
  coiReminderCommunicationId,
  whenPhrase,
} from './milestones'

describe('coiMilestone (BL-083)', () => {
  const today = '2026-10-18'
  it.each([
    ['2026-11-18', null], // 31 days: not yet
    ['2026-11-17', { milestone: 'd30', daysLeft: 30 }],
    ['2026-10-26', { milestone: 'd30', daysLeft: 8 }],
    ['2026-10-25', { milestone: 'd7', daysLeft: 7 }],
    ['2026-10-19', { milestone: 'd7', daysLeft: 1 }],
    ['2026-10-18', { milestone: 'expired', daysLeft: 0 }],
    ['2026-10-11', { milestone: 'expired', daysLeft: -EXPIRED_GRACE_DAYS }],
    ['2026-10-10', null], // lapsed long ago: never mailed on a first run
    ['not a date', null],
  ])('expires %s → %o', (expiresOn, want) => {
    expect(coiMilestone(expiresOn, today)).toEqual(want)
  })

  it('crosses month and leap-year boundaries on calendar days, not UTC instants', () => {
    expect(coiMilestone('2028-03-01', '2028-02-23')).toEqual({ milestone: 'd7', daysLeft: 7 })
    expect(coiMilestone('2027-01-07', '2026-12-31')).toEqual({ milestone: 'd7', daysLeft: 7 })
  })

  it('is the association’s day: one instant is the 7-day mark in New York and still 8 days out in Los Angeles', () => {
    // 2026-10-18 01:30 ET = 2026-10-17 22:30 PT
    const now = new Date('2026-10-18T05:30:00Z')
    const expiresOn = '2026-10-25'
    expect(coiMilestone(expiresOn, todayIn('America/New_York', now))).toEqual({ milestone: 'd7', daysLeft: 7 })
    expect(coiMilestone(expiresOn, todayIn('America/Los_Angeles', now))).toEqual({ milestone: 'd30', daysLeft: 8 })
  })
})

describe('deterministic ids', () => {
  it('one id per (association, vendor, expiry, milestone) — a renewal starts fresh', () => {
    const a = coiReminderCommunicationId('as', 'v', '2026-10-25', 'd7')
    expect(coiReminderCommunicationId('as', 'v', '2026-10-25', 'd7')).toBe(a)
    expect(coiReminderCommunicationId('as', 'v', '2026-10-25T00:00:00Z', 'd7')).toBe(a)
    expect(coiReminderCommunicationId('as', 'v', '2026-10-25', 'd30')).not.toBe(a)
    expect(coiReminderCommunicationId('as', 'v', '2027-10-25', 'd7')).not.toBe(a)
    expect(coiReminderCommunicationId('as2', 'v', '2026-10-25', 'd7')).not.toBe(a)
    expect(coiNoticeEntityId('as', 'v', '2026-10-25', 'd7')).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('whenPhrase', () => {
  it('reads naturally', () => {
    expect(whenPhrase(30)).toBe('in 30 days')
    expect(whenPhrase(1)).toBe('in 1 day')
    expect(whenPhrase(0)).toBe('today')
    expect(whenPhrase(-1)).toBe('1 day ago')
  })
})
