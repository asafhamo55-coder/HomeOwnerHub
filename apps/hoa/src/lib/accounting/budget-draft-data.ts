import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import { queryFailed, readLedgerLines, type AccountingDb } from './queries'
import { isReserveContribution, type DraftSource, type DraftSourceAccount } from './budget-draft'
import { withoutClosingEntries } from './closing-entries'

/**
 * BL-029 — everything the budget draft is computed from, read for one
 * fund. Read-only. The numbers themselves are decided in budget-draft.ts.
 *
 *   - target: the fiscal year to draft. Defaults to the first period that
 *     starts after today ("next year"); any period from the current year on
 *     with no budget yet for this fund can be chosen instead.
 *   - source: last year's budget — the latest budget for this fund whose
 *     year starts before the target (approved over draft over archived).
 *   - actuals: the trailing 12 months to today, posted entries only, this
 *     fund's ledger lines only, closing entries left out (a year-end close
 *     reverses every income and expense balance, which would read as a
 *     year with no activity). Paged past the 1000-row cap.
 */

export interface DraftFund {
  id: string
  code: string
  name: string
  fundType: string
}

export interface DraftPeriod {
  id: string
  startDate: string
  endDate: string
}

export interface BudgetDraftInputs {
  funds: DraftFund[]
  fund: DraftFund | null
  /** Years a draft can be saved to (no budget yet for this fund), oldest first. */
  targets: DraftPeriod[]
  target: DraftPeriod | null
  /** Set when no fiscal period starts after today: the year the draft is for but the books don't have yet. */
  nextYearMissing: { startDate: string; endDate: string } | null
  source: { budgetId: string; status: string; startDate: string; endDate: string } | null
  window: { from: string; through: string }
  draftSource: DraftSource
}

const STATUS_RANK: Record<string, number> = { approved: 0, draft: 1, archived: 2 }

