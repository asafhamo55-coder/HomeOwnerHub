import { describe, expect, it, vi } from 'vitest'
import { moneyGate, type SignoffDb } from './signoff'

// A table-keyed fake: every query chain resolves to that table's rows.
function fakeDb(tables: Record<string, { data?: unknown; error?: { code: string } | null }>, rpc = vi.fn(async () => ({ data: 1, error: null }))): SignoffDb {
  const chain = (t: string): Record<string, unknown> => {
    const res = { data: tables[t]?.data ?? [], error: tables[t]?.error ?? null }
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'not']) b[op] = () => b
    b.maybeSingle = () => Promise.resolve({ data: Array.isArray(res.data) ? (res.data as unknown[])[0] ?? null : res.data, error: res.error })
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok)
    return b
  }
  return { from: (t: string) => chain(t), rpc }
}

const ORG = 'org-1'
const REQ = 'req-1'
const members = [
  { user_id: 't', role: 'board', officer_title: 'treasurer' },
  { user_id: 'm', role: 'board', officer_title: null },
  { user_id: 'a', role: 'admin', officer_title: null },
]
const request = (over: Record<string, unknown> = {}) => ({
  data: [{ organization_id: ORG, action_type: 'pro.journal_entry', amount: 100, status: 'proposed', ...over }],
})

describe('moneyGate', () => {
  it('has nothing to do for a non-money item', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }))
    const db = fakeDb({ approval_requests: request({ action_type: 'pro.note' }) }, rpc)
    expect(await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 'm' })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses another org’s request with the same answer as a missing one', async () => {
    const db = fakeDb({ approval_requests: request({ organization_id: 'other' }) })
    expect(await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 't' })).toEqual({ ok: false, error: 'That approval item isn’t valid.' })
  })

  it('makes a non-Treasurer wait and records nothing', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }))
    const db = fakeDb({ approval_requests: request(), associations: { data: [] }, org_members: { data: members }, approval_signoffs: { data: [] } }, rpc)
    const r = await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 'm' })
    expect(r).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lets the Treasurer approve a small item: records the sign-off and carries on', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }))
    const db = fakeDb({ approval_requests: request(), associations: { data: [] }, org_members: { data: members }, approval_signoffs: { data: [] } }, rpc)
    expect(await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 't' })).toBeNull()
    expect(rpc).toHaveBeenCalledWith('record_approval_signoff', { p_request_id: REQ })
  })

  it('records a first signature above the amount and stops; the second one carries on', async () => {
    const tables = (signed: string[]) => ({
      approval_requests: request({ amount: 6000 }),
      associations: { data: [{ dual_control_cents: 500_000 }] },
      org_members: { data: members },
      approval_signoffs: { data: signed.map((s) => ({ signer_id: s })) },
    })
    const first = await moneyGate(fakeDb(tables([])), { orgId: ORG, requestId: REQ, deciderId: 't' })
    expect(first).toMatchObject({ ok: true })
    expect((first as { message: string }).message).toMatch(/1 more/)
    expect(await moneyGate(fakeDb(tables(['t'])), { orgId: ORG, requestId: REQ, deciderId: 'm' })).toBeNull()
  })

  it('does not approve when the sign-off cannot be recorded', async () => {
    const rpc = vi.fn(async (): Promise<{ data: unknown; error: { code?: string } | null }> => ({ data: null, error: { code: '42501' } }))
    const db = fakeDb({ approval_requests: request(), associations: { data: [] }, org_members: { data: members }, approval_signoffs: { data: [] } }, rpc)
    expect(await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 't' })).toMatchObject({ ok: false })
  })

  it('fails closed when a read fails', async () => {
    const db = fakeDb({ approval_requests: request(), associations: { error: { code: 'x' } }, org_members: { data: members }, approval_signoffs: { data: [] } })
    expect(await moneyGate(db, { orgId: ORG, requestId: REQ, deciderId: 't' })).toMatchObject({ ok: false })
  })
})
