import { describe, expect, it, vi } from 'vitest'
import { countThreadsByStatus, getPropertyContext, getThreadDetail, listThreads, listThreadsForUnit } from './queries'

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
    // Carries the Gmail-filing exclusion, so the property page's
    // correspondence card hides exactly what the inbox hides.
    not: vi.fn(() => chain),
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

  it('hides threads the board filed away in Gmail, exactly as the inbox list does', async () => {
    // Consistency across surfaces: a manager who files a thread in Gmail
    // must not find it gone from the inbox but still listed here, with no
    // way to tell which screen is right.
    const db = dbWithChain({ data: [], error: null })

    await listThreadsForUnit(db as never, 'org-1', 'unit-1')

    expect(db._chain.not).toHaveBeenCalledWith('gmail_state', 'in', '("archived","trashed")')
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
  type Calls = {
    eq: unknown[][]
    or: unknown[][]
    not: unknown[][]
    in: unknown[][]
    is: unknown[][]
    gt: unknown[][]
  }

  function makeChain(result: { data?: unknown; error: unknown; count?: number | null }) {
    const calls: Calls = { eq: [], or: [], not: [], in: [], is: [], gt: [] }
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
      // `.not` and `.in` carry the Gmail-filing predicate. A double that
      // omitted them would not merely fail — it would make every filter
      // look correct while the predicate that hides filed mail went
      // unasserted, which is the exact defect this feature exists to fix.
      not: vi.fn((...args: unknown[]) => {
        calls.not.push(args)
        return chain
      }),
      in: vi.fn((...args: unknown[]) => {
        calls.in.push(args)
        return chain
      }),
      // `.is` / `.gt` carry the BL-134 snooze predicates (M3_APPLIED).
      is: vi.fn((...args: unknown[]) => {
        calls.is.push(args)
        return chain
      }),
      gt: vi.fn((...args: unknown[]) => {
        calls.gt.push(args)
        return chain
      }),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return { chain, calls }
  }

  /** The exact PostgREST predicate that hides mail filed away in Gmail. */
  const HIDDEN = ['gmail_state', 'in', '("archived","trashed")']

  /**
   * BL-134 snooze scopes, passed explicitly so these tests pin both sides
   * of M3_APPLIED regardless of the flag's current value. ON is the live
   * default since 0067 was applied; OFF is the pre-M3 shape the code still
   * supports.
   */
  const NOW = '2026-10-20T12:00:00.000Z'
  const ON = { live: true, nowIso: NOW }
  const OFF = { live: false, nowIso: NOW }
  /** The NULL-safe "not snoozed into the future" predicate every queue carries when live. */
  const AWAKE_OR = [`snoozed_until.is.null,snoozed_until.lte.${NOW}`]
  const NEEDS_REVIEW_OR = ['last_direction.is.null,last_direction.neq.outbound']

  /** One fresh chain per `.from()` call, in call order — matches the
   * `filters.map(...)` order inside `countThreadsByStatus`:
   * needs_review, awaiting_resident, open, waiting, closed, then (only
   * when the snooze scope is live) snoozed. The old archived_in_gmail
   * count was removed with the "Filed in Gmail" chip. */
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
      const { db } = dbForCounts([39, 33, 3, 2, 1, 4])

      const result = await countThreadsByStatus(db, 'org-1', undefined, ON)

      // `snoozed` is counted but NOT summed into `all`: a snoozed thread
      // is in no queue until it wakes.
      expect(result).toEqual({
        needs_review: 39,
        awaiting_resident: 33,
        open: 3,
        waiting: 2,
        closed: 1,
        snoozed: 4,
        all: 78,
      })
      // No archived_in_gmail key at all now. Every one of the five buckets
      // already excludes filed mail, so `all` counts exactly what the
      // board can act on — which is the whole point of removing the chip.
      expect(result.all).toBe(78)
      // The measured Madison Park split: 72 needs_review threads before
      // the split, 33 outbound-last + 39 not — `all` must reflect the
      // true total, not double-count the shared needs_review status.
      expect(result.needs_review + result.awaiting_resident).toBe(72)
    })

    it('flag off (pre-M3): exactly the old five-bucket shape, no snoozed key', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])

      const result = await countThreadsByStatus(db, 'org-1', undefined, OFF)

      expect(result).toEqual({
        needs_review: 39,
        awaiting_resident: 33,
        open: 3,
        waiting: 2,
        closed: 1,
        all: 78,
      })
      expect(perCallCalls).toHaveLength(5)
      for (const call of perCallCalls) {
        expect(call.or.some(([p]) => String(p).includes('snoozed_until'))).toBe(false)
        expect(call.gt).toHaveLength(0)
      }
    })

    it('the default scope is live now that M3 is applied: six queries, every queue excludes snoozed', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 4])

      const result = await countThreadsByStatus(db, 'org-1')

      expect(perCallCalls).toHaveLength(6)
      expect(result).toHaveProperty('snoozed', 4)
      for (const call of perCallCalls.slice(0, 5)) {
        expect(call.or.some(([p]) => String(p).startsWith('snoozed_until.is.null,snoozed_until.lte.'))).toBe(true)
      }
      expect(perCallCalls[5].gt.map(([col]) => col)).toEqual(['snoozed_until'])
    })

    it('the snoozed count selects snoozed_until > now, keeps the visibility predicate, and adds no status filter', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 4])
      await countThreadsByStatus(db, 'org-1', undefined, ON)

      const snoozed = perCallCalls[5]
      expect(snoozed.gt).toEqual([['snoozed_until', NOW]])
      expect(snoozed.not).toContainEqual(HIDDEN)
      expect(snoozed.eq.some(([col]) => col === 'status')).toBe(false)
      expect(snoozed.or).toHaveLength(0)
    })

    it('needs_review filters status=needs_review AND an OR that excludes outbound but ADMITS null', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(db, 'org-1', undefined, ON)

      const needsReview = perCallCalls[0]
      expect(needsReview.eq).toContainEqual(['organization_id', 'org-1'])
      expect(needsReview.eq).toContainEqual(['status', 'needs_review'])
      // Written as an OR admitting NULL rather than `.neq('last_direction',
      // 'outbound')` alone: in SQL, `NULL <> 'outbound'` is NULL (not
      // true), so a bare neq would silently drop every thread with no
      // recorded direction out of needs_review. This string form is what
      // keeps them in.
      expect(needsReview.or).toContainEqual(NEEDS_REVIEW_OR)
      // ...and the snooze predicate, as its own OR (PostgREST ANDs them).
      expect(needsReview.or).toEqual([AWAKE_OR, NEEDS_REVIEW_OR])
    })

    it('awaiting_resident filters status=needs_review AND last_direction=outbound, with no last_direction OR', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(db, 'org-1', undefined, ON)

      const awaitingResident = perCallCalls[1]
      expect(awaitingResident.eq).toContainEqual(['status', 'needs_review'])
      expect(awaitingResident.eq).toContainEqual(['last_direction', 'outbound'])
      // Only the snooze predicate; flag off, none at all.
      expect(awaitingResident.or).toEqual([AWAKE_OR])
    })

    it('flag off: awaiting_resident and open/waiting/closed carry no OR at all', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1])
      await countThreadsByStatus(db, 'org-1', undefined, OFF)

      const [needsReview, ...rest] = perCallCalls
      expect(needsReview.or).toEqual([NEEDS_REVIEW_OR])
      for (const c of rest) expect(c.or).toHaveLength(0)
    })

    it('open/waiting/closed are untouched — plain status equality, no last_direction predicate', async () => {
      const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(db, 'org-1', undefined, ON)

      const [, , open, waiting, closed] = perCallCalls
      expect(open.eq).toContainEqual(['status', 'open'])
      expect(waiting.eq).toContainEqual(['status', 'waiting'])
      expect(closed.eq).toContainEqual(['status', 'closed'])
      for (const c of [open, waiting, closed]) {
        expect(c.eq.some(([col]) => col === 'last_direction')).toBe(false)
        expect(c.or).toEqual([AWAKE_OR])
      }
    })
  })

  describe('listThreads', () => {
    it('needs_review applies status=needs_review AND the same null-admitting OR as the count', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'needs_review', 50, 0, undefined, ON)

      expect(calls.eq).toContainEqual(['status', 'needs_review'])
      expect(calls.or).toEqual([AWAKE_OR, NEEDS_REVIEW_OR])
    })

    it('awaiting_resident applies status=needs_review AND last_direction=outbound', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'awaiting_resident', 50, 0, undefined, ON)

      expect(calls.eq).toContainEqual(['status', 'needs_review'])
      expect(calls.eq).toContainEqual(['last_direction', 'outbound'])
      expect(calls.or).toEqual([AWAKE_OR])
    })

    it('open is unchanged — plain status equality', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'open', 50, 0, undefined, ON)

      expect(calls.eq).toContainEqual(['status', 'open'])
      expect(calls.or).toEqual([AWAKE_OR])
    })

    it('all applies no status/last_direction predicate at all — only the snooze one', async () => {
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'all', 50, 0, undefined, ON)

      expect(calls.eq.some(([col]) => col === 'status')).toBe(false)
      expect(calls.or).toEqual([AWAKE_OR])
    })

    it('flag off: open/awaiting_resident/all carry no OR at all', async () => {
      for (const filter of ['open', 'awaiting_resident', 'all'] as const) {
        const { db, calls } = dbForList({ data: [], error: null })
        await listThreads(db, 'org-1', filter, 50, 0, undefined, OFF)
        expect(calls.or, filter).toHaveLength(0)
      }
    })

    it('snoozed lists snoozed_until > now when live, and matches nothing when off', async () => {
      const on = dbForList({ data: [], error: null })
      await listThreads(on.db, 'org-1', 'snoozed', 50, 0, undefined, ON)
      expect(on.calls.gt).toEqual([['snoozed_until', NOW]])
      expect(on.calls.or).toHaveLength(0)

      const off = dbForList({ data: [], error: null })
      await listThreads(off.db, 'org-1', 'snoozed', 50, 0, undefined, OFF)
      expect(off.calls.gt).toHaveLength(0)
      expect(off.calls.is).toContainEqual(['id', null])
    })
  })

  /**
   * Mirroring the board's own Gmail filing.
   *
   * Before this, the mailbox integration was append-only — sync captured a
   * message once and nothing ever reconciled it — so mail the board
   * archived, filed into a folder, or trashed in Gmail stayed in the
   * HomeownerHub inbox forever. These assert the read side of the fix.
   */
  describe('Gmail filing visibility', () => {
    it('excludes filed and trashed threads from every status filter', async () => {
      for (const filter of ['needs_review', 'awaiting_resident', 'open', 'waiting', 'closed'] as const) {
        const { db, calls } = dbForList({ data: [], error: null })
        await listThreads(db, 'org-1', filter)

        expect(calls.not).toContainEqual(HIDDEN)
      }
    })

    it('excludes filed and trashed threads from the "all" view too', async () => {
      // "All" means all of the board's OPEN WORK, not all rows. A version
      // that skipped the predicate here would leave the headline chip
      // showing exactly the mail the board just cleaned up.
      const { db, calls } = dbForList({ data: [], error: null })
      await listThreads(db, 'org-1', 'all')

      expect(calls.not).toContainEqual(HIDDEN)
    })

    it('no filter reaches threads filed or trashed in Gmail', async () => {
      // The "Filed in Gmail" chip was removed: its count was noise in a
      // work queue. Every remaining filter must therefore EXCLUDE the
      // hidden states — there is no longer a view that selects them, and
      // reintroducing one by accident would put filed mail back in the
      // queue.
      for (const filter of ['needs_review', 'awaiting_resident', 'open', 'waiting', 'closed', 'all'] as const) {
        const { db, calls } = dbForList({ data: [], error: null })
        await listThreads(db, 'org-1', filter)
        expect(calls.not, filter).toContainEqual(HIDDEN)
        expect(calls.in.some(([col]) => col === 'gmail_state'), filter).toBe(false)
      }
    })

    it('the count and the list agree on the visibility predicate', async () => {
      // The count/list divergence this file already guards for the
      // last_direction split, now for the filing predicate: a version that
      // filtered the list but not the count would render "Showing 1–12 of
      // 74" over twelve rows.
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(countDb, 'org-1', undefined, ON)

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'needs_review', 50, 0, undefined, ON)

      expect(perCallCalls[0].not).toContainEqual(HIDDEN)
      expect(listArgs.not).toEqual(perCallCalls[0].not)
    })

    it('counts the five status filters plus snoozed, with no filed-in-Gmail query', async () => {
      // The old sixth query counted what the board had filed away; it is
      // gone. With M3 live the sixth is the Snoozed chip instead, and it
      // too excludes filed mail. Flag off: exactly five.
      for (const [scope, expected] of [
        [ON, 6],
        [OFF, 5],
      ] as const) {
        const { db, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 4])
        await countThreadsByStatus(db, 'org-1', undefined, scope)

        expect(perCallCalls).toHaveLength(expected)
        for (const call of perCallCalls) {
          expect(call.not).toContainEqual(HIDDEN)
          expect(call.in.some(([col]) => col === 'gmail_state')).toBe(false)
        }
      }
    })

    it('still surfaces gmail_state on each row, which the row badge reads', async () => {
      const { db } = dbForList({
        data: [
          {
            id: 't1',
            subject: 'Pool gate',
            unit_id: null,
            match_confidence: 'none',
            status: 'needs_review',
            last_message_at: '2026-07-02T00:00:00Z',
            gmail_state: 'trashed',
          },
        ],
        error: null,
      })

      const rows = await listThreads(db, 'org-1', 'all')

      expect(rows[0].gmailState).toBe('trashed')
    })

    it('reports a thread with no stored gmail_state as unknown, never as filed', async () => {
      // The fail-open default. 'unknown' means "never observed", and every
      // read path treats it as visible — hiding mail whose Gmail state has
      // never been checked would invent a cleanup the board never did.
      const { db } = dbForList({
        data: [
          {
            id: 't1',
            subject: 'Pool gate',
            unit_id: null,
            match_confidence: 'none',
            status: 'needs_review',
            last_message_at: '2026-07-02T00:00:00Z',
            gmail_state: null,
          },
        ],
        error: null,
      })

      const rows = await listThreads(db, 'org-1', 'needs_review')

      expect(rows[0].gmailState).toBe('unknown')
    })
  })

  describe('count/list predicate parity', () => {
    it('needs_review: the count and the list apply an identical predicate', async () => {
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(countDb, 'org-1', undefined, ON)
      const countArgs = perCallCalls[0]

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'needs_review', 50, 0, undefined, ON)

      expect(listArgs.eq.filter(([col]) => col === 'status')).toEqual(
        countArgs.eq.filter(([col]) => col === 'status'),
      )
      expect(listArgs.or).toEqual(countArgs.or)
    })

    it('awaiting_resident: the count and the list apply an identical predicate', async () => {
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 26])
      await countThreadsByStatus(countDb, 'org-1', undefined, ON)
      const countArgs = perCallCalls[1]

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'awaiting_resident', 50, 0, undefined, ON)

      expect(listArgs.eq.filter(([col]) => col === 'status' || col === 'last_direction')).toEqual(
        countArgs.eq.filter(([col]) => col === 'status' || col === 'last_direction'),
      )
      expect(listArgs.or).toEqual(countArgs.or)
    })

    it('snoozed: the chip count and the Snoozed list apply an identical predicate', async () => {
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 4])
      await countThreadsByStatus(countDb, 'org-1', undefined, ON)

      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'snoozed', 50, 0, undefined, ON)

      expect(listArgs.gt).toEqual(perCallCalls[5].gt)
      expect(listArgs.not).toEqual(perCallCalls[5].not)
      expect(listArgs.or).toEqual(perCallCalls[5].or)
    })

    it('one shared scope is what makes them agree: two default scopes taken at different instants do not', async () => {
      // Why the inbox pages build ONE defaultSnoozeScope() per request and
      // pass it to both reads: with the flag live, the snooze cutoff is
      // part of the predicate, so separately-defaulted reads compare
      // against different instants and can disagree about a thread whose
      // snooze expires in between.
      const { db: countDb, perCallCalls } = dbForCounts([39, 33, 3, 2, 1, 4])
      await countThreadsByStatus(countDb, 'org-1', undefined, ON)
      const later = { live: true, nowIso: '2026-10-20T12:00:01.000Z' }
      const { db: listDb, calls: listArgs } = dbForList({ data: [], error: null })
      await listThreads(listDb, 'org-1', 'needs_review', 50, 0, undefined, later)

      expect(listArgs.or).not.toEqual(perCallCalls[0].or)
    })
  })
})

