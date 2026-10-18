import type { Database } from '@homeowner-portal/db/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone, todayIn } from '@/lib/association-time'

/**
 * Every read below throws on a query error instead of resolving to `[]` /
 * zeros. Supabase resolves `{ data: null, error }` on an RLS denial or a
 * timeout; treating that as "no rows" made a failed trial balance read as
 * a balanced, empty one. Pages wrap these helpers in `tryLoad` and render
 * `LoadFailed` (docs/specs/2026-10-15-enterprise-ux-plan.md, finding 1).
 */
export function queryFailed(error: { code?: string; message?: string }): Error {
  return new Error(`accounting query failed (${error.code ?? 'no code'}): ${error.message ?? ''}`)
}

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

/**
 * A client the report helpers below can be handed instead of the request's
 * own (BL-073): the month-end board report runs in a background job with no
 * request and therefore no cookies, so it passes a service-role client and
 * scopes every read by association id itself. Omitted, each helper uses the
 * signed-in user's RLS client exactly as before.
 */
export type AccountingDb = ServerClient

/**
 * Every ledger line for `jeIds`. The id list is chunked (a long `.in()`
 * overflows the request URL) and each chunk is paged to the end, because
 * PostgREST caps a response at 1000 rows and a statement summed from a
 * capped read is silently wrong (UX decision 11).
 */
export async function readLedgerLines<T>(supabase: ServerClient, columns: string, jeIds: string[]): Promise<T[]> {
  const out: T[] = []
  for (const ids of chunk(jeIds)) {
    const rows = await readAll<T>(
      (from, to) =>
        supabase
          .from('ledger_entries')
          .select(columns)
          .in('journal_entry_id', ids)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
      queryFailed,
    )
    out.push(...rows)
  }
  return out
}

type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Fund = Row<'funds'>
export type ChartAccount = Row<'chart_of_accounts'>
export type FiscalPeriod = Row<'fiscal_periods'>
export type JournalEntry = Row<'journal_entries'>
export type LedgerEntry = Row<'ledger_entries'>
export type BankAccount = Row<'bank_accounts'>
export type BankTransaction = Row<'bank_transactions'>

export interface BankAccountWithFund extends BankAccount {
  fund: { code: string; name: string } | null
}

export interface BankTransactionRow {
  id: string
  amount: number
  posted_date: string
  memo: string | null
  merchant: string | null
  match_method: string | null
  match_confidence: number | null
  matched_journal_entry_id: string | null
  bank_account: { id: string; account_name: string; bank_name: string | null } | null
}

// ─── Budgets ─────────────────────────────────────────────────────────

export interface BudgetSummary {
  id: string
  status: string
  approved_at: string | null
  fund: { id: string; code: string; name: string } | null
  fiscalPeriod: { id: string; start_date: string; end_date: string } | null
  totalAmount: number
  lineItemCount: number
}

