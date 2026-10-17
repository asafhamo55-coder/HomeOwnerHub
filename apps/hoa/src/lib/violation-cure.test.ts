import { describe, expect, it } from 'vitest'
import { cureBy, cureState, sortByUrgency, type CureSource } from './violation-cure'

const NOW = new Date('2026-10-17T12:00:00Z')
const DAY = 86_400_000
const v = (over: Partial<CureSource> & { id: string }): CureSource & { id: string } => ({
  status: 'notice_sent',
  notice_sent_at: null,
  cure_period_days: 14,
  created_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('cureBy', () => {
  it('is the notice date plus the cure period', () => {
    expect(cureBy(v({ id: 'a', notice_sent_at: '2026-10-01T00:00:00Z' }))?.toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })
  it('is null before a notice is sent, or with no cure period', () => {
    expect(cureBy(v({ id: 'a' }))).toBeNull()
    expect(cureBy(v({ id: 'a', notice_sent_at: '2026-10-01T00:00:00Z', cure_period_days: null }))).toBeNull()
  })
})

describe('cureState', () => {
  it('past when the date has gone and the violation is still open — the same rule the list view counts', () => {
    expect(cureState(v({ id: 'a', notice_sent_at: new Date(NOW.getTime() - 20 * DAY).toISOString() }), NOW)).toBe('past')
  })
  it('pending before the date', () => {
    expect(cureState(v({ id: 'a', notice_sent_at: new Date(NOW.getTime() - 2 * DAY).toISOString() }), NOW)).toBe('pending')
  })
  it('closed violations are never past cure', () => {
    for (const status of ['resolved', 'waived', 'dismissed', 'cured']) {
      expect(cureState(v({ id: 'a', status, notice_sent_at: '2026-01-01T00:00:00Z' }), NOW)).toBe('closed')
    }
  })
  it('none when no notice has gone out', () => {
    expect(cureState(v({ id: 'a', status: 'open' }), NOW)).toBe('none')
  })
})

describe('sortByUrgency', () => {
  it('past cure (longest overdue first), then soonest cure, then no date (newest), then closed (newest)', () => {
    const rows = [
      v({ id: 'closed-old', status: 'resolved', created_at: '2026-01-01T00:00:00Z' }),
      v({ id: 'closed-new', status: 'waived', created_at: '2026-08-01T00:00:00Z' }),
      v({ id: 'open-nodate-old', status: 'open', created_at: '2026-09-01T00:00:00Z' }),
      v({ id: 'open-nodate-new', status: 'open', created_at: '2026-10-10T00:00:00Z' }),
      v({ id: 'pending-late', notice_sent_at: new Date(NOW.getTime() - 1 * DAY).toISOString() }),
      v({ id: 'pending-soon', notice_sent_at: new Date(NOW.getTime() - 10 * DAY).toISOString() }),
      v({ id: 'past-recent', notice_sent_at: new Date(NOW.getTime() - 15 * DAY).toISOString() }),
      v({ id: 'past-long', notice_sent_at: new Date(NOW.getTime() - 40 * DAY).toISOString() }),
    ]
    expect(sortByUrgency(rows, NOW).map((r) => r.id)).toEqual([
      'past-long',
      'past-recent',
      'pending-soon',
      'pending-late',
      'open-nodate-new',
      'open-nodate-old',
      'closed-new',
      'closed-old',
    ])
  })
})
