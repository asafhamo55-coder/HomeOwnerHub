import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import type { InboxDb } from './load'
import { APPROVAL_SOURCES, buildInbox, type InboxSection, type SourceCounts } from './model'
import { getBoardWaiting, summarizeWaiting } from './waiting'
import { sidebarBadges } from './sidebar-badge'
import { approvalsBadge } from './model'
import * as load from './load'

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

/** A builder that records every chained call (any method) and resolves one fixed response. */
function recordingDb(resp: Resp) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] }
      calls.push(entry)
      const builder: unknown = new Proxy(() => {}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (r: Resp) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resp).then(res, rej)
          return (...args: unknown[]) => {
            entry.ops.push([String(prop), args])
            return builder
          }
        },
      })
      return builder
    },
  }
  return { db: db as unknown as InboxDb, calls }
}

const FILTERS = new Set(['eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'contains', 'ilike'])
const filterSig = (ops: [string, unknown[]][]) =>
  ops
    .filter(([op]) => FILTERS.has(op))
    .map(([op, args]) => `${op}:${JSON.stringify(args)}`)
    .sort()
    .join('|')

describe('the tile counts exactly what each page section loads (recorded query filters)', () => {
  const NOW = new Date('2026-11-06T12:00:00Z')
  const empty: Resp = { data: [], error: null, count: 0 }

  const loaders: Record<string, (db: InboxDb) => Promise<unknown>> = {
    w18: (db) => load.loadW18Section(db, ORG),
    bill: (db) => load.loadBillSection(db, ORG),
    opening: (db) => load.loadOpeningSection(db, ORG),
    w3: (db) => load.loadW3Section(db, ORG),
    collections: (db) => load.loadLetterSection(db, ORG),
    arc: (db) => load.loadArcSection(db, ORG, { associationName: 'A' }),
    join: (db) => load.loadJoinSection(db, ORG, true),
    amenity: (db) => load.loadAmenitySection(db, ORG, 'America/New_York', { live: true, now: NOW }),
    pro: (db) => load.loadProSection(db, ORG, true),
  }

  async function sigs(run: (db: InboxDb) => Promise<unknown>, isCount: boolean) {
    const { db, calls } = recordingDb(empty)
    await run(db).catch(() => {})
    return calls
      .filter((c) => {
        const select = c.ops.find(([op]) => op === 'select')
        const opts = (select?.[1][1] ?? {}) as { head?: boolean; count?: string }
        return isCount ? opts.head === true : opts.count === 'exact' && opts.head !== true
      })
      .map((c) => `${c.table}#${filterSig(c.ops)}`)
  }

  it('every list section has a head count with identical eq/in/is/gt filters on the same table', async () => {
    const counted = await sigs((db) => load.countPendingApprovals(db, ORG, { m5: true, m6: true, m11: true, now: NOW }), true)
    for (const [source, run] of Object.entries(loaders)) {
      const listed = await sigs(run, false)
      expect(listed.length, `${source} should record its list query`).toBeGreaterThan(0)
      for (const sig of listed) expect(counted, `${source}: ${sig}`).toContain(sig)
    }
  })
})

describe('M6 professionals and the sidebar badge', () => {
  it('with M6 on, professional items are counted for everyone (all pro actions, no treasurer narrowing)', async () => {
    const { db, calls } = recordingDb({ data: null, error: null, count: 1 })
    const waiting = await getBoardWaiting(db, ORG, { m5: false, m6: true, m11: false })
    expect(waiting.counts.pro).toBe(1)
    const proCall = calls.find((c) => c.ops.some(([op, a]) => op === 'in' && a[0] === 'action_type' && (a[1] as string[]).includes('pro.journal_entry')))
    expect(proCall).toBeDefined()
    expect(calls.some((c) => c.table === 'org_members')).toBe(false)
  })

  it('the sidebar badge equals the tile for a non-treasurer board member (no viewer narrowing)', async () => {
    const a = recordingDb({ data: null, error: null, count: 1 })
    const badges = await sidebarBadges(a.db, ORG)
    expect(a.calls.some((c) => c.table === 'org_members')).toBe(false)
    const b = recordingDb({ data: null, error: null, count: 1 })
    const waiting = await getBoardWaiting(b.db, ORG)
    expect(badges['/approvals']).toBe(approvalsBadge(waiting.counts))
  })
})
