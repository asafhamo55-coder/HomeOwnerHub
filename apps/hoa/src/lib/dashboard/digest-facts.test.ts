import { describe, expect, it } from 'vitest'
import { buildBullets, formatNextMeeting, isBaselineRow } from './digest-facts'

describe('buildBullets', () => {
  it('omits the "new since yesterday" bullet entirely when there is no baseline', () => {
    // Rendering "0 new since yesterday" on an org's first ever day would
    // be a claim we cannot support — there is nothing to compare against.
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 2, nextMeeting: null })
    expect(bullets.some((b) => b.includes('since yesterday'))).toBe(false)
  })

  it('omits the "new since yesterday" bullet when the count is zero', () => {
    const bullets = buildBullets({ newSinceBaseline: 0, waitingOverThree: 2, nextMeeting: null })
    expect(bullets.some((b) => b.includes('since yesterday'))).toBe(false)
  })

  it('renders the singular form for exactly one new email', () => {
    const bullets = buildBullets({ newSinceBaseline: 1, waitingOverThree: 0, nextMeeting: null })
    expect(bullets).toContain('1 new resident email since yesterday')
  })

  it('renders the plural form for several new emails', () => {
    const bullets = buildBullets({ newSinceBaseline: 3, waitingOverThree: 0, nextMeeting: null })
    expect(bullets).toContain('3 new resident emails since yesterday')
  })

  it('renders the singular form for one long-waiting thread', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 1, nextMeeting: null })
    expect(bullets).toContain('1 has now waited over 3 days')
  })

  it('renders the plural form for several long-waiting threads', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 2, nextMeeting: null })
    expect(bullets).toContain('2 have now waited over 3 days')
  })

  it('omits the waiting bullet when nothing has waited that long', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 0, nextMeeting: null })
    expect(bullets.some((b) => b.includes('waited over'))).toBe(false)
  })

  it('includes the next meeting when there is one', () => {
    const bullets = buildBullets({
      newSinceBaseline: null,
      waitingOverThree: 0,
      nextMeeting: 'Next meeting: Board tomorrow',
    })
    expect(bullets).toContain('Next meeting: Board tomorrow')
  })

  it('returns an empty list when there is genuinely nothing to say', () => {
    expect(buildBullets({ newSinceBaseline: 0, waitingOverThree: 0, nextMeeting: null })).toEqual([])
  })
})

describe('formatNextMeeting', () => {
  it('returns null when there is no meeting', () => {
    expect(formatNextMeeting(null)).toBeNull()
  })

  it('omits a meeting that has already happened', () => {
    // getNextMeeting falls back to the most recent PAST meeting when none
    // is upcoming. "Next meeting: 5 days ago" is nonsense on a today card.
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: -5 })).toBeNull()
  })

  it('says today for a meeting happening today', () => {
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: 0 })).toBe(
      'Next meeting: Board today',
    )
  })

  it('says tomorrow for a meeting one day out', () => {
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: 1 })).toBe(
      'Next meeting: Board tomorrow',
    )
  })

  it('counts days for anything further out', () => {
    expect(formatNextMeeting({ meetingType: 'Annual', daysUntil: 4 })).toBe(
      'Next meeting: Annual in 4 days',
    )
  })

  it('drops the type when the meeting has none', () => {
    expect(formatNextMeeting({ meetingType: null, daysUntil: 4 })).toBe('Next meeting: in 4 days')
  })
})

describe('isBaselineRow', () => {
  it('accepts a snapshot from a previous day', () => {
    expect(isBaselineRow('2026-08-01', '2026-08-02')).toBe(true)
  })

  it('rejects a snapshot captured today, so refreshes cannot move the baseline', () => {
    expect(isBaselineRow('2026-08-02', '2026-08-02')).toBe(false)
  })

  it('works across a month boundary', () => {
    expect(isBaselineRow('2026-07-31', '2026-08-01')).toBe(true)
  })

  it('rejects a future-dated snapshot', () => {
    expect(isBaselineRow('2026-08-03', '2026-08-02')).toBe(false)
  })
})
