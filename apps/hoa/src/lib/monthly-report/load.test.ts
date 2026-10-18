import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  reportError: vi.fn(),
  loadIncomeStatement: vi.fn(),
  loadBalanceSheet: vi.fn(),
  loadBudgetsVsActual: vi.fn(),
  loadDelinquency: vi.fn(),
  countPendingApprovals: vi.fn(),
}))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: m.reportError }))
vi.mock('@/lib/board-packet/financials', () => ({
  loadIncomeStatement: m.loadIncomeStatement,
  loadBalanceSheet: m.loadBalanceSheet,
  loadBudgetsVsActual: m.loadBudgetsVsActual,
}))
vi.mock('@/lib/board-packet/queries', () => ({ loadDelinquency: m.loadDelinquency }))
vi.mock('@/lib/approvals-inbox/load', () => ({ countPendingApprovals: m.countPendingApprovals }))

import { loadMonthlyReportData, periodForMonth } from './load'
import type { AccountingDb } from '@/lib/accounting/queries'

/** A chainable fake: records every filter, resolves `rows[table]` (or an error). */
function fakeDb(rows: Record<string, unknown[] | 'error'>) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      let from = 0
      for (const method of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'lt', 'order', 'range']) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          if (method === 'range') from = args[0] as number
          return chain
        }
      }
      chain.then = (resolve: (v: unknown) => void) => {
        const r = rows[table] ?? []
        // One page of rows, then an empty page (readAll pages to the end).
        resolve(r === 'error' ? { data: null, error: { code: '57014' } } : { data: from === 0 ? r : [], error: null })
      }
      return chain
    },
  }
  return { db: db as unknown as AccountingDb, calls }
}

const CTX = {
  orgId: 'org-1',
  associationId: 'assoc-1',
  associationName: 'Maple Creek HOA',
  timeZone: 'America/New_York',
  period: periodForMonth('2026-10-01'),
  today: '2026-10-01',
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.loadIncomeStatement.mockResolvedValue({ totalIncome: 100, totalExpenses: 40, netIncome: 60 })
  m.loadBalanceSheet.mockResolvedValue({ assets: [{ accountNumber: '1010', balance: 500 }] })
  m.loadBudgetsVsActual.mockResolvedValue([])
  m.loadDelinquency.mockResolvedValue({ totalOverdue: 900, unitCount: 2, aging: { d90_plus: 300 } })
  m.countPendingApprovals.mockResolvedValue({ w18: 1, bill: 0, w3: 0, vendor: 2 })
})

describe('loadMonthlyReportData', () => {
  it("uses the board packet's loaders for the month and the packet's as-of rules", async () => {
    const { db } = fakeDb({
      assessments: [{ amount: 300, due_date: '2026-09-01' }],
      payments: [{ amount: 200, paid_at: '2026-09-10T12:00:00Z' }],
      hoa_meeting_minutes: [{ id: 'mtg-1', meeting_date: '2026-10-14', meeting_type: 'regular' }],
    })
    const d = await loadMonthlyReportData(db, CTX)
    expect(m.loadIncomeStatement).toHaveBeenCalledWith('assoc-1', CTX.period, db)
    expect(m.loadBalanceSheet).toHaveBeenCalledWith('assoc-1', CTX.period, db)
    expect(m.loadBudgetsVsActual).toHaveBeenCalledWith('assoc-1', CTX.period, db)
    // Delinquency at the start of the 1st after the month (BL-051).
    expect(m.loadDelinquency).toHaveBeenCalledWith(db, 'assoc-1', '2026-10-01', 'America/New_York')
    expect(d).toMatchObject({
      period: { start: '2026-09-01', end: '2026-09-30', label: 'September 2026' },
      cash: { ok: true, data: { operating: 500, reserve: null } },
      collections: { ok: true, data: { billed: 300, collected: 200 } },
      delinquency: { ok: true, data: { total: 900, units: 2, over90: 300 } },
      budget: { ok: true, data: { hasBudget: false, top: [] } },
      approvals: { ok: true, data: 3 },
      meeting: { ok: true, data: { id: 'mtg-1' } },
    })
  })

  it('a failed read costs only its own section', async () => {
    m.loadBalanceSheet.mockRejectedValue(new Error('accounting query failed (57014)'))
    m.countPendingApprovals.mockResolvedValue({ w18: 1, bill: null, w3: 0, vendor: 0 })
    const { db } = fakeDb({ hoa_violations: 'error' })
    const d = await loadMonthlyReportData(db, CTX)
    expect(d.cash).toEqual({ ok: false })
    expect(d.violations).toEqual({ ok: false })
    expect(d.approvals).toEqual({ ok: false })
    expect(d.income.ok).toBe(true)
    expect(d.arc.ok).toBe(true)
  })

  it('scopes every one of its own reads by the org or association (the job reads with service role)', async () => {
    const { db, calls } = fakeDb({})
    await loadMonthlyReportData(db, CTX)
    const scoped = (table: string, column: string, id: string) =>
      calls.some((c) => c.table === table && c.method === 'eq' && c.args[0] === column && c.args[1] === id)
    expect(scoped('assessments', 'association_id', 'assoc-1')).toBe(true)
    expect(scoped('payments', 'assessment.association_id', 'assoc-1')).toBe(true)
    expect(scoped('hoa_violations', 'org_id', 'org-1')).toBe(true)
    expect(scoped('arc_requests', 'organization_id', 'org-1')).toBe(true)
    expect(scoped('hoa_meeting_minutes', 'org_id', 'org-1')).toBe(true)
    const tables = new Set(calls.map((c) => c.table))
    for (const t of tables) {
      expect(calls.some((c) => c.table === t && c.method === 'eq'), `${t} unscoped`).toBe(true)
    }
  })

  it('reads payments on the association\'s month boundaries, not UTC midnight', async () => {
    const { db, calls } = fakeDb({})
    await loadMonthlyReportData(db, CTX)
    const pay = calls.filter((c) => c.table === 'payments')
    expect(pay).toContainEqual({ table: 'payments', method: 'gte', args: ['paid_at', '2026-09-01T04:00:00.000Z'] })
    expect(pay).toContainEqual({ table: 'payments', method: 'lt', args: ['paid_at', '2026-10-01T04:00:00.000Z'] })
  })
})
