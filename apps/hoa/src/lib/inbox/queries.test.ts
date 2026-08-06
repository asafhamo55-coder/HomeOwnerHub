import { describe, expect, it, vi } from 'vitest'
import { getThreadDetail, listThreadsForUnit } from './queries'

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
