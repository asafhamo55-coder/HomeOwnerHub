// BL-121 — reads for the year-end CPA package. Server only.
//
// Every read uses the caller's RLS-scoped client and is scoped to the
// association (or org) itself; every full-set read pages to the end
// (readAll / readLedgerLines), because a year of entries passes PostgREST's
// 1000-row cap. Every failed read THROWS (queryFailed): a package missing
// a section must never look complete. The statements reuse the report
// builders in ../queries.ts.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { dayOf } from '@/lib/association-time'
import {
  computeBalanceSheet,
  computeBudgetVsActual,
  computeIncomeStatement,
  computeTrialBalance,
  listAccounts,
  listBudgets,
  listFunds,
  queryFailed,
  readLedgerLines,
  type BudgetVsActual,
  type FiscalPeriod,
} from '../queries'
import {
  arAgingAt,
  bankRecStatus,
  form1120HWorksheet,
  necCandidates,
  vendorTotals,
  type AssessmentAtYearEnd,
  type GlLine,
  type VendorInfo,
  type VendorPaymentInput,
  type YearEndData,
} from './model'

type Db = Awaited<ReturnType<typeof getSupabaseServerClient>>

export interface YearEndScope {
  orgId: string
  associationId: string
  associationName: string
  timeZone: string
  period: Pick<FiscalPeriod, 'id' | 'start_date' | 'end_date' | 'status'>
}

/** The calendar year a 1099 belongs to: the year the fiscal year ends in. */
export function calendarYearOf(period: { end_date: string }): number {
  return Number(period.end_date.slice(0, 4))
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// ─── General ledger detail ───────────────────────────────────────────

async function loadGeneralLedger(db: Db, s: YearEndScope): Promise<GlLine[]> {
  const jes = await readAll<{ id: string; entry_number: string; entry_date: string; memo: string | null; source: string }>(
    (from, to) =>
      db
        .from('journal_entries')
        .select('id, entry_number, entry_date, memo, source')
        .eq('association_id', s.associationId)
        .eq('fiscal_period_id', s.period.id)
        .eq('status', 'posted')
        .order('id', { ascending: true })
        .range(from, to),
    queryFailed,
  )
  if (jes.length === 0) return []
  const [lines, accounts, funds] = await Promise.all([
    readLedgerLines<{
      journal_entry_id: string
      account_id: string
      fund_id: string | null
      debit_amount: number
      credit_amount: number
      memo: string | null
    }>(db, 'journal_entry_id, account_id, fund_id, debit_amount, credit_amount, memo', jes.map((j) => j.id)),
    listAccounts(s.associationId),
    listFunds(s.associationId),
  ])
  const jeById = new Map(jes.map((j) => [j.id, j]))
  const acct = new Map(accounts.map((a) => [a.id, a]))
  const fund = new Map(funds.map((f) => [f.id, f.code]))
  return lines.map((l) => {
    const je = jeById.get(l.journal_entry_id)
    const a = acct.get(l.account_id)
    return {
      entryDate: je?.entry_date ?? '',
      entryNumber: je?.entry_number ?? '',
      source: je?.source ?? '',
      entryMemo: je?.memo ?? null,
      accountNumber: a?.account_number ?? '',
      accountName: a?.account_name ?? 'Unknown account',
      fundCode: l.fund_id ? (fund.get(l.fund_id) ?? null) : null,
      debit: Number(l.debit_amount),
      credit: Number(l.credit_amount),
      lineMemo: l.memo,
    }
  })
}

// ─── Budget vs actual ────────────────────────────────────────────────

async function loadBudgets(s: YearEndScope): Promise<BudgetVsActual[]> {
  const all = (await listBudgets(s.associationId)).filter((b) => b.fiscalPeriod?.id === s.period.id)
  // Approved budgets are the board's; fall back to drafts only when none is approved.
  const approved = all.filter((b) => b.status === 'approved')
  const chosen = approved.length > 0 ? approved : all
  const reports = await Promise.all(chosen.map((b) => computeBudgetVsActual(s.associationId, b.id)))
  return reports.filter((r): r is BudgetVsActual => r !== null)
}

// ─── AR aging at year end ────────────────────────────────────────────

async function loadAging(db: Db, s: YearEndScope) {
  const end = s.period.end_date
  const [charges, units] = await Promise.all([
    readAll<{ unit_id: string; due_date: string; amount: number; payments: { amount: number; paid_at: string | null }[] | null }>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, unit_id, due_date, amount, payments(amount, paid_at)')
          .eq('association_id', s.associationId)
          .is('deleted_at', null)
          .lte('due_date', end)
          .order('id', { ascending: true })
          .range(from, to) as never,
      queryFailed,
    ),
    readAll<{ id: string; unit_number: string | null; lot_number: string | null; address_line1: string }>(
      (from, to) =>
        db
          .from('units')
          .select('id, unit_number, lot_number, address_line1')
          .eq('association_id', s.associationId)
          .order('id', { ascending: true })
          .range(from, to),
      queryFailed,
    ),
  ])
  const labels = new Map(
    units.map((u) => [u.id, u.unit_number ? `Unit ${u.unit_number}` : u.lot_number ? `Lot ${u.lot_number}` : u.address_line1]),
  )
  const rows: AssessmentAtYearEnd[] = charges.map((c) => ({
    unitId: c.unit_id,
    dueDate: c.due_date,
    amount: c.amount,
    payments: (c.payments ?? []).map((p) => ({ day: dayOf(p.paid_at, s.timeZone), amount: p.amount })),
  }))
  return arAgingAt(rows, labels, end)
}

