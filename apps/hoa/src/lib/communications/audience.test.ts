import { describe, it, expect, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  // Reaching the database for a precomputed audience is itself the defect
  // these tests guard against.
  mockFrom: vi.fn(() => {
    throw new Error('precomputed audiences must not query the database')
  }),
}))

import { resolveAudience, stripAudienceForPersist, type ResolvedRecipient } from './audience'

const db = { from: mockFrom } as never

const RECIPIENTS: ResolvedRecipient[] = [
  {
    unitId: 'unit-a',
    unitIds: ['unit-a', 'unit-b'],
    unitAddress: '14 Oak St',
    unitNumber: null,
    recipientName: 'Dana',
    email: 'dana@example.com',
    phone: null,
    userId: 'user-1',
  },
]

describe('resolveAudience — precomputed', () => {
  it('returns the caller list verbatim without touching the database', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
    })

    expect(result.recipients).toEqual(RECIPIENTS)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('uses the caller-supplied summary when given', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
      summary: '1 owner with outstanding dues',
    })

    expect(result.summary).toBe('1 owner with outstanding dues')
  })

  it('falls back to a generic summary when none is supplied', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
    })

    expect(result.summary).toBe('1 recipient')
  })

  it('handles an empty recipient list without error', async () => {
    const result = await resolveAudience(db, 'assoc-1', { kind: 'precomputed' })

    expect(result.recipients).toEqual([])
    expect(result.summary).toBe('0 recipients')
  })
})

describe('stripAudienceForPersist', () => {
  it('persists only kind and summary for a precomputed audience — no recipients key at all', () => {
    const result = stripAudienceForPersist({
      kind: 'precomputed',
      recipients: RECIPIENTS,
      summary: '1 owner with outstanding dues',
    })

    expect(result).toEqual({ kind: 'precomputed', summary: '1 owner with outstanding dues' })
    expect('recipients' in result).toBe(false)
  })

  it('does not leak any recipient field through', () => {
    const result = stripAudienceForPersist({
      kind: 'precomputed',
      recipients: RECIPIENTS,
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('dana@example.com')
    expect(serialized).not.toContain('Dana')
    expect(serialized).not.toContain('unit-a')
  })

  it('passes a non-precomputed kind through unchanged', () => {
    const audience = { kind: 'late_on_dues' as const, unitIds: ['unit-a'] }

    expect(stripAudienceForPersist(audience)).toEqual(audience)
  })
})
