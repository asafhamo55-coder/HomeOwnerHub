import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reversing an entry that sits in a CLOSED period books the reversal today,
// in the open period. Only the reversal's own date is guarded.

const h = vi.hoisted(() => ({
  original: null as Record<string, unknown> | null,
  guard: vi.fn(),
  post: vi.fn(),
  markError: null as { code: string } | null,
  deletes: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => ({ ok: true, role: 'admin', orgId: 'org-1' }) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', timeZone: 'America/New_York' }) }))
vi.mock('@/lib/association-time', () => ({ todayIn: () => '2026-11-04' }))
vi.mock('@homeowner-portal/jobs/fiscal-periods', () => ({ readCurrentOpenPeriod: async () => ({ data: { id: 'fp-open' }, error: null }) }))
vi.mock('@homeowner-portal/db', () => ({
  CLOSED_PERIOD_MESSAGE: 'closed-msg',
  assertPeriodOpen: h.guard,
  postJournalEntry: h.post,
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      let op = 'select'
      let body: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) q[m] = () => q
      q.update = (b: Record<string, unknown>) => { op = 'update'; body = b; return q }
      q.delete = () => { op = 'delete'; return q }
      q.eq = (_c: string, v: string) => { if (op === 'delete') h.deletes.push(v); return q }
      q.single = async () => ({ data: h.original, error: null })
      q.then = (r: (v: unknown) => unknown) => r({ error: op === 'update' && body.status === 'reversed' ? h.markError : null })
      return q
    },
  }),
}))

import { reverseJournalEntry } from './journal-entries'

const ID = '11111111-1111-4111-8111-111111111111'
const original = {
  id: ID, organization_id: 'org-1', association_id: 'assoc-1', fiscal_period_id: 'fp-old', entry_date: '2025-03-01',
  memo: 'm', source: 'manual', status: 'posted', reversed_by_id: null,
  lines: [{ account_id: 'a', fund_id: 'f', debit_amount: 5, credit_amount: 0, memo: null }, { account_id: 'b', fund_id: 'f', debit_amount: 0, credit_amount: 5, memo: null }],
}

beforeEach(() => {
  h.markError = null
  h.deletes = []
  h.original = { ...original }
  h.post.mockReset().mockResolvedValue({ ok: true, journalEntryId: 'je-2', entryNumber: 'JE-1' })
  h.guard.mockReset().mockImplementation(async (_db: unknown, i: { date: string }) =>
    i.date === '2025-03-01' ? { ok: false, error: 'closed-msg' } : { ok: true })
})

describe('reverseJournalEntry and closed periods', () => {
  it('reverses a closed-month entry into the open period, dated today', async () => {
    const r = await reverseJournalEntry({ journalEntryId: ID })
    expect(r.ok).toBe(true)
    expect(h.post).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entryDate: '2026-11-04', fiscalPeriodId: 'fp-open' }))
  })

  it('keeps the original period when it is open', async () => {
    h.guard.mockResolvedValue({ ok: true })
    await reverseJournalEntry({ journalEntryId: ID })
    expect(h.post).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fiscalPeriodId: 'fp-old' }))
  })

  it('refuses when the reversal date itself is closed, writing nothing', async () => {
    h.guard.mockResolvedValue({ ok: false, error: 'closed-msg' })
    const r = await reverseJournalEntry({ journalEntryId: ID })
    expect(r).toEqual({ ok: false, error: 'closed-msg' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('when marking the original fails, it takes the reversal back out and reports a plain error', async () => {
    h.markError = { code: '55000' }
    const r = await reverseJournalEntry({ journalEntryId: ID })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/not reversed/)
    expect(h.deletes).toContain('je-2')
  })
})