describe('getPropertyContext — property page link (BL-060)', () => {
  // `inbox_threads.unit_id` is a units.id, but /properties/[id] is keyed by
  // the hoa_properties id (units.legacy_hoa_property_id). The rail used to
  // link the unit id, which 404s; the context now carries the right id.
  function anyDb(unit: Record<string, unknown> | null) {
    const builder = (table: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'in', 'not', 'neq', 'order', 'limit']) b[op] = () => b
      b.maybeSingle = async () => ({ data: table === 'units' ? unit : null, error: null })
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })
      return b
    }
    return { from: vi.fn(builder) }
  }

  it('returns the legacy hoa_properties id as propertyId, not the unit id', async () => {
    const db = anyDb({
      id: 'unit-1',
      address_line1: '9 Elm St',
      unit_number: null,
      legacy_hoa_property_id: 'hp-1',
      association: null,
    })
    const ctx = await getPropertyContext(db as never, 'org-1', 'unit-1')
    expect(ctx?.propertyId).toBe('hp-1')
  })

  it('returns a null propertyId for a unit with no property record, so the rail does not link a 404', async () => {
    const db = anyDb({
      id: 'unit-1',
      address_line1: '9 Elm St',
      unit_number: null,
      legacy_hoa_property_id: null,
      association: null,
    })
    const ctx = await getPropertyContext(db as never, 'org-1', 'unit-1')
    expect(ctx?.propertyId).toBeNull()
  })
})
