import { describe, expect, it } from 'vitest'
import {
  effectiveFailedAttempts,
  failedAttemptPatch,
  recordedFailedAttempts,
  recurringEventCronColumns,
} from './events-alert-attempts'

const ev = (over: Record<string, unknown> = {}) => ({ event_date: '2026-11-01', ...over })

describe('BL-063 alert attempts, flag off (pre-M1)', () => {
  it('selects no M1 column and writes none', () => {
    expect(recurringEventCronColumns(false)).not.toContain('alert_failed')
    expect(failedAttemptPatch(ev({ alert_failed_attempts: 2, alert_failed_for: '2026-11-01' }), false)).toEqual({})
  })
  it('ignores a counter on the row: the communications count alone decides', () => {
    const e = ev({ alert_failed_attempts: 5, alert_failed_for: '2026-11-01' })
    expect(recordedFailedAttempts(e, false)).toBe(0)
    expect(effectiveFailedAttempts(e, 1, false)).toBe(1)
  })
})

describe('BL-063 alert attempts, flag on (M1 applied)', () => {
  it('selects the pair', () => {
    expect(recurringEventCronColumns(true)).toContain('alert_failed_attempts, alert_failed_for')
  })
  it('counts only for the occurrence it was recorded for', () => {
    expect(recordedFailedAttempts(ev({ alert_failed_attempts: 2, alert_failed_for: '2026-11-01' }), true)).toBe(2)
    expect(recordedFailedAttempts(ev({ alert_failed_attempts: 2, alert_failed_for: '2025-11-01' }), true)).toBe(0)
    expect(recordedFailedAttempts(ev({ alert_failed_attempts: null, alert_failed_for: null }), true)).toBe(0)
  })
  it('takes the larger of the two counts, never their sum', () => {
    const e = ev({ alert_failed_attempts: 2, alert_failed_for: '2026-11-01' })
    expect(effectiveFailedAttempts(e, 1, true)).toBe(2)
    expect(effectiveFailedAttempts(e, 3, true)).toBe(3)
  })
  it('a failed day adds one for this occurrence; a moved date starts again at one', () => {
    expect(failedAttemptPatch(ev({ alert_failed_attempts: 2, alert_failed_for: '2026-11-01' }), true)).toEqual({
      alert_failed_attempts: 3,
      alert_failed_for: '2026-11-01',
    })
    expect(failedAttemptPatch(ev({ alert_failed_attempts: 2, alert_failed_for: '2025-11-01' }), true)).toEqual({
      alert_failed_attempts: 1,
      alert_failed_for: '2026-11-01',
    })
  })
})
