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

describe('resolveAudience — specific_residents is org-scoped (security review 2026-10-20)', () => {
  function scopedDb() {
    const filters: Array<{ table: string; col: string; v: unknown }> = []
    const from = (table: string) => {
      const q: Record<string, unknown> = {}
      const rows = () => {
        if (table === 'associations') return { data: { organization_id: 'org-1' }, error: null }
        if (table === 'property_residents') {
          const all = [
            { id: 'r-mine', property_id: 'p-1', organization_id: 'org-1', full_name: 'Mine', email: 'm@example.com', phone: null, role: 'owner' },
            { id: 'r-theirs', property_id: 'p-2', organization_id: 'org-2', full_name: 'Theirs', email: 't@example.com', phone: null, role: 'owner' },
          ]
          const org = filters.find((f) => f.table === table && f.col === 'organization_id')?.v
          return { data: org ? all.filter((r) => r.organization_id === org) : all, error: null }
        }
        return { data: [], error: null }
      }
      for (const m of ['select', 'in', 'is', 'order', 'limit']) q[m] = () => q
      q.eq = (col: string, v: unknown) => {
        filters.push({ table, col, v })
        return q
      }
      q.maybeSingle = async () => rows()
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve(rows()).then(ok)
      return q
    }
    return { from } as never
  }

  it("drops another org's resident ids even through a service-role client", async () => {
    const result = await resolveAudience(scopedDb(), 'assoc-1', {
      kind: 'specific_residents',
      residentIds: ['r-mine', 'r-theirs'],
    })
    expect(result.recipients.map((r) => r.recipientName)).toEqual(['Mine'])
  })
})
