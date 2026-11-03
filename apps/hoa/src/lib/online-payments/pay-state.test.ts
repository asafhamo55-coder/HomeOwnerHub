import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  filters: [] as Array<[string, string, unknown]>,
  queried: 0,
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('./create-attempt', () => ({ previewPayNow: vi.fn(() => null) }))
vi.mock('./attempt-store', () => ({ supabaseAttemptStore: () => ({ loadContext: vi.fn(async () => ({})) }) }))
vi.mock('./stripe-port-live', () => ({ getLivePort: () => null }))
vi.mock('./production', () => ({
  adminDb: () => ({
    from() {
      h.queried += 1
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (c: string, v: unknown) => (h.filters.push(['eq', c, v]), q),
        in: (c: string, v: unknown) => (h.filters.push(['in', c, v]), q),
        gte: (c: string, v: unknown) => (h.filters.push(['gte', c, v]), q),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: h.rows, error: null }).then(ok),
      }
      return q
    },
  }),
}))

import { loadPayScreenState } from './pay-state'

beforeEach(() => {
  h.filters = []
  h.queried = 0
  h.rows = [{ id: 'p1', method_type: 'card', total_cents: 1000, status: 'processing', stripe_account_id: 'a', stripe_payment_intent_id: null }]
})

describe('payments on the way are the viewer own', () => {
  it('reads only the signed-in person payments on the unit', async () => {
    await loadPayScreenState('unit-1', null, 'user-1')
    expect(h.filters).toContainEqual(['eq', 'unit_id', 'unit-1'])
    expect(h.filters).toContainEqual(['eq', 'user_id', 'user-1'])
  })

  it('reads only payments started since a buyer took over', async () => {
    await loadPayScreenState('unit-1', '2026-05-01', 'user-1')
    expect(h.filters).toContainEqual(['gte', 'created_at', '2026-05-01'])
  })

  it('shows nothing from the payments table when there is no person to attribute payments to', async () => {
    const res = await loadPayScreenState('unit-1', null, null)
    expect(res.onTheWay).toEqual([])
    expect(h.filters.some(([, c]) => c === 'user_id')).toBe(false)
  })
})