export async function listBudgets(associationId: string, client?: AccountingDb): Promise<BudgetSummary[]> {
  const supabase = client ?? (await getSupabaseServerClient())
  const { data, error: dataErr } = await supabase
    .from('budgets')
    .select(
      'id, status, approved_at, fund:fund_id(id, code, name), fiscalPeriod:fiscal_period_id(id, start_date, end_date), budget_line_items(amount)',
    )
    .eq('association_id', associationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (dataErr) throw queryFailed(dataErr)

  type Shape = {
    id: string
    status: string
    approved_at: string | null
    fund: { id: string; code: string; name: string } | null
    fiscalPeriod: { id: string; start_date: string; end_date: string } | null
    budget_line_items: { amount: number }[]
  }

  return ((data ?? []) as unknown as Shape[]).map((b) => ({
    id: b.id,
    status: b.status,
    approved_at: b.approved_at,
    fund: b.fund,
    fiscalPeriod: b.fiscalPeriod,
    totalAmount: (b.budget_line_items ?? []).reduce((s, l) => s + Number(l.amount), 0),
    lineItemCount: (b.budget_line_items ?? []).length,
  }))
}

export interface BudgetDetail {
  id: string
  status: string
  approved_at: string | null
  fund: { id: string; code: string; name: string } | null
  fiscalPeriod: { id: string; start_date: string; end_date: string } | null
  lineItems: {
    id: string
    accountId: string
    accountNumber: string
    accountName: string
    accountType: string
    amount: number
    notes: string | null
  }[]
}

export async function getBudget(
  associationId: string,
  budgetId: string,
): Promise<BudgetDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('budgets')
    .select(
      'id, status, approved_at, fund:fund_id(id, code, name), fiscalPeriod:fiscal_period_id(id, start_date, end_date), budget_line_items(id, amount, notes, account:account_id(id, account_number, account_name, account_type))',
    )
    .eq('id', budgetId)
    .eq('association_id', associationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (dataErr) throw queryFailed(dataErr)
  if (!data) return null

  type LiShape = {
    id: string
    amount: number
    notes: string | null
    account: {
      id: string
      account_number: string
      account_name: string
      account_type: string
    } | null
  }

  type Shape = {
    id: string
    status: string
    approved_at: string | null
    fund: { id: string; code: string; name: string } | null
    fiscalPeriod: { id: string; start_date: string; end_date: string } | null
    budget_line_items: LiShape[]
  }

  const b = data as unknown as Shape
  const lineItems = (b.budget_line_items ?? [])
    .filter((l) => l.account)
    .map((l) => ({
      id: l.id,
      accountId: l.account!.id,
      accountNumber: l.account!.account_number,
      accountName: l.account!.account_name,
      accountType: l.account!.account_type,
      amount: Number(l.amount),
      notes: l.notes,
    }))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

  return {
    id: b.id,
    status: b.status,
    approved_at: b.approved_at,
    fund: b.fund,
    fiscalPeriod: b.fiscalPeriod,
    lineItems,
  }
}

// ─── Reports: Balance Sheet, P&L, Cash Flow ──────────────────────────
//
// All reports compute live from posted ledger_entries — no caching, no
// stored balance columns. Posted entries only; drafts and reversed
// entries are excluded automatically. Status filtering happens via the
// `journal_entries.status = 'posted'` pre-filter.

export interface ReportLineRow {
  accountId: string
  accountNumber: string
  accountName: string
  accountType: AccountType
  /** Net per the account's normal balance sign — positive = normal direction. */
  balance: number
}

export interface BalanceSheet {
  /** Inclusive cutoff date. */
  asOfDate: string
  assets: ReportLineRow[]
  liabilities: ReportLineRow[]
  equity: ReportLineRow[]
  /** Net income for the period-to-date, included as a memo line in equity. */
  netIncomePtd: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  isBalanced: boolean
}

/**
 * Position at end-of-business on `asOfDate`. Sums every posted ledger
 * line from inception through that date. Net income period-to-date is
 * included in the equity section as a memo — closing entries (Phase 6d)
 * move it out of income/expense into the named equity accounts.
 */
export async function computeBalanceSheet(
  associationId: string,
  asOfDate: string,
  client?: AccountingDb,
): Promise<BalanceSheet> {
  const supabase = client ?? (await getSupabaseServerClient())

  // All posted JE ids with entry_date <= asOfDate. Inception-to-date runs
  // past PostgREST's 1000-row cap within a year or two, so both this and
  // the line read below page to the end (lib/supabase/read-all.ts).
  const jeRows = await readAll<{ id: string }>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id')
        .eq('association_id', associationId)
        .eq('status', 'posted')
        .lte('entry_date', asOfDate)
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )

  const jeIds = jeRows.map((r) => r.id)
  if (jeIds.length === 0) {
    return {
      asOfDate,
      assets: [],
      liabilities: [],
      equity: [],
      netIncomePtd: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      isBalanced: true,
    }
  }

  const lines = await readLedgerLines<LineShape>(
    supabase,
    'debit_amount, credit_amount, account:account_id(id, account_number, account_name, account_type)',
    jeIds,
  )

  type LineShape = {
    debit_amount: number
    credit_amount: number
    account: {
      id: string
      account_number: string
      account_name: string
      account_type: string
    } | null
  }

  const agg = new Map<string, ReportLineRow>()
  let totalIncome = 0
  let totalExpense = 0

  for (const l of (lines ?? []) as LineShape[]) {
    if (!l.account) continue
    const type = (l.account.account_type ?? 'asset') as AccountType
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)

    if (type === 'income') totalIncome += cr - dr
    if (type === 'expense') totalExpense += dr - cr

    if (type !== 'asset' && type !== 'liability' && type !== 'equity') continue

    const isNormalDebit = type === 'asset'
    const delta = isNormalDebit ? dr - cr : cr - dr

    const existing = agg.get(l.account.id)
    if (existing) {
      existing.balance += delta
    } else {
      agg.set(l.account.id, {
        accountId: l.account.id,
        accountNumber: l.account.account_number,
        accountName: l.account.account_name,
        accountType: type,
        balance: delta,
      })
    }
  }

  const rowsByType = (t: AccountType) =>
    [...agg.values()]
      .filter((r) => r.accountType === t)
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

  const assets = rowsByType('asset')
  const liabilities = rowsByType('liability')
  const equity = rowsByType('equity')

  const netIncomePtd = totalIncome - totalExpense

  const totalAssets = assets.reduce((s, r) => s + r.balance, 0)
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0)
  const totalEquity =
    equity.reduce((s, r) => s + r.balance, 0) + netIncomePtd

  // Two-cent tolerance against accumulated float drift in numeric(14,2)
  // sums — Postgres returns these as JS numbers via supabase-js.
  const isBalanced =
    Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01

  return {
    asOfDate,
    assets,
    liabilities,
    equity,
    netIncomePtd,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced,
  }
}

// ─── Income Statement (P&L) ─────────────────────────────────────────

export interface IncomeStatement {
  periodId: string
  startDate: string
  endDate: string
  basis: AccountingBasis
  income: ReportLineRow[]
  expenses: ReportLineRow[]
  totalIncome: number
  totalExpenses: number
  netIncome: number
}

/**
 * Accounting basis per spec §13.1 #5 — presentation toggle, never stored.
 *  - accrual: every posted JE counts toward income/expense (default; full DB).
 *  - cash:    only JEs that touched a cash account (1010/1020).
 *  - modified: cash for income (resident payments hit when they hit),
 *              accrual for expenses (vendor bills hit when they're billed,
 *              not when paid). HOA-standard per most state statutes.
 */
export type AccountingBasis = 'accrual' | 'cash' | 'modified'

export async function computeIncomeStatement(
  associationId: string,
  periodId: string,
  basis: AccountingBasis = 'accrual',
): Promise<IncomeStatement> {
  const supabase = await getSupabaseServerClient()

  const { data: period, error: periodErr } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('id', periodId)
    .maybeSingle()
  if (periodErr) throw queryFailed(periodErr)
  if (!period) {
    return {
      periodId,
      startDate: '',
      endDate: '',
      basis,
      income: [],
      expenses: [],
      totalIncome: 0,
      totalExpenses: 0,
      netIncome: 0,
    }
  }

  // JEs with their source so we can apply the basis filter per row. A
  // year of entries passes the 1000-row response cap, so page to the end.
  const jeRows = await readAll<{ id: string; source: string }>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id, source')
        .eq('association_id', associationId)
        .eq('fiscal_period_id', periodId)
        .eq('status', 'posted')
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )

  return {
    periodId,
    startDate: period.start_date,
    endDate: period.end_date,
    basis,
    ...(await incomeStatementLines(supabase, associationId, jeRows, basis)),
  }
}

