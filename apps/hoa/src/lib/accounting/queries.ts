import type { Database } from '@homeowner-portal/db/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

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

export async function listBudgets(associationId: string): Promise<BudgetSummary[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('budgets')
    .select(
      'id, status, approved_at, fund:fund_id(id, code, name), fiscalPeriod:fiscal_period_id(id, start_date, end_date), budget_line_items(amount)',
    )
    .eq('association_id', associationId)
    .order('created_at', { ascending: false })

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
  const { data } = await supabase
    .from('budgets')
    .select(
      'id, status, approved_at, fund:fund_id(id, code, name), fiscalPeriod:fiscal_period_id(id, start_date, end_date), budget_line_items(id, amount, notes, account:account_id(id, account_number, account_name, account_type))',
    )
    .eq('id', budgetId)
    .eq('association_id', associationId)
    .maybeSingle()
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
): Promise<BalanceSheet> {
  const supabase = await getSupabaseServerClient()

  // All posted JE ids with entry_date <= asOfDate.
  const { data: jeRows } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('association_id', associationId)
    .eq('status', 'posted')
    .lte('entry_date', asOfDate)

  const jeIds = (jeRows ?? []).map((r) => r.id)
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

  const { data: lines } = await supabase
    .from('ledger_entries')
    .select(
      'debit_amount, credit_amount, account:account_id(id, account_number, account_name, account_type)',
    )
    .in('journal_entry_id', jeIds)

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

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('id', periodId)
    .single()
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

  // JEs with their source so we can apply the basis filter per row.
  const { data: jeRows } = await supabase
    .from('journal_entries')
    .select('id, source')
    .eq('association_id', associationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted')

  const jeIds = (jeRows ?? []).map((r) => r.id)
  if (jeIds.length === 0) {
    return {
      periodId,
      startDate: period.start_date,
      endDate: period.end_date,
      basis,
      income: [],
      expenses: [],
      totalIncome: 0,
      totalExpenses: 0,
      netIncome: 0,
    }
  }
  const sourceByJe = new Map<string, string>(
    (jeRows ?? []).map((r) => [r.id, r.source]),
  )

  // Cash account ids — needed for the cash/modified basis filter, which
  // counts a line only if the JE it belongs to also touched cash.
  const cashAccountIds = new Set<string>()
  if (basis !== 'accrual') {
    const { data: cashAccts } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('association_id', associationId)
      .in('account_number', ['1010', '1020'])
    for (const a of cashAccts ?? []) cashAccountIds.add(a.id)
  }

  const { data: lines } = await supabase
    .from('ledger_entries')
    .select(
      'journal_entry_id, debit_amount, credit_amount, account_id, account:account_id(id, account_number, account_name, account_type)',
    )
    .in('journal_entry_id', jeIds)

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

  return {
    periodId,
    startDate: period.start_date,
    endDate: period.end_date,
    basis,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    netIncome,
  }
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

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('id', periodId)
    .single()
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
  const { data: cashAccts } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('association_id', associationId)
    .in('account_number', ['1010', '1020'])
  const cashIds = new Set((cashAccts ?? []).map((a) => a.id))

  // Opening balance: posted entries up to (but not including) start_date.
  const { data: priorJes } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('association_id', associationId)
    .eq('status', 'posted')
    .lt('entry_date', period.start_date)
  const priorIds = (priorJes ?? []).map((r) => r.id)

  let openingCash = 0
  if (priorIds.length > 0 && cashIds.size > 0) {
    const { data: priorLines } = await supabase
      .from('ledger_entries')
      .select('debit_amount, credit_amount, account_id')
      .in('journal_entry_id', priorIds)
    for (const l of priorLines ?? []) {
      if (!cashIds.has(l.account_id)) continue
      openingCash += Number(l.debit_amount) - Number(l.credit_amount)
    }
  }

  // Period movements grouped by source.
  const { data: periodJes } = await supabase
    .from('journal_entries')
    .select(
      'id, source, lines:ledger_entries(debit_amount, credit_amount, account_id)',
    )
    .eq('association_id', associationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted')

  type JeShape = {
    source: string
    lines: { debit_amount: number; credit_amount: number; account_id: string }[]
  }

  const agg = new Map<string, CashFlowRow>()
  for (const je of (periodJes ?? []) as JeShape[]) {
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
 */
export async function computeBudgetVsActual(
  associationId: string,
  budgetId: string,
): Promise<BudgetVsActual | null> {
  const supabase = await getSupabaseServerClient()
  const { data: budget } = await supabase
    .from('budgets')
    .select(
      'id, fiscal_period_id, fund:fund_id(code), fiscalPeriod:fiscal_period_id(start_date, end_date), budget_line_items(account_id, amount, account:account_id(id, account_number, account_name, account_type))',
    )
    .eq('id', budgetId)
    .eq('association_id', associationId)
    .maybeSingle()
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
    const { data: jes } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('association_id', associationId)
      .eq('fiscal_period_id', b.fiscal_period_id)
      .eq('status', 'posted')
    const jeIds = (jes ?? []).map((r) => r.id)
    if (jeIds.length > 0) {
      const { data: lines } = await supabase
        .from('ledger_entries')
        .select('debit_amount, credit_amount, account_id')
        .in('journal_entry_id', jeIds)
        .in('account_id', accountIds)
      for (const l of lines ?? []) {
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

export async function listInvoices(
  associationId: string,
  filters: { status?: string; limit?: number } = {},
): Promise<InvoiceRow[]> {
  const supabase = await getSupabaseServerClient()
  let q = supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_date, due_date, amount, status, vendor:vendor_id(id, legal_name, dba), payments(amount, paid_at)',
    )
    .eq('association_id', associationId)
    .order('invoice_date', { ascending: false })
    .limit(filters.limit ?? 200)
  if (filters.status) q = q.eq('status', filters.status)
  const { data } = await q
  return ((data ?? []) as unknown as InvoiceRow[])
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
  const { data } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_date, due_date, amount, status, organization_id, association_id, ai_generated, vendor:vendor_id(id, legal_name, dba), payments(amount, paid_at)',
    )
    .eq('association_id', associationId)
    .eq('id', invoiceId)
    .maybeSingle()
  if (!data) return null

  // JEs that reference this invoice. source_id is the invoice id for the
  // bill-itself JE, and the payment id for the bill-pay JE. We grab both
  // via the union of (a) JEs where source_id = invoice.id and (b) JEs
  // referenced by payments tied to this invoice.
  const payIds = (data.payments as { amount: number; paid_at: string | null }[] | null) ?? []
  void payIds

  const { data: directJes } = await supabase
    .from('journal_entries')
    .select('id, entry_number, entry_date, memo, source')
    .eq('association_id', associationId)
    .eq('source_id', invoiceId)
    .order('entry_date', { ascending: true })

  const { data: paymentJes } = await supabase
    .from('journal_entries')
    .select('id, entry_number, entry_date, memo, source, payments!payments_journal_entry_id_fkey(invoice_id)')
    .eq('association_id', associationId)
    .eq('source', 'ap_invoice')

  type PayJe = {
    id: string
    entry_number: string
    entry_date: string
    memo: string
    source: string
    payments: { invoice_id: string | null }[]
  }
  const payJesForThis = ((paymentJes ?? []) as unknown as PayJe[]).filter((je) =>
    (je.payments ?? []).some((p) => p.invoice_id === invoiceId),
  )

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

export async function listBankAccounts(
  associationId: string,
): Promise<BankAccountWithFund[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('bank_accounts')
    .select(
      'id, organization_id, association_id, fund_id, plaid_item_id, plaid_account_id, account_name, bank_name, last4, current_balance, last_synced_at, is_active, created_at, fund:fund_id(code, name)',
    )
    .eq('association_id', associationId)
    .order('account_name')

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
  const supabase = await getSupabaseServerClient()

  // bank_transactions is org-scoped, not association-scoped. Join through
  // bank_accounts to narrow to one association.
  const { data: accounts } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('association_id', associationId)
  const acctIds = (accounts ?? []).map((a) => a.id)
  if (acctIds.length === 0) return []

  let q = supabase
    .from('bank_transactions')
    .select(
      'id, amount, posted_date, memo, merchant, match_method, match_confidence, matched_journal_entry_id, bank_account:bank_account_id(id, account_name, bank_name)',
    )
    .in('bank_account_id', filters.bankAccountId ? [filters.bankAccountId] : acctIds)
    .order('posted_date', { ascending: false })
    .limit(filters.limit ?? 200)

  if (filters.matched === 'matched') {
    q = q.not('matched_journal_entry_id', 'is', null)
  } else if (filters.matched === 'unmatched') {
    q = q.is('matched_journal_entry_id', null)
  }

  const { data } = await q
  return ((data ?? []) as unknown as BankTransactionRow[])
}

export interface AccountingContext {
  organizationId: string
  associationId: string
  associationName: string
  /** Open or most recent period; null when nothing has been seeded yet. */
  currentPeriod: FiscalPeriod | null
}

/**
 * One round-trip helper that every accounting page calls first. Returns
 * null when no HOA org is selected or no association has been seeded;
 * callers render a "Run seed:accounting" empty state in that case.
 */
export async function getAccountingContext(): Promise<AccountingContext | null> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return null

  const supabase = await getSupabaseServerClient()

  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()

  if (!assocRow) return null

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('association_id', assoc.id)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    organizationId: assocRow.organization_id,
    associationId: assoc.id,
    associationName: assoc.name,
    currentPeriod: period,
  }
}

export async function listFunds(associationId: string): Promise<Fund[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('funds')
    .select('*')
    .eq('association_id', associationId)
    .order('code')
  return data ?? []
}

export async function listAccounts(
  associationId: string,
): Promise<ChartAccount[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('association_id', associationId)
    .order('account_number')
  return data ?? []
}

export async function listFiscalPeriods(
  associationId: string,
): Promise<FiscalPeriod[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('association_id', associationId)
    .order('start_date', { ascending: false })
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
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('journal_entries')
    .select(
      'id, entry_number, entry_date, memo, source, status, ai_generated, lines:ledger_entries(debit_amount)',
    )
    .eq('association_id', associationId)
    .order('entry_date', { ascending: false })
    .order('entry_number', { ascending: false })
    .limit(filters.limit ?? 200)

  if (filters.periodId) query = query.eq('fiscal_period_id', filters.periodId)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.status) query = query.eq('status', filters.status)

  const { data } = await query

  return (data ?? []).map((r) => {
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

  const { data: header } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('association_id', associationId)
    .eq('id', id)
    .maybeSingle()

  if (!header) return null

  const { data: lines } = await supabase
    .from('ledger_entries')
    .select(
      'id, debit_amount, credit_amount, memo, account:account_id(id, account_number, account_name, account_type), fund:fund_id(id, code, name)',
    )
    .eq('journal_entry_id', id)

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

  // JE ids in this period, posted only.
  const { data: jeRows } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('association_id', associationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted')

  const jeIds = (jeRows ?? []).map((r) => r.id)
  if (jeIds.length === 0) {
    return { rows: [], totalDebits: 0, totalCredits: 0 }
  }

  const { data: lines } = await supabase
    .from('ledger_entries')
    .select(
      'debit_amount, credit_amount, account:account_id(id, account_number, account_name, account_type)',
    )
    .in('journal_entry_id', jeIds)

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

  for (const l of (lines ?? []) as LineShape[]) {
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
