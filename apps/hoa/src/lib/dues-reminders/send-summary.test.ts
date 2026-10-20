import { describe, expect, it } from 'vitest'
import { communicationStatusBadge } from '@/lib/status/community'
import { sendSummary } from './send-summary'

// BL-044: a reminder the outbound safety guard held back for every
// recipient must not read as a failure — on the /dues dialog or on
// /communications.

describe('sendSummary', () => {
  it('a clean send', () => {
    expect(sendSummary({ sentCount: 3, failedCount: 0, heldCount: 0 })).toBe('Sent 3 reminders.')
    expect(sendSummary({ sentCount: 1, failedCount: 0, heldCount: 0 })).toBe('Sent 1 reminder.')
  })

  it('held for every recipient: no "failed" anywhere, held named with its count', () => {
    const line = sendSummary({ sentCount: 0, failedCount: 0, heldCount: 4 })
    expect(line).toBe('Nothing was sent, held by safety guard (4).')
    expect(line).not.toMatch(/fail/i)
  })

  it('real failures and held recipients are reported apart', () => {
    expect(sendSummary({ sentCount: 2, failedCount: 1, heldCount: 3 })).toBe(
      'Sent 2 reminders, 1 failed, held by safety guard (3).',
    )
    expect(sendSummary({ sentCount: 0, failedCount: 2, heldCount: 0 })).toBe('Nothing was sent, 2 failed.')
  })
})

describe('communicationStatusBadge', () => {
  it('a guard-held run reads "Held by safety guard (N)", never Failed or Cancelled', () => {
    const badge = communicationStatusBadge({ status: 'cancelled', sentCount: 0, failedCount: 0, heldCount: 2 })
    expect(badge.labels[badge.status]).toBe('Held by safety guard (2)')
    expect(badge.tones[badge.status]).toBe('warning')
  })

  it('a real failure still reads Failed, even with held rows beside it', () => {
    const badge = communicationStatusBadge({ status: 'failed', sentCount: 0, failedCount: 1, heldCount: 2 })
    expect(badge.labels[badge.status]).toBe('Failed')
    expect(badge.tones[badge.status]).toBe('danger')
  })

  it('a board-cancelled scheduled message still reads Cancelled', () => {
    const badge = communicationStatusBadge({ status: 'cancelled', sentCount: 0, failedCount: 0, heldCount: 0 })
    expect(badge.labels[badge.status]).toBe('Cancelled')
  })

  it('a sent message reads Sent', () => {
    const badge = communicationStatusBadge({ status: 'sent', sentCount: 5, failedCount: 0, heldCount: 0 })
    expect(badge.labels[badge.status]).toBe('Sent')
  })
})