/**
 * Income statement over a calendar date range rather than a fiscal period
 * — the board packet reports the month before the meeting, and fiscal
 * periods here are usually whole years. Posted JEs whose `entry_date`
 * falls in [startDate, endDate] (inclusive, 'YYYY-MM-DD'); the same basis
 * rules and aggregation as `computeIncomeStatement`. `periodId` is ''.
 */
export async function computeIncomeStatementForRange(
  associationId: string,
  startDate: string,
  endDate: string,
  basis: AccountingBasis = 'accrual',
  client?: AccountingDb,
): Promise<IncomeStatement> {
  const supabase = client ?? (await getSupabaseServerClient())
  const jeRows = await readAll<{ id: string; source: string }>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id, source')
        .eq('association_id', associationId)
        .eq('status', 'posted')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )
  return {
    periodId: '',
    startDate,
    endDate,
    basis,
    ...(await incomeStatementLines(supabase, associationId, jeRows, basis)),
  }
}

type IncomeStatementLines = Pick<IncomeStatement, 'income' | 'expenses' | 'totalIncome' | 'totalExpenses' | 'netIncome'>

/** Aggregates the income/expense lines of a set of posted JEs under `basis`. */
async function incomeStatementLines(
  supabase: ServerClient,
  associationId: string,
  jeRows: { id: string; source: string }[],
  basis: AccountingBasis,
): Promise<IncomeStatementLines> {
  const jeIds = jeRows.map((r) => r.id)
  if (jeIds.length === 0) {
    return { income: [], expenses: [], totalIncome: 0, totalExpenses: 0, netIncome: 0 }
  }
  const sourceByJe = new Map<string, string>(jeRows.map((r) => [r.id, r.source]))

  // Cash account ids — needed for the cash/modified basis filter, which
  // counts a line only if the JE it belongs to also touched cash.
  const cashAccountIds = new Set<string>()
  if (basis !== 'accrual') {
    const { data: cashAccts, error: cashAcctsErr } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('association_id', associationId)
      .in('account_number', ['1010', '1020'])
    if (cashAcctsErr) throw queryFailed(cashAcctsErr)
    for (const a of cashAccts ?? []) cashAccountIds.add(a.id)
  }

  const lines = await readLedgerLines<LineShape>(
    supabase,
    'journal_entry_id, debit_amount, credit_amount, account_id, account:account_id(id, account_number, account_name, account_type)',
    jeIds,
  )

  type LineShape = {
    journal_entry_id: string
    debit_amount: number
    credit_amount: number
    account_id: string
    account: {
      id: string
      account_number: string
      account_name: string
      account_type: string
    } | null
  }

  // For cash/modified basis, pre-compute which JEs touch cash. A line
  // counts only when the JE also moves cash.
  const jeTouchesCash = new Set<string>()
  if (basis !== 'accrual') {
    for (const l of (lines ?? []) as LineShape[]) {
      if (cashAccountIds.has(l.account_id)) jeTouchesCash.add(l.journal_entry_id)
    }
  }

  const agg = new Map<string, ReportLineRow>()
  for (const l of (lines ?? []) as LineShape[]) {
    if (!l.account) continue
    const type = (l.account.account_type ?? 'asset') as AccountType
    if (type !== 'income' && type !== 'expense') continue

    if (basis === 'cash') {
      if (!jeTouchesCash.has(l.journal_entry_id)) continue
    } else if (basis === 'modified') {
      // Modified accrual: income only when cash hits (so JE must touch cash);
      // expenses always (accrual). For an expense JE that's a payment,
      // the bill JE already booked the expense at accrual time — we'd
      // double-count if we also took the cash-side line. Filter here:
      // count expenses from non-bill-pay JEs (source != 'ap_invoice' OR
      // the JE doesn't touch cash).
      if (type === 'income' && !jeTouchesCash.has(l.journal_entry_id)) continue
      if (type === 'expense') {
        const source = sourceByJe.get(l.journal_entry_id)
        // Bill-pay JEs touch cash AND have source='ap_invoice'. Filter
        // them out for expenses to avoid double-counting against the
        // original bill JE (which also has source='ap_invoice' but
        // doesn't touch cash). Net effect: expense lines only come from
        // bill-entry JEs, not bill-pay JEs.
        if (source === 'ap_invoice' && jeTouchesCash.has(l.journal_entry_id)) continue
      }
    }

    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    // Income normal-balance is credit; expense is debit.
    const delta = type === 'income' ? cr - dr : dr - cr

    const existing = agg.get(l.account.id)
    if (existing) {
      existing.balance += delta
    } else {
      agg.set(l.account.id, {
        accountId: l.account.id,
        accountNumber: l.account.account_number,
        accountName: l.account.account_name,
        accountType: type,
        balance: delta,
      })
    }
  }

  const income = [...agg.values()]
    .filter((r) => r.accountType === 'income')
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
  const expenses = [...agg.values()]
    .filter((r) => r.accountType === 'expense')
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

  const totalIncome = income.reduce((s, r) => s + r.balance, 0)
  const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0)
  const netIncome = totalIncome - totalExpenses

  return { income, expenses, totalIncome, totalExpenses, netIncome }
}

// ─── Cash Flow ──────────────────────────────────────────────────────
//
// Simplified direct method: aggregate cash-account movements (the
// 1010 / 1020 accounts) during the period, categorized by the
// counterparty side of each JE. Inflows = JE lines that credit cash
// less than they debit it (i.e. net inbound). Outflows = the reverse.
// We bucket by the source field of the JE — ar_payment, ap_invoice,
// bank_rec, manual, etc.

