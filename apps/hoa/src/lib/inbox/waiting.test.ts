import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INBOX_SLA_HOURS,
  isAwaitingReply,
  readInboxSlaHours,
  waitingCutoffIso,
  waitingInfo,
} from './waiting'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const waitingThread = (h: number) => ({ status: 'needs_review', lastDirection: 'inbound', lastMessageAt: hoursAgo(h) })

describe('waitingInfo — BL-101 A6 waiting badge', () => {
  it('labels in hours under a day and in days after', () => {
    expect(waitingInfo(waitingThread(0.2), NOW)?.label).toBe('Waiting <1h')
    expect(waitingInfo(waitingThread(5.5), NOW)?.label).toBe('Waiting 5h')
    expect(waitingInfo(waitingThread(50), NOW)?.label).toBe('Waiting 2d')
  })

  it('turns amber at 48h and red at 5 days by default', () => {
    expect(waitingInfo(waitingThread(47), NOW)?.tone).toBe('normal')
    expect(waitingInfo(waitingThread(48), NOW)?.tone).toBe('warn')
    expect(waitingInfo(waitingThread(119), NOW)?.tone).toBe('warn')
    expect(waitingInfo(waitingThread(120), NOW)?.tone).toBe('overdue')
  })

  it('shows nothing when the board spoke last, the thread is closed, or the direction is unknown', () => {
    expect(waitingInfo({ ...waitingThread(80), lastDirection: 'outbound' }, NOW)).toBeNull()
    expect(waitingInfo({ ...waitingThread(80), status: 'closed' }, NOW)).toBeNull()
    expect(waitingInfo({ ...waitingThread(80), lastDirection: null }, NOW)).toBeNull()
    expect(waitingInfo({ ...waitingThread(80), lastMessageAt: null }, NOW)).toBeNull()
    expect(waitingInfo({ ...waitingThread(80), lastMessageAt: 'not a date' }, NOW)).toBeNull()
  })

  it('counts open and waiting threads too — only closed stops the clock', () => {
    expect(isAwaitingReply({ ...waitingThread(1), status: 'open' })).toBe(true)
    expect(isAwaitingReply({ ...waitingThread(1), status: 'waiting' })).toBe(true)
  })

  it('applies org thresholds', () => {
    const sla = { warn: 24, overdue: 72 }
    expect(waitingInfo(waitingThread(30), NOW, sla)?.tone).toBe('warn')
    expect(waitingInfo(waitingThread(72), NOW, sla)?.tone).toBe('overdue')
  })
})

describe('readInboxSlaHours', () => {
  it('defaults when missing or malformed', () => {
    expect(readInboxSlaHours(null)).toEqual(DEFAULT_INBOX_SLA_HOURS)
    expect(readInboxSlaHours({})).toEqual(DEFAULT_INBOX_SLA_HOURS)
    expect(readInboxSlaHours({ inbox_sla_hours: 'soon' })).toEqual(DEFAULT_INBOX_SLA_HOURS)
    expect(readInboxSlaHours({ inbox_sla_hours: { warn: -1, overdue: 'x' } })).toEqual(DEFAULT_INBOX_SLA_HOURS)
  })

  it('reads valid values', () => {
    expect(readInboxSlaHours({ inbox_sla_hours: { warn: 24, overdue: 72 } })).toEqual({ warn: 24, overdue: 72 })
  })

  it('never lets overdue come before warn', () => {
    const sla = readInboxSlaHours({ inbox_sla_hours: { warn: 200, overdue: 100 } })
    expect(sla.warn).toBe(200)
    expect(sla.overdue).toBeGreaterThan(sla.warn)
  })
})

describe('waitingCutoffIso', () => {
  it('is exactly N hours before now', () => {
    expect(waitingCutoffIso(NOW, 48)).toBe('2026-10-17T12:00:00.000Z')
  })
})
