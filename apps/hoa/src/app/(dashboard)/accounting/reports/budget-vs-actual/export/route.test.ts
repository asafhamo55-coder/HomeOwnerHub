import { beforeEach, describe, expect, it, vi } from 'vitest'

const DENIED = 'Only board members and admins can make this change.'
let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = {
  ok: true,
  role: 'board',
  orgId: 'org-1',
}
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))

const compute = vi.fn()
const context = vi.fn()
vi.mock('@/lib/accounting/queries', () => ({
  computeBudgetVsActual: (...a: unknown[]) => compute(...a),
  getAccountingContext: () => context(),
}))

import { GET as rawGET } from './route'

const BUDGET = '11111111-1111-4111-8111-111111111111'
const GET = (qs = `?budget=${BUDGET}`) =>
  rawGET(new Request(`http://x/accounting/reports/budget-vs-actual/export${qs}`))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  compute.mockReset()
  context.mockReset()
  context.mockResolvedValue({ associationId: 'assoc-1', associationName: 'Oak Hollow HOA', timeZone: 'America/New_York' })
  compute.mockResolvedValue({
    rows: [
      { accountId: 'a1', accountNumber: '4000', accountName: 'Dues income', accountType: 'income', budgeted: 1000, actual: 1200.5, variance: 200.5 },
      { accountId: 'a2', accountNumber: '6100', accountName: 'Legal, "misc"', accountType: 'expense', budgeted: 0, actual: 300, variance: -300, unbudgeted: true },
    ],
  })
})

describe('GET budget-vs-actual export', () => {
  it('returns the CSV with an unbudgeted row flagged', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="budget-vs-actual-oak-hollow-hoa-2026-10-30.csv"',
    )
    const lines = (await res.text()).replace('﻿', '').trim().split('\r\n')
    expect(lines).toEqual([
      'Account,Type,Budgeted,Actual,Variance,Note',
      '4000 Dues income,Income,1000.00,1200.50,200.50,',
      '"6100 Legal, ""misc""",Expense,0.00,300.00,-300.00,Not in the budget',
    ])
    expect(compute).toHaveBeenCalledWith('assoc-1', BUDGET, {})
  })

  it('passes asOf through as the cutoff', async () => {
    await GET(`?budget=${BUDGET}&asOf=2026-06-30`)
    expect(compute).toHaveBeenCalledWith('assoc-1', BUDGET, { through: '2026-06-30' })
  })

  it('rejects a non-board user before reading', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(context).not.toHaveBeenCalled()
    expect(compute).not.toHaveBeenCalled()
  })

  it('returns the error envelope, not a 200 file, when the read fails', async () => {
    compute.mockRejectedValue(new Error('boom'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).not.toContain('text/csv')
    expect((await res.json()).error.code).toBe('internal')
  })

  it('returns 404 for a budget that is not in this association', async () => {
    compute.mockResolvedValue(null)
    expect((await GET()).status).toBe(404)
  })

  it('returns 400 without a budget id', async () => {
    expect((await GET('')).status).toBe(400)
  })
})