export interface CashFlowRow {
  source: string
  inflow: number
  outflow: number
  net: number
}

export interface CashFlow {
  periodId: string
  startDate: string
  endDate: string
  rows: CashFlowRow[]
  openingCash: number
  closingCash: number
  totalNet: number
}

export async function computeCashFlow(
  associationId: string,
  periodId: string,
): Promise<CashFlow> {
  const supabase = await getSupabaseServerClient()

  const { data: period, error: periodErr } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('id', periodId)
    .maybeSingle()
  if (periodErr) throw queryFailed(periodErr)
  if (!period) {
    return {
      periodId,
      startDate: '',
      endDate: '',
      rows: [],
      openingCash: 0,
      closingCash: 0,
      totalNet: 0,
    }
  }

  // Cash accounts: 1010 (Cash—Operating), 1020 (Cash—Reserve).
  const { data: cashAccts, error: cashAcctsErr } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('association_id', associationId)
    .in('account_number', ['1010', '1020'])
  if (cashAcctsErr) throw queryFailed(cashAcctsErr)
  const cashIds = new Set((cashAccts ?? []).map((a) => a.id))

  // Opening balance: posted entries up to (but not including) start_date.
  // Inception-to-date, so both reads page to the end (BL-047) — a single
  // read stopped at PostgREST's 1000-row cap and understated opening cash.
  const priorJes = await readAll<{ id: string }>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id')
        .eq('association_id', associationId)
        .eq('status', 'posted')
        .lt('entry_date', period.start_date)
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )
  const priorIds = priorJes.map((r) => r.id)

  let openingCash = 0
  if (priorIds.length > 0 && cashIds.size > 0) {
    const priorLines = await readLedgerLines<{ debit_amount: number; credit_amount: number; account_id: string }>(
      supabase,
      'id, debit_amount, credit_amount, account_id',
      priorIds,
    )
    for (const l of priorLines) {
      if (!cashIds.has(l.account_id)) continue
      openingCash += Number(l.debit_amount) - Number(l.credit_amount)
    }
  }

  // Period movements grouped by source. Paged over the period's JEs; the
  // embedded lines are per-JE and not subject to the top-level row cap.
  type JeShape = {
    source: string
    lines: { debit_amount: number; credit_amount: number; account_id: string }[]
  }
  const periodJes = await readAll<JeShape>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id, source, lines:ledger_entries(debit_amount, credit_amount, account_id)')
        .eq('association_id', associationId)
        .eq('fiscal_period_id', periodId)
        .eq('status', 'posted')
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: JeShape[] | null; error: { code?: string; message?: string } | null }>,
    queryFailed,
  )

  const agg = new Map<string, CashFlowRow>()
  for (const je of periodJes) {
    let cashDelta = 0
    for (const l of je.lines ?? []) {
      if (!cashIds.has(l.account_id)) continue
      cashDelta += Number(l.debit_amount) - Number(l.credit_amount)
    }
    if (cashDelta === 0) continue
    const existing = agg.get(je.source) ?? {
      source: je.source,
      inflow: 0,
      outflow: 0,
      net: 0,
    }
    if (cashDelta > 0) existing.inflow += cashDelta
    else existing.outflow += -cashDelta
    existing.net += cashDelta
    agg.set(je.source, existing)
  }

  const rows = [...agg.values()].sort((a, b) => a.source.localeCompare(b.source))
  const totalNet = rows.reduce((s, r) => s + r.net, 0)

  return {
    periodId,
    startDate: period.start_date,
    endDate: period.end_date,
    rows,
    openingCash,
    closingCash: openingCash + totalNet,
    totalNet,
  }
}

// ─── Budget vs Actual ────────────────────────────────────────────────

export interface BudgetVsActualRow {
  accountId: string
  accountNumber: string
  accountName: string
  accountType: 'income' | 'expense'
  budgeted: number
  actual: number
  /** Variance, sign-corrected so positive is "favorable" — income over
   *  budget or expense under budget. */
  variance: number
}

export interface BudgetVsActual {
  budgetId: string
  fundCode: string | null
  startDate: string
  endDate: string
  /** The last day actuals were counted through, or null for the whole period. */
  actualsThrough: string | null
  rows: BudgetVsActualRow[]
  totals: {
    budgetedIncome: number
    actualIncome: number
    budgetedExpense: number
    actualExpense: number
    budgetedNet: number
    actualNet: number
    varianceNet: number
  }
}

/**
 * Compares an approved (or draft) budget against actuals from
 * ledger_entries for the same period. Posted JEs only. Returns one
 * row per budget line item; accounts that have actuals but no budget
 * line are NOT shown (the manager budgets explicitly).
 *
 * `through` ('YYYY-MM-DD', inclusive) stops the actuals at that day — the
 * board packet passes the end of its month (BL-051), so an entry posted
 * after the month doesn't show up in that month's packet. Omitted, every
 * posted entry in the fiscal period counts (the reports page). Budgeted
 * amounts are the full-period figures either way.
 */
