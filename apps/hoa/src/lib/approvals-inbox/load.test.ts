import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { countPendingApprovals, loadVendorCountsByAssociation, loadW18Section, loadW3Section, type InboxDb } from './load'

/**
 * A minimal stand-in for the Supabase query builder: every chained call is
 * recorded, and awaiting the chain resolves the next canned response for
 * that table. Enough to prove what each loader asks for and how it treats
 * a failed read — not a database.
 */
type Resp = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

function fakeDb(responses: Record<string, Resp[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] }
      calls.push(entry)
      const queue = responses[table] ?? []
      const builder: Record<string, unknown> = {}
      const chain = (name: string) =>
        (...args: unknown[]) => {
          entry.ops.push([name, args])
          return builder
        }
      for (const op of ['select', 'eq', 'in', 'is', 'order', 'range', 'limit', 'not']) builder[op] = chain(op)
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

const err = { code: '42501', message: 'permission denied' }
const ORG = '00000000-0000-0000-0000-000000000001'

describe('loadW18Section', () => {
  it('reads proposed W18 postings for the org, oldest first, with an exact count', async () => {
    const { db, calls } = fakeDb({
      approval_requests: [
        {
          data: [{ id: 'p1', subject_id: 't1', summary: 's', amount: '10.00', proposed_at: '2026-10-01T00:00:00Z' }],
          error: null,
          count: 7,
        },
      ],
      ai_runs: [{ data: [{ input: { bankTransactionId: 't1' }, output: { notes: 'n' }, created_at: '2026-10-01T00:00:00Z' }], error: null }],
    })
    const s = await loadW18Section(db, ORG)
    expect(s).toMatchObject({ source: 'w18', ok: true, total: 7 })
    if (!s.ok) throw new Error('unreachable')
    expect(s.items[0]).toMatchObject({ id: 'p1', amount: 10, reasoning: 'n' })

    const q = calls.find((c) => c.table === 'approval_requests')!.ops
    expect(q).toContainEqual(['eq', ['organization_id', ORG]])
    expect(q).toContainEqual(['eq', ['action_type', 'w18.cash_receipt']])
    expect(q).toContainEqual(['eq', ['status', 'proposed']])
    expect(q).toContainEqual(['order', ['proposed_at', { ascending: true }]])
  })

  it('a failed read is a failed section, never an empty one', async () => {
    const { db } = fakeDb({ approval_requests: [{ data: null, error: err }] })
    expect(await loadW18Section(db, ORG)).toEqual({ source: 'w18', ok: false })
  })

  it('a thrown read is a failed section too', async () => {
    const { db } = fakeDb({ approval_requests: [] })
    expect(await loadW18Section(db, ORG)).toEqual({ source: 'w18', ok: false })
  })

  it('keeps the postings when only the matcher notes fail, and says the notes failed', async () => {
    const { db } = fakeDb({
      approval_requests: [
        { data: [{ id: 'p1', subject_id: 't1', summary: 's', amount: 5, proposed_at: '2026-10-01T00:00:00Z' }], error: null, count: 1 },
      ],
      ai_runs: [{ data: null, error: err }],
    })
    const s = await loadW18Section(db, ORG)
    expect(s).toMatchObject({ ok: true, total: 1, notesFailed: true })
    if (!s.ok) throw new Error('unreachable')
    expect(s.items[0].reasoning).toBeNull()
  })

  it('does not query notes when there are no postings', async () => {
    const { db, calls } = fakeDb({ approval_requests: [{ data: [], error: null, count: 0 }] })
    expect(await loadW18Section(db, ORG)).toMatchObject({ ok: true, total: 0, items: [] })
    expect(calls.some((c) => c.table === 'ai_runs')).toBe(false)
  })
})

describe('loadW3Section', () => {
  it('reads pending W3 drafts for the org', async () => {
    const { db, calls } = fakeDb({
      ai_runs: [
        {
          data: [{ id: 'r1', created_at: '2026-10-01T00:00:00Z', input: {}, output: {}, citations: [], reasoning_trace: null }],
          error: null,
          count: 3,
        },
      ],
    })
    expect(await loadW3Section(db, ORG)).toMatchObject({ source: 'w3', ok: true, total: 3 })
    const q = calls[0].ops
    expect(q).toContainEqual(['eq', ['workflow_id', 'W3']])
    expect(q).toContainEqual(['eq', ['status', 'pending_human_approval']])
    expect(q).toContainEqual(['eq', ['organization_id', ORG]])
  })

  it('a failed read is a failed section', async () => {
    const { db } = fakeDb({ ai_runs: [{ data: null, error: err }] })
    expect(await loadW3Section(db, ORG)).toEqual({ source: 'w3', ok: false })
  })
})

