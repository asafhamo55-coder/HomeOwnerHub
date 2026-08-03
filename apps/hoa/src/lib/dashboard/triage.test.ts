import { describe, expect, it } from 'vitest'
import { getTriageSnapshot } from './triage'

const NOW = new Date('2026-08-02T12:00:00Z')

interface Recorded {
  table: string
  filters: string[]
}

interface FakeResult {
  data?: unknown
  count?: number
  error?: { message: string; code: string } | null
}

/**
 * Minimal chainable stand-in for the PostgREST builder. Records the
 * filters each query applied so the tests can assert the status/direction
 * predicates — those definitions are the load-bearing part of this module,
 * and a silently wrong `status` filter would put parked threads back in
 * front of a board member.
 */
function fakeDb(results: FakeResult[]) {
  const recorded: Recorded[] = []
  let call = 0

  function builder(table: string) {
    const filters: string[] = []
    recorded.push({ table, filters })

    const result = results[call] ?? { data: [], count: 0, error: null }
    call += 1

    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push(`eq:${col}=${String(val)}`)
        return chain
      },
      is: (col: string, val: unknown) => {
        filters.push(`is:${col}=${String(val)}`)
        return chain
      },
      not: (col: string, op: string, val: unknown) => {
        filters.push(`not:${col}.${op}=${String(val)}`)
        return chain
      },
      in: (col: string, vals: readonly unknown[]) => {
        filters.push(`in:${col}=${vals.join(',')}`)
        return chain
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        filters.push(`order:${col}:${opts?.ascending ? 'asc' : 'desc'}`)
        return chain
      },
      limit: (n: number) => {
        filters.push(`limit:${n}`)
        return chain
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: result.data ?? [],
          count: result.count ?? 0,
          error: result.error ?? null,
        }).then(resolve),
    }
    return chain
  }

  return {
    db: { from: (table: string) => builder(table) } as never,
    recorded,
  }
}

describe('getTriageSnapshot', () => {
  it('excludes waiting and closed threads from both counts', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    await getTriageSnapshot(db, 'org-1', NOW)

    for (const query of recorded) {
      expect(query.table).toBe('inbox_threads')
      expect(query.filters).toContain('in:status=needs_review,open')
      expect(query.filters).toContain('eq:organization_id=org-1')
    }
  })

  it('counts only property-matched inbound threads as needing a reply', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.count).toBe(32)
    expect(recorded[0].filters).toContain('not:unit_id.is=null')
    expect(recorded[0].filters).toContain('eq:last_direction=inbound')
  })

  it('counts only unmatched threads as untriaged', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.untriaged.count).toBe(365)
    expect(recorded[1].filters).toContain('is:unit_id=null')
  })

  it('orders the thread rows oldest-waiting first and caps them at five', async () => {
    const { db, recorded } = fakeDb([{ count: 2 }, { count: 0 }, { data: [] }])

    await getTriageSnapshot(db, 'org-1', NOW)

    expect(recorded[2].filters).toContain('order:last_message_at:asc')
    expect(recorded[2].filters).toContain('limit:5')
  })

  it('derives oldestWaitingDays from the first returned row', async () => {
    const { db } = fakeDb([
      { count: 2 },
      { count: 0 },
      {
        data: [
          { id: 't1', subject: 'Pond', last_message_at: '2026-07-27T12:00:00Z' },
          { id: 't2', subject: 'Parking', last_message_at: '2026-08-01T12:00:00Z' },
        ],
      },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.oldestWaitingDays).toBe(6)
    expect(snapshot.threads).toHaveLength(2)
    expect(snapshot.threads[0].waitingDays).toBe(6)
    expect(snapshot.failed).toBe(false)
  })

  it('reports oldestWaitingDays as null when nothing is waiting', async () => {
    const { db } = fakeDb([{ count: 0 }, { count: 0 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.oldestWaitingDays).toBeNull()
  })

  it('reports failed rather than zero when a count query errors', async () => {
    // A zero here would read as "nothing to do" and the queue would be
    // skipped — the failure this whole module is shaped to avoid.
    const { db } = fakeDb([
      { count: 0, error: { message: 'connection reset', code: '08006' } },
      { count: 0 },
      { data: [] },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.failed).toBe(true)
  })

  it('reports failed when the thread-row query errors', async () => {
    const { db } = fakeDb([
      { count: 32 },
      { count: 365 },
      { data: [], error: { message: 'connection reset', code: '08006' } },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.failed).toBe(true)
  })
})
