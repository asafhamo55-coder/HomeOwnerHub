import { describe, expect, it } from 'vitest'
import {
  SMS_SEGMENTS_PER_TEXT,
  smsAllowanceApplies,
  smsAllowanceLevel,
  smsAllowanceNotice,
  smsAllowanceSegments,
  smsAllowanceStatus,
} from './sms-allowance'

describe('SMS allowance per plan (decision §4)', () => {
  it('Essentials: 2 segments per door, minimum 100', () => {
    expect(smsAllowanceSegments('essentials', 0)).toBe(100)
    expect(smsAllowanceSegments('essentials', 40)).toBe(100)
    expect(smsAllowanceSegments('essentials', 50)).toBe(100)
    expect(smsAllowanceSegments('essentials', 51)).toBe(102)
    expect(smsAllowanceSegments('essentials', 400)).toBe(800)
  })

  it('Complete: 4 segments per door, minimum 200', () => {
    expect(smsAllowanceSegments('complete', 0)).toBe(200)
    expect(smsAllowanceSegments('complete', 50)).toBe(200)
    expect(smsAllowanceSegments('complete', 120)).toBe(480)
  })

  it('applies only to new-plan orgs, and only after PRICING_V2', () => {
    for (const plan of ['essentials', 'complete']) {
      expect(smsAllowanceApplies(plan, false)).toBe(false)
      expect(smsAllowanceApplies(plan, true)).toBe(true)
    }
    for (const plan of ['monthly', 'annual', 'legacy_per_door', 'free', 'pilot', '', null, undefined]) {
      expect(smsAllowanceApplies(plan, true)).toBe(false)
    }
  })

  it('warns from 80%, blocks at 100%', () => {
    expect(smsAllowanceLevel(79, 100)).toBe('ok')
    expect(smsAllowanceLevel(80, 100)).toBe('warning')
    expect(smsAllowanceLevel(99, 100)).toBe('warning')
    expect(smsAllowanceLevel(100, 100)).toBe('blocked')
    expect(smsAllowanceLevel(140, 100)).toBe('blocked')
  })

  it('counts each sent text as two segments', () => {
    expect(SMS_SEGMENTS_PER_TEXT).toBe(2)
    const s = smsAllowanceStatus('essentials', 40, 45) // 90 of 100
    expect(s).toMatchObject({ allowanceSegments: 100, usedSegments: 90, remainingSegments: 10, percentUsed: 90, level: 'warning' })
    expect(smsAllowanceStatus('essentials', 40, 60)).toMatchObject({ usedSegments: 120, remainingSegments: 0, level: 'blocked' })
  })

  it('board copy: nothing below 80%, a warning, then the pause', () => {
    expect(smsAllowanceNotice(smsAllowanceStatus('complete', 50, 10))).toBeNull()
    expect(smsAllowanceNotice(smsAllowanceStatus('complete', 50, 85))!.title).toBe('You’ve used 85% of this month’s texts')
    const blocked = smsAllowanceNotice(smsAllowanceStatus('complete', 50, 100))!
    expect(blocked.title).toBe('Text messages are paused until the 1st')
    expect(blocked.body).toContain('email and the resident portal still go')
  })
})
