import { describe, expect, it, vi } from 'vitest'
import { countThreadsByStatus, getThreadDetail, listThreads, listThreadsForUnit } from './queries'

/**
 * Minimal chainable `.from().select().eq().eq().order().limit()` stand-in,
 * matching the shape `dbWithChain` uses in `draft/retrieve.test.ts`. The
 * query only awaits the result of `.limit(...)`, so the chain only needs
 * to be thenable-compatible there — `await nonPromise` resolves
 * immediately to the value, so a plain return works without wrapping in a
 * real Promise.
 */
function dbWithChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => result),
  }
  return { from: vi.fn(() => chain), _chain: chain }
}

describe('listThreadsForUnit', () => {
  it('scopes the read by BOTH organization_id and unit_id — dropping either would leak across orgs or units', async () => {
    const db = dbWithChain({ data: [], error: null })

    await listThreadsForUnit(db as never, 'org-1', 'unit-1')

    expect(db.from).toHaveBeenCalledWith('inbox_threads')
    expect(db._chain.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(db._chain.eq).toHaveBeenCalledWith('unit_id', 'unit-1')
  })

  it('orders by last_message_at descending and caps with the given limit', async () => {
    const db = dbWithChain({ data: [], error: null })

    await listThreadsForUnit(db as never, 'org-1', 'unit-1', 7)

    expect(db._chain.order).toHaveBeenCalledWith('last_message_at', {
      ascending: false,
      nullsFirst: false,
    })
    expect(db._chain.limit).toHaveBeenCalledWith(7)
  })

  it('defaults the limit to the summary cap when none is passed', async () => {
    const db = dbWithChain({ data: [], error: null })

    await listThreadsForUnit(db as never, 'org-1', 'unit-1')

    expect(db._chain.limit).toHaveBeenCalledWith(10)
  })

  it('maps rows to the rendered shape only — no email/body fields selected or returned', async () => {
    const db = dbWithChain({
      data: [
        { id: 't1', subject: 'Re: leak in unit', status: 'open', last_message_at: '2026-01-05T00:00:00Z' },
      ],
      error: null,
    })

    const result = await listThreadsForUnit(db as never, 'org-1', 'unit-1')

    expect(result).toEqual([
      { id: 't1', subject: 'Re: leak in unit', status: 'open', lastMessageAt: '2026-01-05T00:00:00Z' },
    ])
  })

  it('a soft read failure THROWS rather than collapsing to an empty "no correspondence" list', async () => {
    // Supabase soft-fails: a failed read returns { data: null, error }
    // without throwing. If this function swallowed that and returned [],
    // the property page would render "No correspondence yet" — a
    // confident, false claim that this household has never written in,
    // rather than "we don't know because the read failed."
    const failure = { code: '08006', message: 'connection reset' }
    const db = dbWithChain({ data: null, error: failure })

    await expect(listThreadsForUnit(db as never, 'org-1', 'unit-1')).rejects.toThrow(
      /failed to load correspondence/,
    )
  })

  it('does not resolve to an empty array on failure (guards against a future ?? [] regression)', async () => {
    const db = dbWithChain({ data: null, error: { code: '08006', message: 'connection reset' } })

    // Explicitly assert this rejects, not merely that SOME error string
    // matches — a regression to `return data ?? []` on the error branch
    // would still satisfy a looser assertion.
    await expect(listThreadsForUnit(db as never, 'org-1', 'unit-1')).rejects.toBeInstanceOf(Error)
  })
})

/**
 * `vendor_id` is selected and surfaced as `vendorId`.
 *
 * This replaces a fallback that briefly tolerated the column being absent:
 * the select shipped to production before migration 0037 was applied, and
 * because this function throws on any query error, every inbox thread page
 * 500'd until the column existed. The fallback is gone now that 0037 is
 * applied; what remains worth guarding is that the column is actually read
 * and mapped, so a future edit dropping it from the select fails here
 * rather than silently showing every thread as unfiled.
 */
describe('getThreadDetail — vendor filing', () => {
  function dbWithThread(vendorId: string | null) {
    const selects: string[] = []
    const from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn((columns: string) => {
          selects.push(columns)
          chain._result =
            table === 'inbox_threads'
              ? {
                  data: {
                    id: 'thread-1',
                    subject: 'Retention pond',
                    status: 'open',
                    unit_id: 'unit-1',
                    vendor_id: vendorId,
                    match_confidence: 'high',
                    match_reason: null,
                    match_source: 'auto',
                  },
                  error: null,
                }
              : { data: [], error: null }
          return chain
        }),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => chain._result),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(chain._result).then(resolve),
      }
      return chain
    })
    return { db: { from } as never, selects }
  }

  it('surfaces the filed vendor as vendorId', async () => {
    const { db, selects } = dbWithThread('vendor-1')

    const thread = await getThreadDetail(db, 'org-1', 'thread-1')

    expect(thread?.vendorId).toBe('vendor-1')
    expect(selects.some((c) => c.includes('vendor_id'))).toBe(true)
  })

  it('reports an unfiled thread as null rather than undefined', async () => {
    const { db } = dbWithThread(null)

    const thread = await getThreadDetail(db, 'org-1', 'thread-1')

    expect(thread?.vendorId).toBeNull()
  })
})

/**
 * The `needs_review` / `awaiting_resident` split. Madison Park measured
 * 72 `needs_review` threads, 33 of which are `last_direction = 'outbound'`
 * — the HOA already replied — so those 33 belong in `awaiting_resident`
 * instead, leaving 39 genuinely unanswered in `needs_review`.
 *
 * These tests assert on the QUERY ARGUMENTS passed to `.eq()`/`.or()`, not
 * just the returned counts/rows. A version that dropped the
 * `last_direction` predicate from the count while keeping it in the list
 * would still return plausible-looking numbers here — see the "count and
 * list predicates match" tests below, which are the ones that actually
 * catch that class of bug (confirmed via mutation: removing the predicate
 * from `countThreadsByStatus` only fails those two).
 */
