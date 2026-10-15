import { beforeEach, describe, expect, it, vi } from 'vitest'

// The role the mocked getCurrentUserRole() reports; null = no org/session.
let role: 'admin' | 'board' | 'resident' | null = 'resident'

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    role === null
      ? null
      : { role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

// Anything past the gate. The refusal tests assert none of it is reached.
const getPrimaryAssociation = vi.fn(async () => ({ id: 'assoc-1', name: 'Test' }))
const getSupabaseServerClient = vi.fn(async () => {
  throw new Error('reached the database')
})
const agentExecute = vi.fn()

vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ loadAccountingRefs: vi.fn(), postJournalEntry: vi.fn() }))
vi.mock('@homeowner-portal/workflows', () => ({ bankReconciliationAgent: { execute: agentExecute } }))

const { requireBoardOrAdminForAction, ACCOUNTING_DENIED } = await import('./guard')
const bankRec = await import('../bank-rec')

const TXN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('requireBoardOrAdminForAction', () => {
  it('admits board and admin', async () => {
    role = 'board'
    expect(await requireBoardOrAdminForAction()).toEqual({ ok: true, role: 'board', orgId: 'org-1' })
    role = 'admin'
    expect(await requireBoardOrAdminForAction()).toEqual({ ok: true, role: 'admin', orgId: 'org-1' })
  })

  it('refuses a resident with an error, not a redirect', async () => {
    role = 'resident'
    expect(await requireBoardOrAdminForAction()).toEqual({ ok: false, error: ACCOUNTING_DENIED })
  })

  it('refuses a caller with no org', async () => {
    role = null
    const res = await requireBoardOrAdminForAction()
    expect(res.ok).toBe(false)
  })
})

describe('bank queue actions refuse a resident before doing anything', () => {
  beforeEach(() => {
    role = 'resident'
    getPrimaryAssociation.mockClear()
    getSupabaseServerClient.mockClear()
    agentExecute.mockClear()
  })

  const calls: Array<[string, () => Promise<{ ok: boolean }>]> = [
    ['reRunBankMatch', () => bankRec.reRunBankMatch({ bankTransactionId: TXN })],
    ['confirmFuzzyMatch', () => bankRec.confirmFuzzyMatch({ bankTransactionId: TXN, assessmentId: OTHER })],
    ['categorizeAsExpense', () => bankRec.categorizeAsExpense({ bankTransactionId: TXN, expenseAccountId: OTHER })],
    ['ignoreTransaction', () => bankRec.ignoreTransaction({ bankTransactionId: TXN })],
  ]

  for (const [name, call] of calls) {
    it(name, async () => {
      expect(await call()).toEqual({ ok: false, error: ACCOUNTING_DENIED })
      expect(getPrimaryAssociation).not.toHaveBeenCalled()
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
      expect(agentExecute).not.toHaveBeenCalled()
    })
  }

  it('a board member gets past the gate (control)', async () => {
    role = 'board'
    await expect(bankRec.ignoreTransaction({ bankTransactionId: TXN })).rejects.toThrow('reached the database')
    expect(getPrimaryAssociation).toHaveBeenCalled()
  })
})