// ─── Bank reconciliation status ──────────────────────────────────────

export async function loadBankRecs(db: Db, s: YearEndScope) {
  const { data: accounts, error } = await db
    .from('bank_accounts')
    .select('id, account_name, bank_name, last4, is_active')
    .eq('association_id', s.associationId)
    .order('id', { ascending: true })
  if (error) throw queryFailed(error)
  const ids = (accounts ?? []).map((a) => a.id)
  const recs =
    ids.length === 0
      ? []
      : (
          await Promise.all(
            chunk(ids).map((part) =>
              readAll<{
                bank_account_id: string
                statement_date: string
                statement_balance: number | null
                reconciled_balance: number | null
                approved_at: string | null
              }>(
                (from, to) =>
                  db
                    .from('bank_reconciliations')
                    .select('id, bank_account_id, statement_date, statement_balance, reconciled_balance, approved_at')
                    .in('bank_account_id', part)
                    .lte('statement_date', s.period.end_date)
                    .order('id', { ascending: true })
                    .range(from, to),
                queryFailed,
              ),
            ),
          )
        ).flat()
  return bankRecStatus(
    (accounts ?? []).map((a) => ({
      id: a.id,
      accountName: a.account_name,
      bankName: a.bank_name,
      last4: a.last4,
      isActive: a.is_active,
    })),
    recs.map((r) => ({
      bankAccountId: r.bank_account_id,
      statementDate: r.statement_date,
      statementBalance: r.statement_balance,
      reconciledBalance: r.reconciled_balance,
      approved: r.approved_at != null,
    })),
    s.period.end_date,
  )
}

// ─── Vendor payments + 1099-NEC candidates ───────────────────────────