describe('needs_review / awaiting_resident split', () => {
  type Calls = { eq: unknown[][]; or: unknown[][] }

  function makeChain(result: { data?: unknown; error: unknown; count?: number | null }) {
    const calls: Calls = { eq: [], or: [] }
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        calls.eq.push(args)
        return chain
      }),
      or: vi.fn((...args: unknown[]) => {
        calls.or.push(args)
        return chain
      }),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return { chain, calls }
  }

  /** One fresh chain per `.from()` call, in call order — matches the
   * `filters.map(...)` order inside `countThreadsByStatus`:
   * needs_review, awaiting_resident, open, waiting, closed. */
  function dbForCounts(counts: number[]) {
    const perCallCalls: Calls[] = []
    let i = 0
    const from = vi.fn(() => {
      const { chain, calls } = makeChain({ count: counts[i] ?? 0, error: null })
      perCallCalls.push(calls)
      i += 1
      return chain
    })
    return { db: { from } as never, perCallCalls }
  }

  function dbForList(result: { data: unknown; error: unknown }) {
    const { chain, calls } = makeChain(result)
    const db = { from: vi.fn(() => chain) }
    return { db: db as never, calls }
  }

  describe('countThreadsByStatus', () => {
    it('counts needs_review, awaiting_resident, open, waiting, closed and sums them into all', async () => {
      const { db } = dbForCounts([39, 33, 3, 2, 1])

      const result = await countThreadsByStatus(db, 'org-1')

      expect(result).toEqual({
        needs_review: 39,
        awaiting_resident: 33,
        open: 3,
        waiting: 2,
        closed: 1,
        all: 78,
      })
      // The measured Madison Park split: 72 needs_review threads before
      // the split, 33 outbound-last + 39 not — `all` must reflect the
      // true total, not double-count the shared needs_review status.
      expect(result.needs_review + result.awaiting_resident).toBe(72)
    })

    it('needs_review filters status=needs_review AND an OR that excludes outbound but ADMITS null', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(db, 'org-1')

      const needsReview = perCallCalls[0]
      expect(needsReview.eq).toContainEqual(['organization_id', 'org-1'])
      expect(needsReview.eq).toContainEqual(['status', 'needs_review'])
      // Written as an OR admitting NULL rather than `.neq('last_direction',
      // 'outbound')` alone: in SQL, `NULL <> 'outbound'` is NULL (not
      // true), so a bare neq would silently drop every thread with no
      // recorded direction out of needs_review. This string form is what
      // keeps them in.
      expect(needsReview.or).toContainEqual([
        'last_direction.is.null,last_direction.neq.outbound',
      ])
    })

    it('awaiting_resident filters status=needs_review AND last_direction=outbound, with no OR', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(db, 'org-1')

      const awaitingResident = perCallCalls[1]
      expect(awaitingResident.eq).toContainEqual(['status', 'needs_review'])
      expect(awaitingResident.eq).toContainEqual(['last_direction', 'outbound'])
      expect(awaitingResident.or).toHaveLength(0)
    })

    it('open/waiting/closed are untouched — plain status equality, no last_direction predicate', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(db, 'org-1')

      const [, , open, waiting, closed] = perCallCalls
      expect(open.eq).toContainEqual(['status', 'open'])
      expect(waiting.eq).toContainEqual(['status', 'waiting'])
      expect(closed.eq).toContainEqual(['status', 'closed'])
      for (const c of [open, waiting, closed]) {
        expect(c.eq.some(([col]) => col === 'last_direction')).toBe(false)
        expect(c.or).toHaveLength(0)
      }
    })
  })

  describe('listThreads', () => {
    it('needs_review applies status=needs_review AND the same null-admitting OR as the count', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'needs_review')

      expect(calls.eq).toContainEqual(['status', 'needs_review'])
      expect(calls.or).toContainEqual([
        'last_direction.is.null,last_direction.neq.outbound',
      ])
    })

    it('awaiting_resident applies status=needs_review AND last_direction=outbound', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'awaiting_resident')

      expect(calls.eq).toContainEqual(['status', 'needs_review'])
      expect(calls.eq).toContainEqual(['last_direction', 'outbound'])
      expect(calls.or).toHaveLength(0)
    })

    it('open is unchanged — plain status equality', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'open')

      expect(calls.eq).toContainEqual(['status', 'open'])
      expect(calls.or).toHaveLength(0)
    })

    it('all applies no status/last_direction predicate at all', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'all')

      expect(calls.eq.some(([col]) => col === 'status')).toBe(false)
      expect(calls.or).toHaveLength(0)
    })
  })

  describe('count/list predicate parity', () => {
    it('needs_review: the count and the list apply an identical predicate', async () => {
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(countDb, 'org-1')
      const countArgs = perCallCalls[0]

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'needs_review')

      expect(listArgs.eq.filter(([col]) => col === 'status')).toEqual(
        countArgs.eq.filter(([col]) => col === 'status'),
      )
      expect(listArgs.or).toEqual(countArgs.or)
    })

    it('awaiting_resident: the count and the list apply an identical predicate', async () => {
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(countDb, 'org-1')
      const countArgs = perCallCalls[1]

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'awaiting_resident')

      expect(listArgs.eq.filter(([col]) => col === 'status' || col === 'last_direction')).toEqual(
        countArgs.eq.filter(([col]) => col === 'status' || col === 'last_direction'),
      )
      expect(listArgs.or).toEqual(countArgs.or)
    })
  })
})