export async function computeBudgetVsActual(
  associationId: string,
  budgetId: string,
  opts: { through?: string; client?: AccountingDb } = {},
): Promise<BudgetVsActual | null> {
  const through = opts.through ?? null
  const supabase = opts.client ?? (await getSupabaseServerClient())
  const { data: budget, error: budgetErr } = await supabase
    .from('budgets')
    .select(
      'id, fiscal_period_id, fund:fund_id(code), fiscalPeriod:fiscal_period_id(start_date, end_date), budget_line_items(account_id, amount, account:account_id(id, account_number, account_name, account_type))',
    )
    .eq('id', budgetId)
    .eq('association_id', associationId)
    .maybeSingle()
  if (budgetErr) throw queryFailed(budgetErr)
  if (!budget) return null

  type Shape = {
    id: string
    fiscal_period_id: string
    fund: { code: string } | null
    fiscalPeriod: { start_date: string; end_date: string } | null
    budget_line_items: {
      account_id: string
      amount: number
      account: {
        id: string
        account_number: string
        account_name: string
        account_type: string
      } | null
    }[]
  }
  const b = budget as unknown as Shape

  // Actuals: aggregate posted ledger entries for the period, only for
  // the accounts this budget references.
  const accountIds = (b.budget_line_items ?? [])
    .map((li) => li.account_id)
    .filter((x): x is string => !!x)

  const actualsByAccount = new Map<string, number>()
  if (accountIds.length > 0) {
    // Paged to the end: a year of entries passes the 1000-row cap.
    const jes = await readAll<{ id: string }>(
      (from, to) => {
        let q = supabase
          .from('journal_entries')
          .select('id')
          .eq('association_id', associationId)
          .eq('fiscal_period_id', b.fiscal_period_id)
          .eq('status', 'posted')
        // entry_date is the association's calendar day (BL-043), so a
        // plain date comparison is the cutoff — no instant involved.
        if (through) q = q.lte('entry_date', through)
        return q.order('id', { ascending: true }).range(from, to)
      },
      queryFailed,
    )
    const jeIds = jes.map((r) => r.id)
    if (jeIds.length > 0) {
      const budgeted = new Set(accountIds)
      const lines = (
        await readLedgerLines<{ debit_amount: number; credit_amount: number; account_id: string }>(
          supabase,
          'debit_amount, credit_amount, account_id',
          jeIds,
        )
      ).filter((l) => budgeted.has(l.account_id))
      for (const l of lines) {
        const prior = actualsByAccount.get(l.account_id) ?? 0
        actualsByAccount.set(
          l.account_id,
          prior + Number(l.debit_amount) - Number(l.credit_amount),
        )
      }
    }
  }

  const rows: BudgetVsActualRow[] = []
  let budgetedIncome = 0,
    actualIncome = 0,
    budgetedExpense = 0,
    actualExpense = 0

  for (const li of b.budget_line_items ?? []) {
    if (!li.account) continue
    const type = li.account.account_type as 'income' | 'expense'
    if (type !== 'income' && type !== 'expense') continue

    const budgeted = Number(li.amount)
    // Net debit-minus-credit; flip sign for income (credit = positive).
    const rawNet = actualsByAccount.get(li.account_id) ?? 0
    const actual = type === 'income' ? -rawNet : rawNet

    // Variance: positive = favorable.
    const variance = type === 'income' ? actual - budgeted : budgeted - actual

    rows.push({
      accountId: li.account.id,
      accountNumber: li.account.account_number,
      accountName: li.account.account_name,
      accountType: type,
      budgeted,
      actual,
      variance,
    })

    if (type === 'income') {
      budgetedIncome += budgeted
      actualIncome += actual
    } else {
      budgetedExpense += budgeted
      actualExpense += actual
    }
  }

  rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

  return {
    budgetId,
    fundCode: b.fund?.code ?? null,
    startDate: b.fiscalPeriod?.start_date ?? '',
    endDate: b.fiscalPeriod?.end_date ?? '',
    actualsThrough: through,
    rows,
    totals: {
      budgetedIncome,
      actualIncome,
      budgetedExpense,
      actualExpense,
      budgetedNet: budgetedIncome - budgetedExpense,
      actualNet: actualIncome - actualExpense,
      varianceNet: (actualIncome - actualExpense) - (budgetedIncome - budgetedExpense),
    },
  }
}

// ─── invoices ────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  amount: number
  status: string
  vendor: { id: string; legal_name: string; dba: string | null } | null
  payments: { amount: number; paid_at: string | null }[]
}

/** Inclusive row window for a paged list (see `pageRange` in the UI kit). */
export interface RowRange {
  from: number
  to: number
}

export interface Paged<T> {
  rows: T[]
  /** Every row matching the filters, not just this page. */
  total: number
}

export async function listInvoices(
  associationId: string,
  filters: { status?: string; limit?: number } = {},
): Promise<InvoiceRow[]> {
  const { rows } = await pageInvoices(associationId, filters, { from: 0, to: (filters.limit ?? 200) - 1 })
  return rows
}

export async function pageInvoices(
  associationId: string,
  filters: { status?: string },
  range: RowRange,
): Promise<Paged<InvoiceRow>> {
  const supabase = await getSupabaseServerClient()
  let q = supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_date, due_date, amount, status, vendor:vendor_id(id, legal_name, dba), payments(amount, paid_at)',
      { count: 'exact' },
    )
    .eq('association_id', associationId)
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false })
    .order('id', { ascending: false })
    .range(range.from, range.to)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error: dataErr, count } = await q
  if (dataErr) throw queryFailed(dataErr)
  const rows = (data ?? []) as unknown as InvoiceRow[]
  return { rows, total: count ?? rows.length }
}

export interface UnpaidInvoiceSummary {
  count: number
  /** Open balance (billed minus paid) across every unpaid invoice. */
  total: number
  overdueCount: number
  overdueTotal: number
}

/**
 * Headline numbers for unpaid bills, over EVERY unpaid invoice rather than
 * the visible page (the dues page learned this the hard way: a headline
 * summed from a capped list undercounts silently). Unpaid = received,
 * coded or approved; overdue = due before `today` ('YYYY-MM-DD').
 */
