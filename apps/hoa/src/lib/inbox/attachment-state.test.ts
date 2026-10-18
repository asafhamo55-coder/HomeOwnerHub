import { describe, expect, it } from 'vitest'
import {
  attachmentView,
  DISCONNECTED_FETCH_ERROR,
  dueForAttemptFilter,
  isDueForAttempt,
  isRetryableFetchError,
  MAX_FETCH_ATTEMPTS,
  MISSING_SOURCE_FETCH_ERROR,
} from './attachment-state'

const NOW = new Date('2026-10-18T12:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

describe('attachmentView', () => {
  it('stored and first-time pending', () => {
    expect(attachmentView({ fetchStatus: 'stored' })).toEqual({ kind: 'stored' })
    expect(attachmentView({ fetchStatus: 'pending', fetchAttempts: 0 })).toEqual({ kind: 'downloading' })
  })

  it('pending after a failed attempt reads as retrying, attempt n of the budget', () => {
    expect(attachmentView({ fetchStatus: 'pending', fetchAttempts: 1, fetchError: 'Gmail 503' })).toEqual({
      kind: 'retrying',
      attempt: 2,
      of: MAX_FETCH_ATTEMPTS,
    })
  })

  it('a transient failure can be retried', () => {
    expect(attachmentView({ fetchStatus: 'failed', fetchError: 'Gmail 503', fetchAttempts: 4 })).toEqual({
      kind: 'failed',
      canRetry: true,
      reason: 'error',
    })
  })

  it('a disconnected-mailbox failure can be retried (after reconnecting)', () => {
    expect(attachmentView({ fetchStatus: 'failed', fetchError: DISCONNECTED_FETCH_ERROR })).toMatchObject({
      canRetry: true,
      reason: 'disconnected',
    })
  })

  it('over the size cap, no Gmail id, or a vanished message cannot be retried', () => {
    expect(attachmentView({ fetchStatus: 'failed', fetchError: 'Exceeds 26214400 byte limit.' })).toEqual({
      kind: 'failed',
      canRetry: false,
      reason: 'too_large',
    })
    expect(
      attachmentView({ fetchStatus: 'failed', fetchError: 'No Gmail attachment id — cannot fetch.' }),
    ).toMatchObject({ canRetry: false, reason: 'unavailable' })
    expect(isRetryableFetchError(MISSING_SOURCE_FETCH_ERROR)).toBe(false)
    expect(isRetryableFetchError(null)).toBe(true)
  })
})

describe('retry backoff schedule', () => {
  it('first attempt is due at once; later attempts wait 5m, 30m, 2h from arrival', () => {
    expect(isDueForAttempt({ fetch_attempts: 0, created_at: minutesAgo(0) }, NOW)).toBe(true)
    expect(isDueForAttempt({ fetch_attempts: 1, created_at: minutesAgo(4) }, NOW)).toBe(false)
    expect(isDueForAttempt({ fetch_attempts: 1, created_at: minutesAgo(5) }, NOW)).toBe(true)
    expect(isDueForAttempt({ fetch_attempts: 2, created_at: minutesAgo(29) }, NOW)).toBe(false)
    expect(isDueForAttempt({ fetch_attempts: 2, created_at: minutesAgo(30) }, NOW)).toBe(true)
    expect(isDueForAttempt({ fetch_attempts: 3, created_at: minutesAgo(119) }, NOW)).toBe(false)
    expect(isDueForAttempt({ fetch_attempts: 3, created_at: minutesAgo(120) }, NOW)).toBe(true)
  })

  it('is bounded: nothing is due once the budget is spent', () => {
    expect(isDueForAttempt({ fetch_attempts: MAX_FETCH_ATTEMPTS, created_at: minutesAgo(10_000) }, NOW)).toBe(false)
  })

  it('the SQL filter encodes the same schedule', () => {
    expect(dueForAttemptFilter(NOW)).toBe(
      [
        'fetch_attempts.eq.0',
        `and(fetch_attempts.eq.1,created_at.lte."${minutesAgo(5)}")`,
        `and(fetch_attempts.eq.2,created_at.lte."${minutesAgo(30)}")`,
        `and(fetch_attempts.eq.3,created_at.lte."${minutesAgo(120)}")`,
      ].join(','),
    )
  })
})
