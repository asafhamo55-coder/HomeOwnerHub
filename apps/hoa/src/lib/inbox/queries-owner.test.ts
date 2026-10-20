import { describe, expect, it, vi } from 'vitest'
import { countThreadsByStatus, listThreads } from './queries'

/**
 * BL-101 A6 — Mine / Unassigned / All over inbox_threads.assigned_to. The
 * owner predicate goes through the same applyInboxFilter as the status
 * split, so the chip counts and the list can never disagree about it.
 */
function makeDb() {
  const perCall: Array<{ eq: unknown[][]; is: unknown[][]; select: unknown[][] }> = []
  const from = vi.fn(() => {
    const calls = { eq: [] as unknown[][], is: [] as unknown[][], select: [] as unknown[][] }
    perCall.push(calls)
    const chain: Record<string, unknown> = {
      select: vi.fn((...args: unknown[]) => {
        calls.select.push(args)
        return chain
      }),
      eq: vi.fn((...args: unknown[]) => {
        calls.eq.push(args)
        return chain
      }),
      is: vi.fn((...args: unknown[]) => {
        calls.is.push(args)
        return chain
      }),
      or: vi.fn(() => chain),
      not: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
    }
    return chain
  })
  return { db: { from } as never, perCall }
}

describe('owner scope', () => {
  it('Mine filters assigned_to = the signed-in member, in the list and every count', async () => {
    const list = makeDb()
    await listThreads(list.db, 'org-1', 'needs_review', 50, 0, { owner: 'mine', userId: 'user-1' })
    expect(list.perCall[0].eq).toContainEqual(['assigned_to', 'user-1'])

    const counts = makeDb()
    await countThreadsByStatus(counts.db, 'org-1', { owner: 'mine', userId: 'user-1' })
    for (const call of counts.perCall) expect(call.eq).toContainEqual(['assigned_to', 'user-1'])
  })

  it('Unassigned filters assigned_to IS NULL', async () => {
    const list = makeDb()
    await listThreads(list.db, 'org-1', 'all', 50, 0, { owner: 'unassigned', userId: 'user-1' })
    expect(list.perCall[0].is).toContainEqual(['assigned_to', null])
  })

  it('All (or no scope) adds no assignee predicate', async () => {
    for (const scope of [undefined, { owner: 'all' as const, userId: 'user-1' }]) {
      const list = makeDb()
      await listThreads(list.db, 'org-1', 'all', 50, 0, scope)
      expect(list.perCall[0].eq.some(([col]) => col === 'assigned_to')).toBe(false)
      expect(list.perCall[0].is).toHaveLength(0)
    }
  })

  it('Mine with no signed-in user matches nothing rather than everything', async () => {
    const list = makeDb()
    await listThreads(list.db, 'org-1', 'all', 50, 0, { owner: 'mine', userId: null })
    const assigned = list.perCall[0].eq.find(([col]) => col === 'assigned_to')
    expect(assigned).toBeDefined()
    expect(assigned?.[1]).not.toBeNull()
  })

  it('selects last_direction and assigned_to for the waiting badge and assignee line', async () => {
    const list = makeDb()
    await listThreads(list.db, 'org-1', 'all')
    const columns = String(list.perCall[0].select[0][0])
    expect(columns).toContain('last_direction')
    expect(columns).toContain('assigned_to')
  })
})