export async function summarizeUnpaidInvoices(
  associationId: string,
  today: string,
): Promise<UnpaidInvoiceSummary> {
  const supabase = await getSupabaseServerClient()
  // Paged to the end (BL-047): the old `.range(0, 49_999)` was still capped
  // at PostgREST's 1000 rows, so the headline stopped at 1000 invoices.
  type UnpaidRow = { amount: number; due_date: string | null; payments: { amount: number }[] }
  const data = await readAll<UnpaidRow>(
    (from, to) =>
      supabase
        .from('invoices')
        .select('id, amount, due_date, payments(amount)')
        .eq('association_id', associationId)
        .is('deleted_at', null)
        .in('status', ['received', 'coded', 'approved'])
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: UnpaidRow[] | null; error: { code?: string; message?: string } | null }>,
    queryFailed,
  )
  const out: UnpaidInvoiceSummary = { count: 0, total: 0, overdueCount: 0, overdueTotal: 0 }
  for (const r of data) {
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const open = Math.max(Number(r.amount) - paid, 0)
    out.count++
    out.total += open
    if (r.due_date && r.due_date < today) {
      out.overdueCount++
      out.overdueTotal += open
    }
  }
  return out
}

/** Journal entries still in draft (not yet on the books). */
export async function countDraftJournalEntries(associationId: string): Promise<number> {
  const supabase = await getSupabaseServerClient()
  const { count, error } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('association_id', associationId)
    .eq('status', 'draft')
  if (error) throw queryFailed(error)
  return count ?? 0
}

/** W18 cash-receipt postings waiting for a board decision. */
export async function countPendingProposals(organizationId: string, associationId: string): Promise<number> {
  const supabase = await getSupabaseServerClient()
  const { count, error } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('action_type', 'w18.cash_receipt')
    .eq('payload->>associationId', associationId)
    .in('status', ['proposed', 'approved'])
  if (error) throw queryFailed(error)
  return count ?? 0
}

export interface InvoiceDetail extends InvoiceRow {
  organization_id: string
  association_id: string
  ai_generated: boolean
  /** All JEs that touched this invoice — header + bill-pay, in order. */
  journalEntries: { id: string; entry_number: string; entry_date: string; memo: string; source: string }[]
}

export async function getInvoice(
  associationId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_date, due_date, amount, status, organization_id, association_id, ai_generated, vendor:vendor_id(id, legal_name, dba), payments(amount, paid_at, journal_entry_id)',
    )
    .eq('association_id', associationId)
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (dataErr) throw queryFailed(dataErr)
  if (!data) return null

  // JEs that reference this invoice. source_id is the invoice id for the
  // bill-itself JE, and the payment id for the bill-pay JE. We grab both
  // via the union of (a) JEs where source_id = invoice.id and (b) the JEs
  // this invoice's own payments point at.
  //
  // (b) used to list EVERY ap_invoice JE in the association and keep the
  // ones whose payment matched — a single read PostgREST caps at 1000 rows,
  // so past 1000 bill-pays the invoice's own entry could vanish from its
  // detail page (BL-053). The invoice's payments already name their JEs.
  const payments = (data.payments as { journal_entry_id: string | null }[] | null) ?? []
  const payJeIds = [...new Set(payments.map((p) => p.journal_entry_id).filter((x): x is string => !!x))]

  const { data: directJes, error: directJesErr } = await supabase
    .from('journal_entries')
    .select('id, entry_number, entry_date, memo, source')
    .eq('association_id', associationId)
    .eq('source_id', invoiceId)
    .order('entry_date', { ascending: true })
  if (directJesErr) throw queryFailed(directJesErr)

  // One invoice has a handful of payments, so this `.in()` is short.
  let payJesForThis: { id: string; entry_number: string; entry_date: string; memo: string; source: string }[] = []
  if (payJeIds.length > 0) {
    const { data: paymentJes, error: paymentJesErr } = await supabase
      .from('journal_entries')
      .select('id, entry_number, entry_date, memo, source')
      .eq('association_id', associationId)
      .eq('source', 'ap_invoice')
      .in('id', payJeIds)
    if (paymentJesErr) throw queryFailed(paymentJesErr)
    payJesForThis = paymentJes ?? []
  }

  const seen = new Set<string>()
  const merged: { id: string; entry_number: string; entry_date: string; memo: string; source: string }[] = []
  for (const je of [...(directJes ?? []), ...payJesForThis]) {
    if (seen.has(je.id)) continue
    seen.add(je.id)
    merged.push({
      id: je.id,
      entry_number: je.entry_number,
      entry_date: je.entry_date,
      memo: je.memo,
      source: je.source,
    })
  }
  merged.sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  return {
    ...(data as unknown as InvoiceRow),
    organization_id: data.organization_id,
    association_id: data.association_id,
    ai_generated: data.ai_generated,
    journalEntries: merged,
  }
}

export interface PaymentPlanRow {
  id: string
  total_amount: number
  installment_amount: number
  installment_count: number
  start_date: string
  status: string
  unit: { address_line1: string | null; unit_number: string | null } | null
}

/**
 * Every payment plan on this association's units, newest start first.
 *
 * payment_plans is org-scoped, so it is narrowed through the association's
 * unit ids. Both reads are paged to the end (BL-053): the unit list used to
 * be one read, so past 1000 units the plans on the rest were silently
 * missing. The id list is chunked to keep each request URL short.
 */
export async function loadPaymentPlans(associationId: string): Promise<PaymentPlanRow[]> {
  const supabase = await getSupabaseServerClient()
  type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>
  const units = await readAll<{ id: string }>(
    (from, to) =>
      supabase
        .from('units')
        .select('id')
        .eq('association_id', associationId)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<{ id: string }>,
    queryFailed,
  )
  const plans: PaymentPlanRow[] = []
  for (const ids of chunk(units.map((u) => u.id))) {
    const rows = await readAll<PaymentPlanRow>(
      (from, to) =>
        supabase
          .from('payment_plans')
          .select('id, total_amount, installment_amount, installment_count, start_date, status, unit:unit_id(address_line1, unit_number)')
          .in('unit_id', ids)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<PaymentPlanRow>,
      queryFailed,
    )
    plans.push(...rows)
  }
  return plans.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id))
}

