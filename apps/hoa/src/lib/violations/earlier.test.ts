import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => { throw e } }))

import { EARLIER_SHOWN, countEarlier, earlierLine, earlierPage, orderEarlier, type EarlierViolation } from './earlier-core'
import { loadEarlierViolations } from './earlier'

const v = (id: string, type: string | null, created_at: string | null, over: Partial<EarlierViolation> = {}): EarlierViolation => ({
  id,
  violation_type: type,
  status: 'resolved',
  created_at,
  fine_amount: null,
  ...over,
})

describe('ordering', () => {
  it('puts the same category first, then the most recent', () => {
    const rows = [
      v('a', 'parking', '2026-09-01T00:00:00Z'),
      v('b', 'landscaping', '2026-01-01T00:00:00Z'),
      v('c', 'landscaping', '2026-05-01T00:00:00Z'),
      v('d', 'noise', '2026-10-01T00:00:00Z'),
    ]
    expect(orderEarlier(rows, 'Landscaping').map((r) => r.id)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('is stable on equal dates and sinks undated rows', () => {
    const rows = [v('z', 'x', '2026-01-01T00:00:00Z'), v('m', 'x', '2026-01-01T00:00:00Z'), v('n', 'x', null)]
    expect(orderEarlier(rows, 'y').map((r) => r.id)).toEqual(['m', 'z', 'n'])
  })

  it('does not mutate its input', () => {
    const rows = [v('a', 'x', '2026-01-01T00:00:00Z'), v('b', 'x', '2026-02-01T00:00:00Z')]
    orderEarlier(rows, 'x')
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('the cap', () => {
  const many = Array.from({ length: 13 }, (_, i) => v(`id${String(i).padStart(2, '0')}`, i % 2 ? 'a' : 'b', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`))

  it('shows ten and says how many are hidden', () => {
    const p = earlierPage(many, 'a')
    expect(EARLIER_SHOWN).toBe(10)
    expect(p.shown).toHaveLength(10)
    expect(p.total).toBe(13)
    expect(p.hidden).toBe(3)
  })

  it('keeps the same-category rows ahead of the cut', () => {
    const p = earlierPage(many, 'a')
    expect(p.shown.slice(0, 6).every((r) => r.violation_type === 'a')).toBe(true)
  })

  it('has nothing hidden under the cap', () => {
    expect(earlierPage(many.slice(0, 4), 'a').hidden).toBe(0)
  })
})

describe('counts and wording', () => {
  const counts = countEarlier([v('1', 'Parking', null), v('2', 'parking ', null), v('3', 'noise', null), v('4', null, null)])

  it('counts per category case-insensitively', () => {
    expect(counts).toEqual({ total: 4, byType: { parking: 2, noise: 1 } })
  })
  it('words the line with and without a category', () => {
    expect(earlierLine(counts)).toBe('This home has 4 earlier violations.')
    expect(earlierLine(counts, 'PARKING')).toBe('This home has 4 earlier violations (2 in this category).')
    expect(earlierLine(counts, 'trash')).toBe('This home has 4 earlier violations (0 in this category).')
    expect(earlierLine({ total: 1, byType: { a: 1 } }, 'a')).toBe('This home has 1 earlier violation (1 in this category).')
    expect(earlierLine({ total: 0, byType: {} })).toBe('No earlier violations at this home.')
  })
})

describe('loader', () => {
  function client(response: { data: unknown; error: unknown }) {
    const calls: Array<[string, ...unknown[]]> = []
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'is', 'order', 'range']) {
      chain[m] = (...a: unknown[]) => {
        calls.push([m, ...a])
        return chain
      }
    }
    let served = false
    chain.then = (r: (x: unknown) => unknown) => {
      const out = served && !response.error ? { data: [], error: null } : response
      served = true
      return r(out)
    }
    return { calls, db: { from: () => chain } }
  }

  it('is scoped to the org and the home, and leaves out the open violation', async () => {
    const { db, calls } = client({ data: [v('a', 'x', null)], error: null })
    const res = await loadEarlierViolations(db, { orgId: 'org-1', propertyId: 'p-1', excludeId: 'self' })
    expect(res.ok).toBe(true)
    expect(calls).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(calls).toContainEqual(['eq', 'property_id', 'p-1'])
    expect(calls).toContainEqual(['neq', 'id', 'self'])
    expect(calls).toContainEqual(['is', 'deleted_at', null])
  })

  it('fails loudly, not as an empty list', async () => {
    const { db } = client({ data: null, error: { code: '42501', message: 'denied' } })
    const res = await loadEarlierViolations(db, { orgId: 'org-1', propertyId: 'p-1' })
    expect(res).toEqual({ ok: false })
  })
})
