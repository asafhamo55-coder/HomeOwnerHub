import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-029 actions: saving the reviewed draft goes through the existing
// budget create path (createBudget + saveBudgetLineItems), and the AI
// summary only ever sees figures computed here. The gate runs before any
// database client or model call.

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: 'board' | 'admin'; orgId: string } | { ok: false; error: string },
  createBudget: vi.fn(),
  saveBudgetLineItems: vi.fn(),
  generateBudgetNarrative: vi.fn(),
  getClient: vi.fn(),
}))

vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => h.gate }))
vi.mock('@/lib/budgets', () => ({ createBudget: h.createBudget, saveBudgetLineItems: h.saveBudgetLineItems }))
vi.mock('@homeowner-portal/ai', () => ({ generateBudgetNarrative: h.generateBudgetNarrative }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: h.getClient }))

const { saveDraftBudget, summarizeDraftBudget } = await import('./budget-draft-actions')

const PERIOD = '11111111-1111-4111-8111-111111111111'
const FUND = '22222222-2222-4222-8222-222222222222'
const BUDGET = '33333333-3333-4333-8333-333333333333'
const ACC = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`

const lines = [
  { accountId: ACC(1), amount: 122_055, note: 'Last year budget $120,000, actual $118,500, +3%' },
  { accountId: ACC(2), amount: 0, note: 'No budget or activity last year — enter an amount' },
  { accountId: ACC(3), amount: 26_883, note: 'x'.repeat(600) },
]

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.createBudget.mockReset().mockResolvedValue({ ok: true, budgetId: BUDGET })
  h.saveBudgetLineItems.mockReset().mockResolvedValue({ ok: true, budgetId: BUDGET })
  h.generateBudgetNarrative.mockReset()
  h.getClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saveDraftBudget', () => {
  it('refuses a resident before touching the database', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can change accounting records.' }
    const r = await saveDraftBudget({ fiscalPeriodId: PERIOD, fundId: FUND, lines })
    expect(r).toEqual({ ok: false, error: 'Only board members and admins can change accounting records.' })
    expect(h.createBudget).not.toHaveBeenCalled()
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('creates a DRAFT through the existing path and saves the non-zero lines with their reasons', async () => {
    const r = await saveDraftBudget({ fiscalPeriodId: PERIOD, fundId: FUND, lines })
    expect(r).toEqual({ ok: true, budgetId: BUDGET })
    expect(h.createBudget).toHaveBeenCalledWith({ fiscalPeriodId: PERIOD, fundId: FUND })
    expect(h.saveBudgetLineItems).toHaveBeenCalledWith({
      budgetId: BUDGET,
      lineItems: [
        { accountId: ACC(1), amount: 122_055, notes: 'Last year budget $120,000, actual $118,500, +3%' },
        { accountId: ACC(3), amount: 26_883, notes: 'x'.repeat(500) },
      ],
    })
  })

  it('passes a create refusal through (e.g. a budget already exists for that year)', async () => {
    h.createBudget.mockResolvedValue({ ok: false, error: 'A budget for that period and fund already exists.' })
    const r = await saveDraftBudget({ fiscalPeriodId: PERIOD, fundId: FUND, lines })
    expect(r).toEqual({ ok: false, error: 'A budget for that period and fund already exists.' })
    expect(h.saveBudgetLineItems).not.toHaveBeenCalled()
  })

  it('when the lines fail after the budget exists, says so and returns its id to retry against', async () => {
    h.saveBudgetLineItems.mockResolvedValue({ ok: false, error: 'line items: boom' })
    const r = await saveDraftBudget({ fiscalPeriodId: PERIOD, fundId: FUND, lines })
    expect(r).toEqual({
      ok: false,
      budgetId: BUDGET,
      error: 'The draft budget was created, but its lines didn’t save. Select Save again to retry — nothing is lost.',
    })
  })

  it('a retry with the budget id only saves the lines', async () => {
    const r = await saveDraftBudget({ fiscalPeriodId: PERIOD, fundId: FUND, budgetId: BUDGET, lines })
    expect(r).toEqual({ ok: true, budgetId: BUDGET })
    expect(h.createBudget).not.toHaveBeenCalled()
    expect(h.saveBudgetLineItems).toHaveBeenCalledTimes(1)
  })

  it('rejects bad input with field errors', async () => {
    const r = await saveDraftBudget({ fiscalPeriodId: 'nope', fundId: FUND, lines: [{ accountId: ACC(1), amount: -5, note: '' }] })
    expect(r.ok).toBe(false)
    expect(h.createBudget).not.toHaveBeenCalled()
  })
})

describe('summarizeDraftBudget', () => {
  const input = {
    yearLabel: 'FY 2027',
    fundName: 'Operating Fund',
    inflationPct: 3,
    lines: [
      { accountName: 'Assessment Income', accountType: 'income' as const, priorBudget: 120_000, amount: 122_055 },
      { accountName: 'Landscaping', accountType: 'expense' as const, priorBudget: 24_000, amount: 26_883 },
      { accountName: 'Insurance', accountType: 'expense' as const, priorBudget: 10_000, amount: 9_682 },
    ],
  }

  it('refuses a resident before calling the model', async () => {
    h.gate = { ok: false, error: 'nope' }
    expect(await summarizeDraftBudget(input)).toEqual({ ok: false, error: 'nope' })
    expect(h.generateBudgetNarrative).not.toHaveBeenCalled()
  })

  it('hands the model finished figures computed here, and returns the changes list alongside', async () => {
    h.generateBudgetNarrative.mockResolvedValue('Landscaping rises the most, by $2,883.')
    const r = await summarizeDraftBudget(input)
    expect(r).toEqual({
      ok: true,
      narrative: 'Landscaping rises the most, by $2,883.',
      changes: [
        { accountName: 'Landscaping', accountType: 'expense', from: 24_000, to: 26_883, change: 2_883 },
        { accountName: 'Assessment Income', accountType: 'income', from: 120_000, to: 122_055, change: 2_055 },
        { accountName: 'Insurance', accountType: 'expense', from: 10_000, to: 9_682, change: -318 },
      ],
    })
    expect(h.generateBudgetNarrative).toHaveBeenCalledWith({
      yearLabel: 'FY 2027',
      fundName: 'Operating Fund',
      inflationPct: 3,
      totals: { income: '$122,055', expense: '$36,565', net: '$85,490', priorIncome: '$120,000', priorExpense: '$34,000' },
      changes: [
        { accountName: 'Landscaping', from: '$24,000', to: '$26,883', change: '+$2,883' },
        { accountName: 'Assessment Income', from: '$120,000', to: '$122,055', change: '+$2,055' },
        { accountName: 'Insurance', from: '$10,000', to: '$9,682', change: '-$318' },
      ],
    })
  })

  it('a rejected reply (an invented number) leaves the computed list on its own', async () => {
    h.generateBudgetNarrative.mockResolvedValue(null)
    const r = await summarizeDraftBudget(input)
    expect(r.ok && r.narrative).toBeNull()
    expect(r.ok && r.changes.length).toBe(3)
  })

  it('a model failure is a readable message; the log names the error type only', async () => {
    const err = new Error('upstream said: Landscaping $26,883 ...')
    h.generateBudgetNarrative.mockRejectedValue(err)
    const r = await summarizeDraftBudget(input)
    expect(r).toEqual({ ok: false, error: 'The AI summary isn’t available right now. The list of changes below is complete without it.' })
    expect(console.error).toHaveBeenCalledWith('[budget-draft] summary failed', 'Error')
  })
})
