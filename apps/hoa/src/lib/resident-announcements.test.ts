import { describe, it, expect } from 'vitest'
import { countNewAnnouncements } from './resident-announcements'

/**
 * The portal badge read "15 new" while the list showed 3. It counted every
 * communication the org had sent in 30 days — other owners' mail included —
 * because it never reached through communication_recipients the way the
 * list does. These cases pin the counting rule the badge now shares with
 * the list.
 */
const row = (id: string, sentAt: string | null) => ({ communication_id: id, sent_at: sentAt })

describe('countNewAnnouncements', () => {
  it('counts each communication once however many channels reached the reader', () => {
    // One announcement delivered by email AND portal is one announcement.
    const rows = [row('a', '2026-08-30T00:00:00Z'), row('a', '2026-08-30T00:00:00Z')]
    expect(countNewAnnouncements(rows, null)).toBe(1)
  })

  it('counts everything received when the reader has never opened the page', () => {
    const rows = [row('a', '2026-08-30T00:00:00Z'), row('b', '2026-08-29T00:00:00Z')]
    expect(countNewAnnouncements(rows, null)).toBe(2)
  })

  it('counts only what arrived after the last visit', () => {
    const rows = [
      row('old', '2026-08-01T00:00:00Z'),
      row('new', '2026-08-30T00:00:00Z'),
    ]
    expect(countNewAnnouncements(rows, '2026-08-15T00:00:00Z')).toBe(1)
  })

  it('goes to zero once everything has been read', () => {
    const rows = [row('a', '2026-08-01T00:00:00Z'), row('b', '2026-08-02T00:00:00Z')]
    expect(countNewAnnouncements(rows, '2026-08-30T00:00:00Z')).toBe(0)
  })

  // Reading the page stamps "now"; an announcement sent in that same
  // instant must not be stranded as permanently unread.
  it('treats an announcement sent exactly at the last-viewed instant as read', () => {
    const at = '2026-08-30T12:00:00Z'
    expect(countNewAnnouncements([row('a', at)], at)).toBe(0)
  })

  // A recipient row with no sent_at was never delivered, so it is not
  // something the resident can have missed.
  it('ignores rows that were never sent', () => {
    expect(countNewAnnouncements([row('a', null)], null)).toBe(0)
  })

  it('counts a communication as new if ANY of its rows arrived after the visit', () => {
    // Same message, two channels, one row re-sent later.
    const rows = [row('a', '2026-08-01T00:00:00Z'), row('a', '2026-08-30T00:00:00Z')]
    expect(countNewAnnouncements(rows, '2026-08-15T00:00:00Z')).toBe(1)
  })

  it('returns zero for a reader with no recipient rows at all', () => {
    expect(countNewAnnouncements([], null)).toBe(0)
  })
})
