import { describe, expect, it, vi } from 'vitest'
import { countPendingJoins, decideJoinRequest, loadLiveJoinCodes, loadJoinHomes, loadPendingJoins, type JoinDb } from './board'
import { JOIN_NOT_LIVE } from './model'
import { loadMyJoinStatus } from './status'

// BL-143: the board's reads and decision. Flag off: no query. Flag on:
// the board's own client, owner_join_decide for the decision, and the
// database's refusals turned into plain sentences.

function fakeDb(tables: Record<string, { data?: unknown; error?: unknown; count?: number }>, rpc?: { data?: unknown; error?: unknown }) {
  const calls: string[] = []
  const db = {
    from: (table: string) => {
      calls.push(`from:${table}`)
      const res = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null, count: tables[table]?.count ?? null }
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'in', 'gt', 'order', 'range']) c[m] = () => c
      c.then = (r: (v: unknown) => unknown) => Promise.resolve(res).then(r)
      return c
    },
    rpc: vi.fn(async (fn: string) => {
      calls.push(`rpc:${fn}`)
      return { data: rpc?.data ?? null, error: rpc?.error ?? null }
    }),
  }
  return { db: db as unknown as JoinDb & { rpc: ReturnType<typeof vi.fn> }, calls }
}

describe('flag off', () => {
  it('loads nothing and decides nothing, without a query', async () => {
    const { db, calls } = fakeDb({})
    expect(await loadPendingJoins(db, 'org', 50, false)).toEqual({ ok: true, items: [], total: 0 })
    expect(await countPendingJoins(db, 'org', false)).toBe(0)
    expect(await loadLiveJoinCodes(db, 'org', '2026-10-21T00:00:00Z', false)).toEqual([])
    expect(await loadJoinHomes(db, 'org', false)).toEqual([])
    expect(await decideJoinRequest(db, { requestId: 'r', approve: true }, false)).toEqual({ ok: false, error: JOIN_NOT_LIVE })
    expect(await loadMyJoinStatus(db, false)).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('loadPendingJoins', () => {
  it('builds each card from the request, its home and the owners on file', async () => {
    const { db } = fakeDb({
      owner_join_requests: {
        data: [{ id: 'r1', unit_id: 'u1', requester_name: 'Pat', requester_email: 'pat@example.test', requester_email_confirmed: true, method: 'code', created_at: 'T' }],
        count: 3,
      },
      units: { data: [{ id: 'u1', address_line1: '12 Oak St', unit_number: null, city: null }] },
      ownerships: { data: [{ unit_id: 'u1', owner_email: 'pat@example.test', owner_user_id: null }] },
    })
    const r = await loadPendingJoins(db, 'org', 50, true)
    expect(r).toMatchObject({ ok: true, total: 3 })
    if (r.ok) expect(r.items[0]!.card).toEqual({ requestId: 'r1', home: '12 Oak St', who: 'Pat (pat@example.test)', method: 'code', emailCheck: 'match' })
  })

  it('fails the section when the requests or the homes can’t be read', async () => {
    expect(await loadPendingJoins(fakeDb({ owner_join_requests: { error: { code: '42P01' } } }).db, 'org', 50, true)).toEqual({ ok: false })
    const homesFail = fakeDb({
      owner_join_requests: { data: [{ id: 'r1', unit_id: 'u1', requester_name: null, requester_email: null, method: 'address', created_at: 'T' }] },
      units: { error: { code: 'XX' } },
    })
    expect(await loadPendingJoins(homesFail.db, 'org', 50, true)).toEqual({ ok: false })
  })

  it('a failed count is unknown (null), never 0', async () => {
    expect(await countPendingJoins(fakeDb({ owner_join_requests: { error: { code: 'XX' } } }).db, 'org', true)).toBeNull()
    expect(await countPendingJoins(fakeDb({ owner_join_requests: { count: 4 } }).db, 'org', true)).toBe(4)
  })
})

describe('decideJoinRequest', () => {
  it('approves and rejects through owner_join_decide', async () => {
    const ok = fakeDb({}, { data: 'approved' })
    expect((await decideJoinRequest(ok.db, { requestId: 'r', approve: true }, true)).ok).toBe(true)
    expect(ok.db.rpc).toHaveBeenCalledWith('owner_join_decide', { p_request_id: 'r', p_approve: true, p_note: null })
    const no = fakeDb({}, { data: 'rejected' })
    expect((await decideJoinRequest(no.db, { requestId: 'r', approve: false, reason: ' Not the owner ' }, true)).ok).toBe(true)
    expect(no.db.rpc).toHaveBeenCalledWith('owner_join_decide', { p_request_id: 'r', p_approve: false, p_note: 'Not the owner' })
  })

  it('a reject needs a reason before any call', async () => {
    const { db, calls } = fakeDb({})
    expect(await decideJoinRequest(db, { requestId: 'r', approve: false, reason: '  ' }, true)).toEqual({ ok: false, error: 'A reason is required to reject.' })
    expect(calls).toEqual([])
  })

  it('turns the database’s refusals into sentences', async () => {
    expect(await decideJoinRequest(fakeDb({}, { error: { code: '42501' } }).db, { requestId: 'r', approve: true }, true)).toEqual({
      ok: false,
      error: 'That request isn’t one you can decide.',
    })
    expect((await decideJoinRequest(fakeDb({}, { error: { code: '23503' } }).db, { requestId: 'r', approve: true }, true)).ok).toBe(false)
    expect(await decideJoinRequest(fakeDb({}, { data: 'already_decided' }).db, { requestId: 'r', approve: true }, true)).toEqual({
      ok: true,
      message: 'Someone already decided this request.',
    })
    expect((await decideJoinRequest(fakeDb({}, { data: 'weird' }).db, { requestId: 'r', approve: true }, true)).ok).toBe(false)
  })
})

describe('codes, homes and status', () => {
  it('labels each live code with its home', async () => {
    const { db } = fakeDb({
      owner_join_codes: { data: [{ id: 'c1', unit_id: 'u1', expires_at: 'E', created_at: 'C' }] },
      units: { data: [{ id: 'u1', address_line1: '12 Oak St', unit_number: '2', city: null }] },
    })
    expect(await loadLiveJoinCodes(db, 'org', 'now', true)).toEqual([{ id: 'c1', unitId: 'u1', home: '12 Oak St, Unit 2', expiresAt: 'E', createdAt: 'C' }])
  })

  it('lists homes with an address, and reads the caller’s status', async () => {
    const { db } = fakeDb(
      { units: { data: [{ id: 'u1', address_line1: '12 Oak St', unit_number: null, city: 'Macon' }, { id: 'u2', address_line1: null, unit_number: null, city: null }] } },
      { data: [{ attempts_today: 1, daily_limit: 5, last_attempt_at: null }] },
    )
    expect(await loadJoinHomes(db, 'org', true)).toEqual([{ id: 'u1', label: '12 Oak St, Macon' }])
    expect(await loadMyJoinStatus(db, true)).toEqual({ attemptsToday: 1, dailyLimit: 5, lastAttemptAt: null })
  })
})
