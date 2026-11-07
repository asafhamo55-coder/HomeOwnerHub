import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import type { InboxDb } from './load'
import { APPROVAL_SOURCES, buildInbox, type InboxSection, type SourceCounts } from './model'
import { getBoardWaiting, summarizeWaiting } from './waiting'

type Resp = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

/** Same query-builder stand-in as load.test.ts: records every call, resolves canned responses per table. */
function fakeDb(responses: Record<string, Resp[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] }
      calls.push(entry)
      const queue = responses[table] ?? []
      const builder: Record<string, unknown> = {}
      const chain = (name: string) => (...args: unknown[]) => {
        entry.ops.push([name, args])
        return builder
      }
      for (const op of ['select', 'eq', 'in', 'is', 'order', 'range', 'limit', 'not', 'gt']) builder[op] = chain(op)
      builder.then = (resolve: (r: Resp) => unknown, reject: (e: unknown) => unknown) => {
        const next = queue.shift()
        if (!next) return Promise.reject(new Error(`no canned response for ${table}`)).then(resolve, reject)
        return Promise.resolve(next).then(resolve, reject)
      }
      return builder
    },
  }
  return { db: db as unknown as InboxDb, calls }
}

const ORG = '00000000-0000-0000-0000-000000000001'
const err = { code: '42501', message: 'permission denied' }
const ok = (n: number): Resp => ({ data: null, error: null, count: n })
const FLAGS = { m5: true, m6: false, m11: true, now: new Date('2026-11-06T12:00:00Z') }
const quiet = () => ({
  approval_requests: [ok(0), ok(0), ok(0), ok(0)],
  ai_runs: [ok(0), ok(0)],
  tickets: [ok(0)],
  associations: [{ data: [], error: null }] as Resp[],
})

/** What the /approvals page builds for "All" from the same per-source numbers. */
function pageInbox(counts: SourceCounts) {
  const sections = APPROVAL_SOURCES.map((source) =>
    counts[source] === null ? { source, ok: false } : { source, ok: true, items: [], total: counts[source] },
  ) as InboxSection[]
  return buildInbox(sections, 'all')
}

describe('getBoardWaiting', () => {
  it('parity: one amenity booking and one join request pending is 2, the same as the approvals page', async () => {
    const { db } = fakeDb({ ...quiet(), owner_join_requests: [ok(1)], amenity_reservations: [ok(1)] })
    const waiting = await getBoardWaiting(db, ORG, FLAGS)
    expect(waiting).toMatchObject({ total: 2, failed: false })
    expect(waiting.counts).toMatchObject({ amenity: 1, join: 1 })
    expect(pageInbox(waiting.counts).total).toBe(waiting.total)
  })

  it('parity holds for every source: tile total equals the page total whatever is pending', () => {
    const counts = Object.fromEntries(APPROVAL_SOURCES.map((s, i) => [s, i])) as SourceCounts
    expect(summarizeWaiting(counts).total).toBe(pageInbox(counts).total)
  })

  it('empty: every source loaded and every one empty is 0 and not failed (Inbox zero)', async () => {
    const { db } = fakeDb({ ...quiet(), owner_join_requests: [ok(0)], amenity_reservations: [ok(0)] })
    expect(await getBoardWaiting(db, ORG, FLAGS)).toMatchObject({ total: 0, failed: false })
  })

  it('failed: one unreadable source is failed, never zero, and the known sources still count', async () => {
    const { db } = fakeDb({ ...quiet(), owner_join_requests: [{ data: null, error: err }], amenity_reservations: [ok(2)] })
    const waiting = await getBoardWaiting(db, ORG, FLAGS)
    expect(waiting.failed).toBe(true)
    expect(waiting.counts.join).toBeNull()
    expect(waiting.total).toBe(2)
  })

  it('failed: a thrown error is every source unknown, with a total of 0 that the tile reads as failed', async () => {
    const db = {
      from() {
        throw new Error('boom')
      },
    } as unknown as InboxDb
    const waiting = await getBoardWaiting(db, ORG, FLAGS)
    expect(waiting).toMatchObject({ total: 0, failed: true })
    expect(Object.values(waiting.counts).every((v) => v === null)).toBe(true)
  })

  it('org scoping: every count is filtered to the org and is a head-only count', async () => {
    const { db, calls } = fakeDb({ ...quiet(), owner_join_requests: [ok(1)], amenity_reservations: [ok(1)] })
    await getBoardWaiting(db, ORG, FLAGS)
    const scoped = calls.filter((c) => c.table !== 'associations')
    expect(scoped.length).toBeGreaterThanOrEqual(9)
    for (const c of scoped) {
      const orgFilter = c.ops.some(([op, args]) => op === 'eq' && (args[0] === 'organization_id' || args[0] === 'org_id') && args[1] === ORG)
      expect(orgFilter, `${c.table} must filter by org`).toBe(true)
      expect(c.ops.find(([op]) => op === 'select')![1][1]).toMatchObject({ count: 'exact', head: true })
    }
    const assoc = calls.find((c) => c.table === 'associations')!.ops
    expect(assoc).toContainEqual(['eq', ['organization_id', ORG]])
  })
})