export async function listBankAccounts(
  associationId: string,
): Promise<BankAccountWithFund[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('bank_accounts')
    .select(
      'id, organization_id, association_id, fund_id, plaid_item_id, plaid_account_id, account_name, bank_name, last4, current_balance, last_synced_at, is_active, created_at, fund:fund_id(code, name)',
    )
    .eq('association_id', associationId)
    .order('account_name')
  if (dataErr) throw queryFailed(dataErr)

  return ((data ?? []) as unknown as BankAccountWithFund[])
}

export interface ListBankTransactionFilters {
  bankAccountId?: string
  matched?: 'matched' | 'unmatched'
  limit?: number
}

export async function listBankTransactions(
  associationId: string,
  filters: ListBankTransactionFilters = {},
): Promise<BankTransactionRow[]> {
  const { rows } = await pageBankTransactions(associationId, filters, {
    from: 0,
    to: (filters.limit ?? 200) - 1,
  })
  return rows
}

export async function pageBankTransactions(
  associationId: string,
  filters: Omit<ListBankTransactionFilters, 'limit'>,
  range: RowRange,
): Promise<Paged<BankTransactionRow>> {
  const supabase = await getSupabaseServerClient()

  // bank_transactions is org-scoped, not association-scoped. Join through
  // bank_accounts to narrow to one association.
  const { data: accounts, error: accountsErr } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('association_id', associationId)
  if (accountsErr) throw queryFailed(accountsErr)
  const acctIds = (accounts ?? []).map((a) => a.id)
  if (acctIds.length === 0) return { rows: [], total: 0 }

  let q = supabase
    .from('bank_transactions')
    .select(
      'id, amount, posted_date, memo, merchant, match_method, match_confidence, matched_journal_entry_id, bank_account:bank_account_id(id, account_name, bank_name)',
      { count: 'exact' },
    )
    .in('bank_account_id', filters.bankAccountId ? [filters.bankAccountId] : acctIds)
    .order('posted_date', { ascending: false })
    .order('id', { ascending: false })
    .range(range.from, range.to)

  if (filters.matched === 'matched') {
    q = q.not('matched_journal_entry_id', 'is', null)
  } else if (filters.matched === 'unmatched') {
    q = q.is('matched_journal_entry_id', null)
  }

  const { data, error: dataErr, count } = await q
  if (dataErr) throw queryFailed(dataErr)
  const rows = (data ?? []) as unknown as BankTransactionRow[]
  return { rows, total: count ?? rows.length }
}

export interface AccountingContext {
  organizationId: string
  associationId: string
  associationName: string
  /** The latest period that has started (never a future one); null when none has. */
  currentPeriod: FiscalPeriod | null
  /**
   * The association's IANA zone (BL-043): what "today" means on every
   * accounting screen. Derived from its state until a timezone column exists.
   */
  timeZone: string
}

/**
 * One round-trip helper that every accounting page calls first. Returns
 * null when no HOA org is selected or the org has no association yet;
 * callers render `AccountingNotSetUp` (which can create it) in that case.
 * A failed association read THROWS (→ `AccountingLoadFailed`) instead of
 * reading as "not set up" (BL-046).
 */
