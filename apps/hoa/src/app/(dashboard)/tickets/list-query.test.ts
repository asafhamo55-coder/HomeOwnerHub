import { describe, expect, it, vi } from 'vitest'

const calls: Array<[string, ...unknown[]]> = []
function chain(result: unknown): unknown {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => void) => res(result)
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args])
        return p
      }
    },
  })
  return p
}

vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: async () => ({ role: 'board', org: { id: 'org1' } }) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org1' }) }))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: async () => 'America/New_York' }))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_w: string, q: PromiseLike<{ data: unknown; count?: number }>) => ({ ok: true, ...(await q) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    from: (table: string) => {
      calls.push(['from', table])
      const data = table === 'profiles' ? [{ id: 'p1' }] : table === 'units' ? [{ id: 'u1' }] : []
      return chain({ data, count: 0, error: null })
    },
  }),
}))

import { listTicketsForBoard } from '@/lib/tickets'

describe('listTicketsForBoard q + status', () => {
  it('combines the status filter with an OR over subject, resident and unit', async () => {
    calls.length = 0
    const res = await listTicketsForBoard({ page: 1, pageSize: 10, status: 'open', q: '50%,gate' })
    expect(res.ok).toBe(true)
    expect(calls).toContainEqual(['eq', 'status', 'open'])
    const or = calls.find((c) => c[0] === 'or' && String(c[1]).includes('subject.ilike'))
    expect(or?.[1]).toBe('subject.ilike.%50\\% gate%,submitted_by.in.(p1),unit_id.in.(u1)')
  })
  it('adds no OR without q', async () => {
    calls.length = 0
    await listTicketsForBoard({ page: 1, pageSize: 10 })
    expect(calls.some((c) => c[0] === 'or')).toBe(false)
  })
})