describe('countPendingApprovals (sidebar badge)', () => {
  let ok: (n: number) => Resp
  beforeEach(() => {
    ok = (n) => ({ data: null, error: null, count: n })
  })

  const ASSOC = { id: 'a-1', name: 'Alpha Commons' }

  it('counts each source with head-only queries; vendors only for the primary association the list shows', async () => {
    const { db, calls } = fakeDb({
      approval_requests: [ok(2)],
      ai_runs: [ok(1)],
      associations: [{ data: [ASSOC], error: null }],
      vendor_compliance: [ok(3), ok(1)],
    })
    expect(await countPendingApprovals(db, ORG)).toEqual({ w18: 2, w3: 1, vendor: 4 })
    for (const c of calls.filter((c) => c.table !== 'associations')) {
      const select = c.ops.find(([op]) => op === 'select')!
      expect(select[1][1], `${c.table} must be a head count`).toMatchObject({ count: 'exact', head: true })
    }
    // BL-048: a vendor with compliance rows in two associations was counted
    // twice, and vendors of other associations counted though the list
    // (primary association only) never shows them.
    const vendorCounts = calls.filter((c) => c.table === 'vendor_compliance')
    expect(vendorCounts).toHaveLength(2)
    for (const c of vendorCounts) expect(c.ops).toContainEqual(['eq', ['association_id', ASSOC.id]])
    // Same primary rule as getPrimaryAssociation: first by name.
    const assoc = calls.find((c) => c.table === 'associations')!.ops
    expect(assoc).toContainEqual(['eq', ['organization_id', ORG]])
    expect(assoc).toContainEqual(['order', ['name', { ascending: true }]])
  })

  it('no association means no vendor in the list, so 0 — without counting', async () => {
    const { db, calls } = fakeDb({
      approval_requests: [ok(0)],
      ai_runs: [ok(0)],
      associations: [{ data: [], error: null }],
    })
    expect(await countPendingApprovals(db, ORG)).toEqual({ w18: 0, w3: 0, vendor: 0 })
    expect(calls.some((c) => c.table === 'vendor_compliance')).toBe(false)
  })

  it('a failed association lookup makes the vendor count unknown, not 0', async () => {
    const { db } = fakeDb({
      approval_requests: [ok(0)],
      ai_runs: [ok(0)],
      associations: [{ data: null, error: err }],
    })
    expect(await countPendingApprovals(db, ORG)).toEqual({ w18: 0, w3: 0, vendor: null })
  })

  it('a failed count is unknown (null), not zero', async () => {
    const { db } = fakeDb({
      approval_requests: [{ data: null, error: err }],
      ai_runs: [ok(0)],
      associations: [{ data: [ASSOC], error: null }],
      vendor_compliance: [ok(0), { data: null, error: err }],
    })
    expect(await countPendingApprovals(db, ORG)).toEqual({ w18: null, w3: 0, vendor: null })
  })
})

describe('loadVendorCountsByAssociation (BL-048 multi-association breakdown)', () => {
  const ok = (n: number): Resp => ({ data: null, error: null, count: n })

  it('counts vendors needing the board per association, primary (first by name) marked', async () => {
    const { db, calls } = fakeDb({
      associations: [
        {
          data: [
            { id: 'a-1', name: 'Alpha Commons' },
            { id: 'a-2', name: 'Birch Village' },
          ],
          error: null,
        },
      ],
      // per association: gaps, then ready
      vendor_compliance: [ok(2), ok(1), ok(0), { data: null, error: err }],
    })
    const r = await loadVendorCountsByAssociation(db, ORG)
    expect(r).toEqual({
      ok: true,
      rows: [
        { associationId: 'a-1', name: 'Alpha Commons', count: 3, primary: true },
        { associationId: 'a-2', name: 'Birch Village', count: null, primary: false },
      ],
    })
    const vc = calls.filter((c) => c.table === 'vendor_compliance')
    expect(vc).toHaveLength(4)
    for (const c of vc) {
      expect(c.ops.find(([op]) => op === 'select')![1][1]).toMatchObject({ count: 'exact', head: true })
      expect(c.ops).toContainEqual(['eq', ['organization_id', ORG]])
    }
    expect(vc[0].ops).toContainEqual(['eq', ['association_id', 'a-1']])
    expect(vc[2].ops).toContainEqual(['eq', ['association_id', 'a-2']])
  })

  it('a single-association org has no breakdown and makes no counts', async () => {
    const { db, calls } = fakeDb({ associations: [{ data: [{ id: 'a-1', name: 'Alpha Commons' }], error: null }] })
    expect(await loadVendorCountsByAssociation(db, ORG)).toEqual({ ok: true, rows: [] })
    expect(calls.some((c) => c.table === 'vendor_compliance')).toBe(false)
  })

  it('a failed association read is a failure, not an empty breakdown', async () => {
    const { db } = fakeDb({ associations: [{ data: null, error: err }] })
    expect(await loadVendorCountsByAssociation(db, ORG)).toEqual({ ok: false })
  })
})
