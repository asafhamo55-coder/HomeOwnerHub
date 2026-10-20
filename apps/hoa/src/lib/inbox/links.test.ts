import { describe, it, expect, vi, afterEach } from 'vitest'
import { LINK_ERRORS, isLinkType, verifyLinkTarget, writeThreadLink } from './links'

// BL-101 A4 — inbox_thread_links has no FK on resource_id, so the writer
// checks type + org in code. Synthetic ids only.

type Result = { data: unknown; error: unknown }

/** PostgREST stand-in: records filters per table; maybeSingle/await yield the table's result. */
function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  return {
    calls,
    from(table: string) {
      const result = tables[table] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
        chain[m] = (...args: unknown[]) => {
          calls.push({ table, op: m, args })
          return chain
        }
      }
      chain.maybeSingle = async () => result
      chain.upsert = async (...args: unknown[]) => {
        calls.push({ table, op: 'upsert', args })
        return { data: null, error: (tables[`${table}:upsert`] as Result | undefined)?.error ?? null }
      }
      return chain
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('isLinkType', () => {
  it('accepts the four table types only', () => {
    expect(isLinkType('ticket')).toBe(true)
    expect(isLinkType('communication_thread')).toBe(true)
    expect(isLinkType('profiles')).toBe(false)
    expect(isLinkType(null)).toBe(false)
  })
})

describe('verifyLinkTarget', () => {
  it('looks in the table for the TYPE, org-scoped, live rows only', async () => {
    const db = fakeDb({ hoa_violations: { data: { id: 'v1', org_id: 'org-1', property_id: 'p1' }, error: null } })
    const r = await verifyLinkTarget(db as never, 'org-1', 'violation', 'v1')
    expect(r).toEqual({ ok: true, unitId: null, propertyId: 'p1' })
    const filters = db.calls.filter((c) => c.table === 'hoa_violations').map((c) => [c.op, ...c.args])
    expect(filters).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(filters).toContainEqual(['is', 'deleted_at', null])
  })

  it('refuses a row from another org even if the query let it through', async () => {
    const db = fakeDb({ tickets: { data: { id: 't1', organization_id: 'org-2', unit_id: 'u1' }, error: null } })
    expect(await verifyLinkTarget(db as never, 'org-1', 'ticket', 't1')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses an id that is not a record of that type', async () => {
    const db = fakeDb({ tickets: { data: null, error: null } })
    expect(await verifyLinkTarget(db as never, 'org-1', 'ticket', 'v1')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('says failed (not "not found") on a read error, logging codes only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb({ arc_requests: { data: null, error: { code: '42501', message: 'row text here' } } })
    expect(await verifyLinkTarget(db as never, 'org-1', 'arc_request', 'a1')).toEqual({ ok: false, reason: 'failed' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('row text here')
  })

  it('does not soft-delete-filter communication threads (no deleted_at column)', async () => {
    const db = fakeDb({ communication_threads: { data: { id: 'c1', organization_id: 'org-1' }, error: null } })
    await verifyLinkTarget(db as never, 'org-1', 'communication_thread', 'c1')
    expect(db.calls.some((c) => c.op === 'is')).toBe(false)
  })
})

describe('writeThreadLink', () => {
  const input = { orgId: 'org-1', userId: 'user-1', threadId: 'th-1', type: 'ticket' as const, resourceId: 't1' }

  it('writes after both checks pass', async () => {
    const db = fakeDb({
      inbox_threads: { data: { id: 'th-1' }, error: null },
      tickets: { data: { id: 't1', organization_id: 'org-1', unit_id: 'u1' }, error: null },
    })
    expect(await writeThreadLink(db as never, input)).toEqual({ ok: true })
    const up = db.calls.find((c) => c.op === 'upsert')!
    expect(up.table).toBe('inbox_thread_links')
    expect(up.args[0]).toEqual({ organization_id: 'org-1', thread_id: 'th-1', resource_type: 'ticket', resource_id: 't1', created_by: 'user-1' })
  })

  it('refuses another org’s thread before looking at the record', async () => {
    const db = fakeDb({ inbox_threads: { data: null, error: null } })
    expect(await writeThreadLink(db as never, input)).toEqual({ ok: false, error: LINK_ERRORS.thread })
    expect(db.calls.some((c) => c.table === 'tickets')).toBe(false)
  })

  it('refuses a record that is not this org’s', async () => {
    const db = fakeDb({ inbox_threads: { data: { id: 'th-1' }, error: null }, tickets: { data: null, error: null } })
    expect(await writeThreadLink(db as never, input)).toEqual({ ok: false, error: LINK_ERRORS.target })
    expect(db.calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('reports a failed insert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb({
      inbox_threads: { data: { id: 'th-1' }, error: null },
      tickets: { data: { id: 't1', organization_id: 'org-1', unit_id: 'u1' }, error: null },
      'inbox_thread_links:upsert': { data: null, error: { code: '23505' } },
    })
    expect(await writeThreadLink(db as never, input)).toEqual({ ok: false, error: LINK_ERRORS.failed })
  })
})
