import { describe, expect, it } from 'vitest'
import { countWaitingOver, toTriageThreads, waitingDays } from './triage-compute'

const NOW = new Date('2026-08-02T12:00:00Z')

describe('waitingDays', () => {
  it('floors a partial day rather than rounding it up', () => {
    // 6 days and 23 hours is still "6 days waiting" to a human.
    expect(waitingDays('2026-07-26T13:00:00Z', NOW)).toBe(6)
  })

  it('returns 0 for a message that arrived moments ago', () => {
    expect(waitingDays('2026-08-02T11:59:00Z', NOW)).toBe(0)
  })

  it('returns 0 rather than a negative for a clock-skewed future timestamp', () => {
    expect(waitingDays('2026-08-03T12:00:00Z', NOW)).toBe(0)
  })

  it('returns 0 when the thread has no last_message_at', () => {
    expect(waitingDays(null, NOW)).toBe(0)
  })
})

describe('toTriageThreads', () => {
  it('attaches waitingDays to each row and preserves input order', () => {
    const result = toTriageThreads(
      [
        { id: 't1', subject: 'Pond', last_message_at: '2026-07-27T12:00:00Z' },
        { id: 't2', subject: 'Parking', last_message_at: '2026-08-01T12:00:00Z' },
      ],
      NOW,
    )
    expect(result).toEqual([
      { id: 't1', subject: 'Pond', lastMessageAt: '2026-07-27T12:00:00Z', waitingDays: 6 },
      { id: 't2', subject: 'Parking', lastMessageAt: '2026-08-01T12:00:00Z', waitingDays: 1 },
    ])
  })

  it('returns an empty array for no rows', () => {
    expect(toTriageThreads([], NOW)).toEqual([])
  })
})

describe('countWaitingOver', () => {
  it('counts only threads strictly older than the threshold', () => {
    const rows = [
      { id: 'a', subject: null, last_message_at: '2026-07-20T12:00:00Z' }, // 13d
      { id: 'b', subject: null, last_message_at: '2026-07-29T12:00:00Z' }, // 4d
      { id: 'c', subject: null, last_message_at: '2026-07-30T12:00:00Z' }, // 3d — boundary
      { id: 'd', subject: null, last_message_at: '2026-08-02T00:00:00Z' }, // 0d
    ]
    // Exactly 3 days is not "over 3 days".
    expect(countWaitingOver(rows, NOW, 3)).toBe(2)
  })

  it('returns 0 for no rows', () => {
    expect(countWaitingOver([], NOW, 3)).toBe(0)
  })
})