/** 'YYYY-MM-DD' ± whole days / years, as calendar arithmetic in UTC (no zone can shift it). */
function shiftDate(iso: string, opts: { days?: number; years?: number }): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (opts.years) d.setUTCFullYear(d.getUTCFullYear() + opts.years)
  if (opts.days) d.setUTCDate(d.getUTCDate() + opts.days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export async function loadBudgetDraftInputs(opts: {
  associationId: string
  fundId?: string | null
  targetPeriodId?: string | null
  /** The association's today, 'YYYY-MM-DD'. */
  today: string
  client?: AccountingDb
}): Promise<BudgetDraftInputs> {
  const { associationId, today } = opts
  const supabase = opts.client ?? (await getSupabaseServerClient())

  const [fundsRes, periodsRes] = await Promise.all([
    supabase.from('funds').select('id, code, name, fund_type, is_active').eq('association_id', associationId).order('code'),
    supabase.from('fiscal_periods').select('id, start_date, end_date').eq('association_id', associationId).order('start_date'),
  ])
  if (fundsRes.error) throw queryFailed(fundsRes.error)
  if (periodsRes.error) throw queryFailed(periodsRes.error)

  const funds: DraftFund[] = ((fundsRes.data ?? []) as { id: string; code: string; name: string; fund_type: string; is_active: boolean }[])
    .filter((f) => f.is_active !== false)
    .map((f) => ({ id: f.id, code: f.code, name: f.name, fundType: f.fund_type }))
  const fund =
    funds.find((f) => f.id === opts.fundId) ?? funds.find((f) => f.fundType === 'operating') ?? funds[0] ?? null

  const periods: DraftPeriod[] = ((periodsRes.data ?? []) as { id: string; start_date: string; end_date: string }[])
    .map((p) => ({ id: p.id, startDate: p.start_date, endDate: p.end_date }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const through = today
  const from = shiftDate(today, { years: -1, days: 1 })
  const window = { from, through }

  const emptySource: DraftSource = { accounts: [], priorBudget: {}, actuals: {}, actualMonths: 0, reserveAccountIds: [] }
  const current = periods.find((p) => p.startDate <= today && today <= p.endDate) ?? null
  const latest = periods[periods.length - 1] ?? null
  const nextYearMissing =
    periods.some((p) => p.startDate > today)
      ? null
      : (() => {
          const base = current ?? latest
          const startDate = base ? shiftDate(base.endDate, { days: 1 }) : `${Number(today.slice(0, 4)) + 1}-01-01`
          return { startDate, endDate: shiftDate(shiftDate(startDate, { years: 1 }), { days: -1 }) }
        })()

  if (!fund) {
    return { funds, fund: null, targets: [], target: null, nextYearMissing, source: null, window, draftSource: emptySource }
  }

  // ─── Budgets for this fund ─────────────────────────────────────────
  const budgetsRes = await supabase
    .from('budgets')
    .select('id, status, fiscal_period_id, fiscalPeriod:fiscal_period_id(start_date, end_date), budget_line_items(account_id, amount)')
    .eq('association_id', associationId)
    .eq('fund_id', fund.id)
    .is('deleted_at', null)
  if (budgetsRes.error) throw queryFailed(budgetsRes.error)
  type BudgetShape = {
    id: string
    status: string
    fiscal_period_id: string
    fiscalPeriod: { start_date: string; end_date: string } | null
    budget_line_items: { account_id: string; amount: number }[] | null
  }
  const budgets = ((budgetsRes.data ?? []) as unknown as BudgetShape[]).filter((b) => b.fiscalPeriod)
  const budgeted = new Set(budgets.map((b) => b.fiscal_period_id))

  const fromStart = current?.startDate ?? today
  const targets = periods.filter((p) => p.startDate >= fromStart && !budgeted.has(p.id))
  const target =
    targets.find((t) => t.id === opts.targetPeriodId) ?? targets.find((t) => t.startDate > today) ?? targets[0] ?? null

  const before = target?.startDate ?? nextYearMissing?.startDate ?? shiftDate(today, { days: 1 })
  const sourceBudget =
    budgets
      .filter((b) => b.fiscalPeriod!.start_date < before)
      .sort(
        (a, b) =>
          b.fiscalPeriod!.start_date.localeCompare(a.fiscalPeriod!.start_date) ||
          (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
      )[0] ?? null

  const priorBudget: Record<string, number> = {}
  for (const li of sourceBudget?.budget_line_items ?? []) {
    priorBudget[li.account_id] = (priorBudget[li.account_id] ?? 0) + Number(li.amount)
  }

  // ─── Accounts ──────────────────────────────────────────────────────
  const coaRes = await supabase
    .from('chart_of_accounts')
    .select('id, account_number, account_name, account_type, fund_id, is_active')
    .eq('association_id', associationId)
    .in('account_type', ['income', 'expense'])
  if (coaRes.error) throw queryFailed(coaRes.error)
  type CoaShape = { id: string; account_number: string; account_name: string; account_type: string; fund_id: string | null; is_active: boolean }
  const coa = (coaRes.data ?? []) as CoaShape[]
  const ownFund = (a: CoaShape) => a.fund_id === fund.id || (a.fund_id === null && fund.fundType === 'operating')
  const accounts: DraftSourceAccount[] = coa
    .filter((a) => a.account_type === 'income' || a.account_type === 'expense')
    .filter((a) => (ownFund(a) && a.is_active !== false) || a.id in priorBudget)
    .map((a) => ({ id: a.id, number: a.account_number, name: a.account_name, type: a.account_type as 'income' | 'expense' }))
    .sort((a, b) => a.number.localeCompare(b.number))
  const typeById = new Map(accounts.map((a) => [a.id, a.type]))
  const reserveAccountIds = accounts.filter((a) => isReserveContribution(a, fund.fundType)).map((a) => a.id)

  // ─── Trailing 12 months of actuals ─────────────────────────────────
  const booksStart = periods[0]?.startDate ?? null
  const effectiveFrom = booksStart && booksStart > from ? booksStart : from
  const actualMonths =
    !booksStart || effectiveFrom > through ? 0 : Math.min(12, Math.round((daysBetween(effectiveFrom, through) + 1) / (365.25 / 12)))

  const actuals: Record<string, number> = {}
  if (actualMonths > 0 && accounts.length > 0) {
    const jes = await readAll<{ id: string; source: string | null }>(
      (f, t) =>
        supabase
          .from('journal_entries')
          .select('id, source')
          .eq('association_id', associationId)
          .eq('status', 'posted')
          .gte('entry_date', from)
          .lte('entry_date', through)
          .order('id', { ascending: true })
          .range(f, t),
      queryFailed,
    )
    const jeIds = withoutClosingEntries(jes).map((j) => j.id)
    if (jeIds.length > 0) {
      const lines = await readLedgerLines<{ account_id: string; fund_id: string; debit_amount: number; credit_amount: number }>(
        supabase,
        'account_id, fund_id, debit_amount, credit_amount',
        jeIds,
      )
      for (const l of lines) {
        if (l.fund_id !== fund.id) continue
        const type = typeById.get(l.account_id)
        if (!type) continue
        const net = Number(l.debit_amount) - Number(l.credit_amount)
        actuals[l.account_id] = (actuals[l.account_id] ?? 0) + (type === 'income' ? -net : net)
      }
    }
  }

  return {
    funds,
    fund,
    targets,
    target,
    nextYearMissing,
    source: sourceBudget
      ? {
          budgetId: sourceBudget.id,
          status: sourceBudget.status,
          startDate: sourceBudget.fiscalPeriod!.start_date,
          endDate: sourceBudget.fiscalPeriod!.end_date,
        }
      : null,
    window,
    draftSource: { accounts, priorBudget, actuals, actualMonths, reserveAccountIds },
  }
}
