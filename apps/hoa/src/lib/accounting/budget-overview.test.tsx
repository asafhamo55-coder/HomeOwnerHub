import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { budgetGlance, topOverBudget } from './budget-overview'
import type { BudgetVsActualRow } from './queries'
import { BudgetGlanceCard } from '@/app/(dashboard)/accounting/_components/BudgetGlanceCard'

// The vitest JSX transform is classic; the app's is automatic.
;(globalThis as { React?: typeof React }).React = React

const row =(n: string, budgeted: number, actual: number, accountType: 'income' | 'expense' = 'expense'): BudgetVsActualRow => ({
  accountId: `id-${n}`,
  accountNumber: n,
  accountName: `Line ${n}`,
  accountType,
  budgeted,
  actual,
  variance: budgeted - actual,
})

describe('topOverBudget', () => {
  it('returns the 3 largest overages, biggest first', () => {
    const out = topOverBudget([row('1', 100, 150), row('2', 100, 400), row('3', 100, 250), row('4', 100, 300), row('5', 100, 90)])
    expect(out.map((l) => l.accountNumber)).toEqual(['2', '4', '3'])
    expect(out[0]).toMatchObject({ over: 300, overPct: 300 })
  })

  it('breaks dollar ties by percent, then account number', () => {
    const out = topOverBudget([row('3', 200, 300), row('1', 100, 200), row('2', 100, 200)])
    expect(out.map((l) => l.accountNumber)).toEqual(['1', '2', '3'])
  })

  it('returns nothing when no expense line is over, and ignores income and exact matches', () => {
    expect(topOverBudget([row('1', 100, 100), row('2', 100, 40), row('3', 100, 900, 'income')])).toEqual([])
  })

  it('handles a zero budget line without dividing by zero', () => {
    const out = topOverBudget([row('1', 0, 75), row('2', 0, 0)])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ over: 75, overPct: null })
  })
})

describe('BudgetGlanceCard', () => {
  it('lists over-budget lines with money and a link to the report', () => {
    const html = renderToStaticMarkup(<BudgetGlanceCard glance={budgetGlance([row('1', 1000, 1250), row('2', 0, 40)])} />)
    expect(html).toContain('Line 1')
    expect(html).toContain('over by $250')
    expect(html).toContain('(25%)')
    expect(html).toContain('/accounting/reports/budget-vs-actual')
    expect(html).toContain('class="num"')
  })

  it('says all lines are within budget when nothing is over', () => {
    const html = renderToStaticMarkup(<BudgetGlanceCard glance={budgetGlance([row('1', 100, 50)])} />)
    expect(html).toContain('All lines are within budget so far')
  })

  it('offers to create a budget when none exists', () => {
    const html = renderToStaticMarkup(<BudgetGlanceCard glance={budgetGlance(null)} />)
    expect(html).toContain('No budget for this year yet')
    expect(html).toContain('/accounting/budget/new')
  })

  it('shows a small failure state when the read failed', () => {
    const html = renderToStaticMarkup(<BudgetGlanceCard glance={null} />)
    expect(html).toMatch(/couldn.t load/i)
  })
})