export async function loadVendorPayments(db: Db, s: YearEndScope) {
  const year = calendarYearOf(s.period)
  const calendar = { start: `${year}-01-01`, end: `${year}-12-31` }
  const fiscal = { start: s.period.start_date, end: s.period.end_date }
  // One read covering both windows; a day of slack each side because
  // paid_at is an instant and the day is taken on the association's zone.
  const from = shiftDay(fiscal.start < calendar.start ? fiscal.start : calendar.start, -1)
  const to = shiftDay(fiscal.end > calendar.end ? fiscal.end : calendar.end, 2)

  const payments = await readAll<{ amount: number; paid_at: string; payment_method: string | null; invoice_id: string }>(
    (f, t) =>
      db
        .from('payments')
        .select('id, amount, paid_at, payment_method, invoice_id')
        .eq('organization_id', s.orgId)
        .not('invoice_id', 'is', null)
        .gte('paid_at', `${from}T00:00:00Z`)
        .lt('paid_at', `${to}T00:00:00Z`)
        .order('id', { ascending: true })
        .range(f, t) as never,
    queryFailed,
  )
  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))]
  const [invoices, vendors, compliance] = await Promise.all([
    Promise.all(
      chunk(invoiceIds).map(async (part) => {
        const { data, error } = await db.from('invoices').select('id, vendor_id, association_id').in('id', part)
        if (error) throw queryFailed(error)
        return data ?? []
      }),
    ).then((parts) => parts.flat()),
    readAll<{ id: string; legal_name: string; dba: string | null; ein: string | null }>(
      (f, t) =>
        db
          .from('vendors')
          .select('id, legal_name, dba, ein')
          .eq('organization_id', s.orgId)
          .order('id', { ascending: true })
          .range(f, t),
      queryFailed,
    ),
    readAll<{ vendor_id: string; w9_on_file: boolean | null }>(
      (f, t) =>
        db
          .from('vendor_compliance')
          .select('id, vendor_id, w9_on_file')
          .eq('association_id', s.associationId)
          .order('id', { ascending: true })
          .range(f, t),
      queryFailed,
    ),
  ])
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const w9 = new Map(compliance.map((c) => [c.vendor_id, c.w9_on_file]))
  const vendorInfo = new Map<string, VendorInfo>(
    vendors.map((v) => [
      v.id,
      {
        id: v.id,
        legalName: v.legal_name,
        dba: v.dba,
        // Presence only: the tax id itself never leaves the database here.
        hasTin: Boolean(v.ein && v.ein.trim()),
        w9OnFile: w9.has(v.id) ? (w9.get(v.id) ?? null) : null,
      },
    ]),
  )
  const inputs: VendorPaymentInput[] = []
  for (const p of payments) {
    const inv = invoiceById.get(p.invoice_id)
    if (!inv || inv.association_id !== s.associationId) continue
    const day = dayOf(p.paid_at, s.timeZone)
    if (!day) continue
    inputs.push({ day, amount: p.amount, method: p.payment_method, vendorId: inv.vendor_id })
  }
  return {
    calendarYear: year,
    fiscalTotals: vendorTotals(inputs, vendorInfo, fiscal),
    nec: necCandidates(vendorTotals(inputs, vendorInfo, calendar), vendorInfo),
  }
}

// ─── Everything ──────────────────────────────────────────────────────

export async function loadYearEndData(s: YearEndScope): Promise<YearEndData> {
  const db = await getSupabaseServerClient()
  const [trialBalance, incomeStatement, balanceSheet, budgets, glLines, aging, bankRecs, vendors] = await Promise.all([
    computeTrialBalance(s.associationId, s.period.id),
    computeIncomeStatement(s.associationId, s.period.id, 'accrual'),
    computeBalanceSheet(s.associationId, s.period.end_date),
    loadBudgets(s),
    loadGeneralLedger(db, s),
    loadAging(db, s),
    loadBankRecs(db, s),
    loadVendorPayments(db, s),
  ])
  return {
    associationName: s.associationName,
    fiscal: { start: s.period.start_date, end: s.period.end_date, status: s.period.status },
    calendarYear: vendors.calendarYear,
    trialBalance,
    incomeStatement,
    balanceSheet,
    budgets,
    glLines,
    aging,
    bankRecs,
    vendorTotals: vendors.fiscalTotals,
    nec: vendors.nec,
    worksheet: form1120HWorksheet(incomeStatement),
  }
}

/** The page's preview: the worksheet, the 1099 list and the bank-rec status. */
export async function loadYearEndPreview(s: YearEndScope) {
  const db = await getSupabaseServerClient()
  const [incomeStatement, bankRecs, vendors] = await Promise.all([
    computeIncomeStatement(s.associationId, s.period.id, 'accrual'),
    loadBankRecs(db, s),
    loadVendorPayments(db, s),
  ])
  return {
    worksheet: form1120HWorksheet(incomeStatement),
    bankRecs,
    nec: vendors.nec,
    calendarYear: vendors.calendarYear,
  }
}
