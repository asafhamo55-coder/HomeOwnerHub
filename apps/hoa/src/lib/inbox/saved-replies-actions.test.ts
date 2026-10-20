import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-101 A5 — the balance merge field goes through the A2 disclosure gate.
// Fake board RLS client; synthetic ids and values only.

type R = { data: unknown; error: unknown }
let tables: Record<string, R> = {}
function fakeDb() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain
      chain.maybeSingle = async () => tables[table] ?? { data: null, error: null }
      return chain
    },
  }
}

let gate: { ok: true; role: 'board'; orgId: string } | { ok: false; error: string } = { ok: true, role: 'board', orgId: 'org-1' }
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeDb()) }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.example.test${p}` }))

const checkSenderForUnit = vi.fn()
const loadHomeAccount = vi.fn()
vi.mock('@/lib/inbox/account-context', () => ({
  checkSenderForUnit: (...a: unknown[]) => checkSenderForUnit(...a),
  loadHomeAccount: (...a: unknown[]) => loadHomeAccount(...a),
}))

import { resolveSavedReply } from './saved-replies-actions'

const THREAD = '11111111-1111-4111-8111-111111111111'
const account = (over: Record<string, unknown> = {}) => ({
  account: { balanceCents: 41250, today: '2026-10-20', truncated: false, ...over },
})

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  tables = {
    inbox_threads: { data: { id: THREAD, unit_id: 'unit-1' }, error: null },
    inbox_messages: { data: { from_email: 'Pat@Example.test', from_name: 'Pat Example' }, error: null },
  }
  checkSenderForUnit.mockReset().mockResolvedValue({ verified: true })
  loadHomeAccount.mockReset().mockResolvedValue(account())
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('resolveSavedReply', () => {
  it('fills the balance for a verified resident of the home', async () => {
    const r = await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })
    expect(r).toMatchObject({ ok: true, balanceWithheld: false })
    expect(r.ok && r.text).toContain('$412.50 (as of 2026-10-20)')
    expect(r.ok && r.text).toContain('https://app.example.test/resident')
    expect(checkSenderForUnit).toHaveBeenCalledWith(expect.anything(), 'org-1', 'unit-1', 'pat@example.test')
  })

  it('an unverified sender gets a money blank, and the account is never read', async () => {
    checkSenderForUnit.mockResolvedValue({ verified: false, reason: 'not_a_resident' })
    const r = await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })
    expect(r).toMatchObject({ ok: true, balanceWithheld: true })
    expect(r.ok && r.text).toContain('[[BLANK: money]]')
    expect(loadHomeAccount).not.toHaveBeenCalled()
  })

  it('an unfiled thread, a failed ledger read or a capped ledger withholds the balance', async () => {
    tables.inbox_threads = { data: { id: THREAD, unit_id: null }, error: null }
    expect(await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).toMatchObject({ ok: true, balanceWithheld: true })
    expect(checkSenderForUnit).not.toHaveBeenCalled()

    tables.inbox_threads = { data: { id: THREAD, unit_id: 'unit-1' }, error: null }
    loadHomeAccount.mockResolvedValue({ account: null })
    expect(await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).toMatchObject({ balanceWithheld: true })
    loadHomeAccount.mockResolvedValue(account({ truncated: true }))
    expect(await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).toMatchObject({ balanceWithheld: true })
  })

  it('a reply without the balance never runs the gate', async () => {
    const r = await resolveSavedReply({ threadId: THREAD, replyId: 'arc-how-to' })
    expect(r.ok && r.text).toContain('https://app.example.test/resident/arc/new')
    expect(checkSenderForUnit).not.toHaveBeenCalled()
  })

  it('refuses bad input, unknown replies, non-board callers and foreign threads', async () => {
    expect((await resolveSavedReply({ threadId: 'nope', replyId: 'how-to-pay' })).ok).toBe(false)
    expect((await resolveSavedReply({ threadId: THREAD, replyId: 'made-up' })).ok).toBe(false)
    tables.inbox_threads = { data: null, error: null }
    expect(await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).toEqual({ ok: false, error: 'Thread not found.' })
    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect((await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).ok).toBe(false)
  })

  it('logs ids and codes only', async () => {
    tables.inbox_messages = { data: null, error: { code: '57014', message: 'Pat@Example.test timeout' } }
    expect((await resolveSavedReply({ threadId: THREAD, replyId: 'how-to-pay' })).ok).toBe(false)
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).toContain('57014')
    expect(logged).not.toMatch(/example\.test/i)
  })
})
