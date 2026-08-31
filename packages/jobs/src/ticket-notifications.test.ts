import { describe, it, expect } from 'vitest'
import {
  buildTicketNotification,
  isDeadSubscription,
  boardRecipients,
} from './ticket-notifications'

/**
 * createResidentTicket used to insert the row and tell nobody. These are
 * the pure decisions in the fan-out that follows it: who hears about a
 * ticket, what the push says, and when a subscription is discarded.
 */
describe('boardRecipients', () => {
  const members = [
    { user_id: 'u1', role: 'board' },
    { user_id: 'u2', role: 'admin' },
    { user_id: 'u3', role: 'resident' },
    { user_id: 'u4', role: 'board' },
  ]

  it('notifies board members and admins, never residents', () => {
    expect(boardRecipients(members, null)).toEqual(['u1', 'u2', 'u4'])
  })

  // The reporter is often a board member who also owns a unit. Telling them
  // about their own ticket is noise.
  it('excludes the person who opened the ticket', () => {
    expect(boardRecipients(members, 'u1')).toEqual(['u2', 'u4'])
  })

  it('deduplicates a user listed twice', () => {
    expect(boardRecipients([...members, { user_id: 'u1', role: 'admin' }], null)).toEqual([
      'u1',
      'u2',
      'u4',
    ])
  })

  it('returns nothing when the org has no board members', () => {
    expect(boardRecipients([{ user_id: 'u3', role: 'resident' }], null)).toEqual([])
  })
})

describe('buildTicketNotification', () => {
  const ticket = {
    id: 'tk-1',
    subject: 'Leaking water heater',
    category: 'maintenance',
    unitLabel: '10079 Trumpet Pk',
  }

  it('leads with the unit, because that is what a board member triages on', () => {
    const n = buildTicketNotification(ticket)
    expect(n.title).toBe('New ticket — 10079 Trumpet Pk')
    expect(n.body).toBe('Leaking water heater')
    expect(n.link).toBe('/tickets/tk-1')
  })

  it('falls back gracefully when the ticket has no unit', () => {
    expect(buildTicketNotification({ ...ticket, unitLabel: null }).title).toBe('New ticket')
  })

  // The tag collapses repeat pushes for one ticket into a single OS
  // notification instead of stacking duplicates on a retry.
  it('tags the notification with the ticket id', () => {
    expect(buildTicketNotification(ticket).tag).toBe('ticket:tk-1')
  })

  it('truncates a long subject rather than letting the OS clip it mid-word', () => {
    const long = 'x'.repeat(300)
    const n = buildTicketNotification({ ...ticket, subject: long })
    expect(n.body.length).toBeLessThanOrEqual(160)
    expect(n.body.endsWith('…')).toBe(true)
  })

  it('never produces an empty body', () => {
    expect(buildTicketNotification({ ...ticket, subject: '' }).body.length).toBeGreaterThan(0)
  })
})

describe('isDeadSubscription', () => {
  // The push service says the endpoint is gone. Keeping it means retrying
  // a dead device forever.
  it.each([404, 410])('treats %i as gone for good', (code) => {
    expect(isDeadSubscription(code)).toBe(true)
  })

  // Transient or our-fault: the subscription itself is still valid.
  it.each([429, 500, 502, 503, 401, 413])('keeps the subscription on %i', (code) => {
    expect(isDeadSubscription(code)).toBe(false)
  })

  it('keeps the subscription when there is no status code at all', () => {
    expect(isDeadSubscription(undefined)).toBe(false)
  })
})
