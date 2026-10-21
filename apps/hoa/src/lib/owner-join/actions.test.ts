import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-143 (migration 0069 part 3, M5_APPLIED). Flag off: no action touches
// the database. Flag on: askToJoin calls owner_join_claim with the
// caller's own client and tells the asker the SAME thing whether or not an
// address matched; the code actions gate on board/admin first and store
// only the code's SHA-256.

type Call = { op: string; table?: string; fn?: string; args?: unknown }

const h = vi.hoisted(() => ({
  m5: false,
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: string; orgId?: string; error?: string },
  user: { id: 'user-1' } as { id: string } | null,
  rpcData: 'sent' as unknown,
  rpcError: null as { code?: string } | null,
  insertResult: { data: { id: 'code-1' }, error: null } as { data: unknown; error: { code?: string } | null },
  updateResult: { data: [{ id: 'code-1' }], error: null } as { data: unknown; error: { code?: string } | null },
  calls: [] as Call[],
}))

function chain(result: unknown, table: string, op: string) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'select', 'single']) c[m] = () => c
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  h.calls.push({ op, table })
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: h.user } }) },
  rpc: async (fn: string, args?: unknown) => {
    h.calls.push({ op: 'rpc', fn, args })
    return { data: h.rpcData, error: h.rpcError }
  },
  from: (table: string) => ({
    insert: (args: unknown) => {
      h.calls.push({ op: 'insert-args', table, args })
      return chain(table === 'audit_log' ? { error: null } : h.insertResult, table, 'insert')
    },
    update: (args: unknown) => {
      h.calls.push({ op: 'update-args', table, args })
      return chain(h.updateResult, table, 'update')
    },
  }),
}

vi.mock('@homeowner-portal/db/m5', () => ({
  get M5_APPLIED() {
    return h.m5
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => client }))

import { askToJoin, issueJoinCode, revokeJoinCode } from './actions'
import { CLAIM_MESSAGES, CLAIM_SENT, JOIN_NOT_LIVE, normaliseCode } from './model'

const UNIT = '22222222-2222-4222-8222-222222222222'
const CODE_ID = '33333333-3333-4333-8333-333333333333'
const address = { method: 'address' as const, address: '12 Oak Street', postalCode: '30301' }

beforeEach(() => {
  h.m5 = false
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.user = { id: 'user-1' }
  h.rpcData = 'sent'
  h.rpcError = null
  h.insertResult = { data: { id: 'code-1' }, error: null }
  h.updateResult = { data: [{ id: 'code-1' }], error: null }
  h.calls = []
})

describe('flag off (M5_APPLIED false): never touches the database', () => {
  it('every action refuses with the not-live message and makes no call', async () => {
    expect(await askToJoin(address)).toEqual({ ok: false, error: JOIN_NOT_LIVE })
    expect(await issueJoinCode(UNIT)).toEqual({ ok: false, error: JOIN_NOT_LIVE })
    expect(await revokeJoinCode(CODE_ID)).toEqual({ ok: false, error: JOIN_NOT_LIVE })
    expect(h.calls).toEqual([])
  })
})

describe('askToJoin', () => {
  beforeEach(() => {
    h.m5 = true
  })

  it('sends an address claim through owner_join_claim on the caller’s own client', async () => {
    expect(await askToJoin({ ...address, unit: 'Apt 4B' })).toEqual({ ok: true, message: CLAIM_SENT })
    expect(h.calls).toEqual([
      { op: 'rpc', fn: 'owner_join_claim', args: { p_address: '12 Oak Street', p_postal_code: '30301', p_unit: 'Apt 4B' } },
    ])
  })

  it('a code claim sends only the normalised code', async () => {
    await askToJoin({ method: 'code', code: 'abcde-fghjk' })
    expect(h.calls).toEqual([{ op: 'rpc', fn: 'owner_join_claim', args: { p_code: 'ABCDEFGHJK' } }])
  })

  it('answers exactly the same whether or not the address matched — the database says "sent" for both', async () => {
    const a = await askToJoin(address)
    const b = await askToJoin({ ...address, address: '999 Nowhere Road' })
    expect(a).toEqual(b)
  })

  it('says when the daily limit is reached, and when a code did not work', async () => {
    h.rpcData = 'rate_limited'
    expect(await askToJoin(address)).toEqual({ ok: false, error: CLAIM_MESSAGES.rate_limited })
    h.rpcData = 'invalid_code'
    expect(await askToJoin({ method: 'code', code: 'ABCDEFGHJK' })).toEqual({ ok: false, error: CLAIM_MESSAGES.invalid_code })
  })

  it('refuses a bad form before any call, and a signed-out caller', async () => {
    const r = await askToJoin({ method: 'address', address: '', postalCode: '1' })
    expect(r.ok).toBe(false)
    expect(h.calls).toEqual([])
    h.user = null
    expect(await askToJoin(address)).toEqual({ ok: false, error: 'Sign in first.' })
    expect(h.calls).toEqual([])
  })

  it('a database error or an unknown answer is a generic failure', async () => {
    h.rpcError = { code: 'XX000' }
    expect((await askToJoin(address)).ok).toBe(false)
    h.rpcError = null
    h.rpcData = 'something-else'
    expect((await askToJoin(address)).ok).toBe(false)
  })
})

describe('issueJoinCode / revokeJoinCode', () => {
  beforeEach(() => {
    h.m5 = true
  })

  it('a resident is refused before any call', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await issueJoinCode(UNIT)).toEqual({ ok: false, error: 'denied' })
    expect(await revokeJoinCode(CODE_ID)).toEqual({ ok: false, error: 'denied' })
    expect(h.calls).toEqual([])
  })

  it('stores only the SHA-256 of the code it returns, for the board’s org, expiring in 30 days', async () => {
    const before = Date.now()
    const r = await issueJoinCode(UNIT)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/)
    const insert = h.calls.find((c) => c.op === 'insert-args' && c.table === 'owner_join_codes')!.args as Record<string, unknown>
    expect(insert.organization_id).toBe('org-1')
    expect(insert.unit_id).toBe(UNIT)
    expect(insert.code_hash).toBe(createHash('sha256').update(normaliseCode(r.code)).digest('hex'))
    expect(JSON.stringify(h.calls)).not.toContain(normaliseCode(r.code))
    const days = (Date.parse(insert.expires_at as string) - before) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
    // One audit row, ids only.
    const audit = h.calls.find((c) => c.op === 'insert-args' && c.table === 'audit_log')!.args as Record<string, unknown>
    expect(audit).toMatchObject({ action: 'members.join_code_issued', entity_id: 'code-1', metadata: { unit_id: UNIT } })
  })

  it('refuses a bad home id, and says when the home is not the org’s', async () => {
    expect(await issueJoinCode('not-a-uuid')).toEqual({ ok: false, error: 'Choose a home.' })
    h.insertResult = { data: null, error: { code: '23503' } }
    expect(await issueJoinCode(UNIT)).toEqual({ ok: false, error: 'That home isn’t in your HOA.' })
  })

  it('revoke stamps revoked_at, and says when nothing was left to revoke', async () => {
    expect(await revokeJoinCode(CODE_ID)).toEqual({ ok: true })
    const upd = h.calls.find((c) => c.op === 'update-args')!.args as Record<string, unknown>
    expect(Object.keys(upd)).toEqual(['revoked_at'])
    h.updateResult = { data: [], error: null }
    expect((await revokeJoinCode(CODE_ID)).ok).toBe(false)
  })
})