export async function getAccountingContext(): Promise<AccountingContext | null> {
  const assocRes = await getPrimaryAssociationResult()
  if (!assocRes.ok) throw queryFailed({ code: 'association', message: 'primary association read failed' })
  const assoc = assocRes.data
  if (!assoc) return null

  const supabase = await getSupabaseServerClient()

  const { data: assocRow, error: assocRowErr } = await supabase
    .from('associations')
    .select(`organization_id, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('id', assoc.id)
    .maybeSingle()
  if (assocRowErr) throw queryFailed(assocRowErr)

  if (!assocRow) return null

  // The latest period that has STARTED on the association's day (BL-076):
  // next year, opened early, is not current until its first day.
  const timeZone = associationTimeZone(assocRow)
  const { data: period, error: periodErr } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('association_id', assoc.id)
    .lte('start_date', todayIn(timeZone))
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (periodErr) throw queryFailed(periodErr)

  return {
    organizationId: assocRow.organization_id,
    associationId: assoc.id,
    associationName: assoc.name,
    currentPeriod: period,
    timeZone,
  }
}

export async function listFunds(associationId: string): Promise<Fund[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('funds')
    .select('*')
    .eq('association_id', associationId)
    .order('code')
  if (dataErr) throw queryFailed(dataErr)
  return data ?? []
}

export async function listAccounts(
  associationId: string,
): Promise<ChartAccount[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('association_id', associationId)
    .order('account_number')
  if (dataErr) throw queryFailed(dataErr)
  return data ?? []
}

export async function listFiscalPeriods(
  associationId: string,
): Promise<FiscalPeriod[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error: dataErr } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('association_id', associationId)
    .order('start_date', { ascending: false })
  if (dataErr) throw queryFailed(dataErr)
  return data ?? []
}

// ─── JE list / detail ────────────────────────────────────────────────

export interface JournalEntrySummary {
  id: string
  entry_number: string
  entry_date: string
  memo: string
  source: string
  status: string
  ai_generated: boolean
  /** Sum of debits = sum of credits for posted entries; one is enough. */
  totalAmount: number
  lineCount: number
}

export interface ListLedgerFilters {
  periodId?: string
  source?: string
  status?: string
  limit?: number
}

export async function listJournalEntries(
  associationId: string,
  filters: ListLedgerFilters = {},
): Promise<JournalEntrySummary[]> {
  const { rows } = await pageJournalEntries(associationId, filters, {
    from: 0,
    to: (filters.limit ?? 200) - 1,
  })
  return rows
}

export async function pageJournalEntries(
  associationId: string,
  filters: Omit<ListLedgerFilters, 'limit'>,
  range: RowRange,
): Promise<Paged<JournalEntrySummary>> {
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('journal_entries')
    .select(
      'id, entry_number, entry_date, memo, source, status, ai_generated, lines:ledger_entries(debit_amount)',
      { count: 'exact' },
    )
    .eq('association_id', associationId)
    .order('entry_date', { ascending: false })
    .order('entry_number', { ascending: false })
    .range(range.from, range.to)

  if (filters.periodId) query = query.eq('fiscal_period_id', filters.periodId)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error: dataErr, count } = await query
  if (dataErr) throw queryFailed(dataErr)

  const rows = (data ?? []).map((r) => {
    const lines = (r.lines ?? []) as { debit_amount: number }[]
    const total = lines.reduce((s, l) => s + Number(l.debit_amount), 0)
    return {
      id: r.id,
      entry_number: r.entry_number,
      entry_date: r.entry_date,
      memo: r.memo,
      source: r.source,
      status: r.status,
      ai_generated: r.ai_generated,
      totalAmount: total,
      lineCount: lines.length,
    }
  })
  return { rows, total: count ?? rows.length }
}

export interface JournalEntryDetail {
  header: JournalEntry
  lines: {
    id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
    account: { id: string; account_number: string; account_name: string; account_type: string }
    fund: { id: string; code: string; name: string }
  }[]
}

export async function getJournalEntry(
  associationId: string,
  id: string,
): Promise<JournalEntryDetail | null> {
  const supabase = await getSupabaseServerClient()

  const { data: header, error: headerErr } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('association_id', associationId)
    .eq('id', id)
    .maybeSingle()
  if (headerErr) throw queryFailed(headerErr)

  if (!header) return null

  const { data: lines, error: linesErr } = await supabase
    .from('ledger_entries')
    .select(
      'id, debit_amount, credit_amount, memo, account:account_id(id, account_number, account_name, account_type), fund:fund_id(id, code, name)',
    )
    .eq('journal_entry_id', id)
  if (linesErr) throw queryFailed(linesErr)

  type LineShape = {
    id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
    account: { id: string; account_number: string; account_name: string; account_type: string } | null
    fund: { id: string; code: string; name: string } | null
  }

  const cleanLines = ((lines ?? []) as LineShape[])
    .filter((l) => l.account && l.fund)
    .map((l) => ({
      id: l.id,
      debit_amount: Number(l.debit_amount),
      credit_amount: Number(l.credit_amount),
      memo: l.memo,
      account: l.account!,
      fund: l.fund!,
    }))

  return { header, lines: cleanLines }
}

// ─── Trial balance ───────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface TrialBalanceRow {
  accountId: string
  accountNumber: string
  accountName: string
  accountType: AccountType
  totalDebits: number
  totalCredits: number
  /** Net balance with the account's normal-balance sign applied. */
  balance: number
  isNormalDebit: boolean
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebits: number
  totalCredits: number
}

/** Compute a period-bounded trial balance from ledger_entries.
 *
 *  Posted entries only — drafts and reversed entries do not appear. We pull
 *  every line in the period in one query and aggregate in memory; for the
 *  data sizes a single HOA generates per period (low thousands of rows)
 *  this is cheaper than a per-account SQL aggregation.
 */
export async function computeTrialBalance(
  associationId: string,
  periodId: string,
): Promise<TrialBalance> {
  const supabase = await getSupabaseServerClient()

  // JE ids in this period, posted only. Both reads page to the end
  // (BL-047): a busy period passes PostgREST's 1000-row cap, and a trial
  // balance summed from a capped read is silently wrong.
  const jeRows = await readAll<{ id: string }>(
    (from, to) =>
      supabase
        .from('journal_entries')
        .select('id')
        .eq('association_id', associationId)
        .eq('fiscal_period_id', periodId)
        .eq('status', 'posted')
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )

  const jeIds = jeRows.map((r) => r.id)
  if (jeIds.length === 0) {
    return { rows: [], totalDebits: 0, totalCredits: 0 }
  }

  const lines = await readLedgerLines<LineShape>(
    supabase,
    'id, debit_amount, credit_amount, account:account_id(id, account_number, account_name, account_type)',
    jeIds,
  )

  type LineShape = {
    debit_amount: number
    credit_amount: number
    account: {
      id: string
      account_number: string
      account_name: string
      account_type: string
    } | null
  }

  const agg = new Map<string, TrialBalanceRow>()
  let totalDr = 0
  let totalCr = 0

  for (const l of lines) {
    if (!l.account) continue
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    totalDr += dr
    totalCr += cr

    const existing = agg.get(l.account.id)
    const type = (l.account.account_type ?? 'asset') as AccountType
    const isNormalDebit = type === 'asset' || type === 'expense'

    if (existing) {
      existing.totalDebits += dr
      existing.totalCredits += cr
      existing.balance = isNormalDebit
        ? existing.totalDebits - existing.totalCredits
        : existing.totalCredits - existing.totalDebits
    } else {
      const totalDebits = dr
      const totalCredits = cr
      agg.set(l.account.id, {
        accountId: l.account.id,
        accountNumber: l.account.account_number,
        accountName: l.account.account_name,
        accountType: type,
        totalDebits,
        totalCredits,
        balance: isNormalDebit ? totalDebits - totalCredits : totalCredits - totalDebits,
        isNormalDebit,
      })
    }
  }

  const rows = [...agg.values()].sort((a, b) =>
    a.accountNumber.localeCompare(b.accountNumber),
  )

  return { rows, totalDebits: totalDr, totalCredits: totalCr }
}
