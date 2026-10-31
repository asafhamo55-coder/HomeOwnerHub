import { beforeEach, describe, expect, it, vi } from 'vitest'

// The overdue-completion view: approved requests with proposed_completion
// before the association's today. Read-only; the query is what is pinned.

const calls: Array<[string, ...unknown[]]> = []
let result: { data: unknown; error: unknown; count: number | null } = { data: [], error: null, count: 0 }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => { throw e } }))
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: vi.fn(async () => ({ org: { id: 'org-1' } })) }))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: vi.fn() }))
vi.mock('@/lib/review-reminders', () => ({ closeReviewsWithoutDecision: vi.fn(), recordBoardDecisionOnReview: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: (t: string) => {
      calls.push(['from', t])
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'lt', 'is', 'order', 'range', 'in']) {
        chain[m] = (...a: unknown[]) => {
          calls.push([m, ...a])
          return chain
        }
      }
      chain.then = (r: (v: unknown) => unknown) => r(result)
      return chain
    },
  })),
}))

import { countArcOverdueCompletion, listArcRequestsForBoard } from './board-review'

beforeEach(() => {
  calls.length = 0
  result = { data: [], error: null, count: 0 }
})

describe('overdue completion filter', () => {
  it('lists approved rows with a completion DATE before the cutoff day', async () => {
    result = { data: [], error: null, count: 0 }
    const res = await listArcRequestsForBoard({ status: ['approved'], completionBefore: '2026-10-31' })
    expect(res.ok).toBe(true)
    expect(calls).toContainEqual(['in', 'status', ['approved']])
    expect(calls).toContainEqual(['lt', 'proposed_completion', '2026-10-31'])
  })

  it('adds no completion bound to the ordinary list', async () => {
    await listArcRequestsForBoard({ status: ['approved'] })
    expect(calls.some((c) => c[0] === 'lt')).toBe(false)
  })

  it('counts with the same rule and reports the count', async () => {
    result = { data: null, error: null, count: 3 }
    expect(await countArcOverdueCompletion('2026-10-31')).toBe(3)
    expect(calls).toContainEqual(['eq', 'status', 'approved'])
    expect(calls).toContainEqual(['lt', 'proposed_completion', '2026-10-31'])
  })

  it('says null, not 0, when the count read fails', async () => {
    result = { data: null, error: { code: '42501', message: 'denied' }, count: null }
    expect(await countArcOverdueCompletion('2026-10-31')).toBeNull()
  })
})
