import { describe, expect, it, vi } from 'vitest'

// financials.ts re-uses the accounting report queries; they need a Next
// request (cookies) and are covered by their own pages. Only the pure
// budget selection is under test here.
vi.mock('@/lib/accounting/queries', () => ({}))

import { pickBudgetsForPeriod } from './financials'
import type { BudgetSummary } from '@/lib/accounting/queries'

const budget = (id: string, fund: string, start: string, end: string, status = 'approved'): BudgetSummary => ({
  id,
  status,
  approved_at: null,
  fund: { id: fund, code: fund, name: fund },
  fiscalPeriod: { id: `fp-${start}`, start_date: start, end_date: end },
  totalAmount: 0,
  lineItemCount: 0,
})

const sept = { start: '2026-09-01', end: '2026-09-30', label: 'September 2026' }

describe('pickBudgetsForPeriod', () => {
  it('keeps budgets whose fiscal period covers the whole month, one per fund', () => {
    const picked = pickBudgetsForPeriod(
      [
        budget('op-2026', 'operating', '2026-01-01', '2026-12-31'),
        budget('res-2026', 'reserve', '2026-01-01', '2026-12-31'),
        budget('op-2025', 'operating', '2025-01-01', '2025-12-31'),
      ],
      sept,
    )
    expect(picked.map((b) => b.id).sort()).toEqual(['op-2026', 'res-2026'])
  })

  it('an approved budget wins over a draft for the same fund, in either order', () => {
    const draft = budget('draft', 'operating', '2026-01-01', '2026-12-31', 'draft')
    const approved = budget('approved', 'operating', '2026-01-01', '2026-12-31')
    expect(pickBudgetsForPeriod([draft, approved], sept).map((b) => b.id)).toEqual(['approved'])
    expect(pickBudgetsForPeriod([approved, draft], sept).map((b) => b.id)).toEqual(['approved'])
  })

  it('a fiscal year ending mid-month does not cover it', () => {
    expect(pickBudgetsForPeriod([budget('fy', 'operating', '2025-09-15', '2026-09-14')], sept)).toEqual([])
  })

  it('no budgets → empty, which the packet shows as "No budget covers this month"', () => {
    expect(pickBudgetsForPeriod([], sept)).toEqual([])
  })
})
