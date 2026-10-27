// BL-168 follow-up — the CPA's read-only CSV export: trial balance, general
// ledger detail and AR aging for ONE fiscal period.
//
// Every read runs on the professional's OWN RLS client (migration 0071's
// cpa read policies), so the file can never hold more than the CPA can
// already see on screen. It adds no grant and no table. Every query also
// names the org itself. AR aging carries owner names and nothing else of
// the owner (cpa_owner_names returns the name and unit id only). The
// year-end package stays board-only: it needs vendor data a CPA can't read.
//
// A failed read THROWS: a CSV that is missing rows must never look whole.

import { z } from 'zod'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { DEFAULT_ASSOCIATION_TIME_ZONE, dayOf } from '@/lib/association-time'
import { csvDocument } from '@/lib/csv'
import { AGING_BUCKETS, arAgingAt, generalLedgerCsv, trialBalanceCsv, type GlLine } from '@/lib/accounting/year-end/model'
import type { AccountType, TrialBalance, TrialBalanceRow } from '@/lib/accounting/queries'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const CPA_EXPORT_KINDS = ['trial_balance', 'general_ledger', 'ar_aging'] as const
export type CpaExportKind = (typeof CPA_EXPORT_KINDS)[number]

export const CPA_EXPORT_LABEL: Record<CpaExportKind, string> = {
  trial_balance: 'Trial balance',
  general_ledger: 'General ledger detail',
  ar_aging: 'AR aging',
}

export const CpaExportQuery = z.object({
  kind: z.enum(CPA_EXPORT_KINDS),
  periodId: z.string().uuid(),
})

export interface CpaPeriod {
  id: string
  associationId: string
  start: string
  end: string
}

export type CpaExport = { ok: true; filename: string; csv: string; rows: number } | { ok: false; reason: 'period_not_found' }

class ExportReadError extends Error {
  constructor(readonly code: string | null) {
    super(`cpa export read failed (${code ?? 'no code'})`)
  }
}
const fail = (e: { code?: string }) => new ExportReadError(e.code ?? null)

/** Ledger lines for these journal entries, every page, org-scoped. */
async function readLines<T>(db: Db, orgId: string, columns: string, jeIds: string[]): Promise<T[]> {
  const perChunk = await Promise.all(
    chunk(jeIds).map((ids) =>
      readAll<T>(
        (from, to) =>
          db
            .from('ledger_entries')
            .select(columns)
            .eq('organization_id', orgId)
            .in('journal_entry_id', ids)
            .order('id', { ascending: true })
            .range(from, to),
        fail,
      ),
    ),
  )
  return perChunk.flat()
}

async function readPostedEntries<T>(db: Db, orgId: string, period: CpaPeriod, columns: string): Promise<T[]> {
  return readAll<T>(
    (from, to) =>
      db
        .from('journal_entries')
        .select(columns)
        .eq('organization_id', orgId)
        .eq('association_id', period.associationId)
        .eq('fiscal_period_id', period.id)
        .eq('status', 'posted')
        .order('id', { ascending: true })
        .range(from, to),
    fail,
  )
}

/** The period, only when it is this org's. null = not found. */
export async function loadCpaPeriod(db: Db, orgId: string, periodId: string): Promise<CpaPeriod | null> {
  const res = await db
    .from('fiscal_periods')
    .select('id, association_id, start_date, end_date')
    .eq('organization_id', orgId)
    .eq('id', periodId)
    .maybeSingle()
  if (res.error) throw fail(res.error)
  const p = res.data as { id: string; association_id: string; start_date: string; end_date: string } | null
  return p ? { id: p.id, associationId: p.association_id, start: p.start_date, end: p.end_date } : null
}

/** Posted entries only, closing entries kept: the same rule as the board's trial balance. */
export async function loadCpaTrialBalance(db: Db, orgId: string, period: CpaPeriod): Promise<TrialBalance> {
  const jes = await readPostedEntries<{ id: string }>(db, orgId, period, 'id')
  if (jes.length === 0) return { rows: [], totalDebits: 0, totalCredits: 0 }
  type Line = {
    debit_amount: number
    credit_amount: number
    account: { id: string; account_number: string; account_name: string; account_type: string } | null
  }
  const lines = await readLines<Line>(
    db,
    orgId,
    'debit_amount, credit_amount, account:account_id(id, account_number, account_name, account_type)',
    jes.map((j) => j.id),
  )
  const agg = new Map<string, TrialBalanceRow>()
  let totalDebits = 0
  let totalCredits = 0
  for (const l of lines) {
    if (!l.account) continue
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    totalDebits += dr
    totalCredits += cr
    const type = (l.account.account_type ?? 'asset') as AccountType
    const isNormalDebit = type === 'asset' || type === 'expense'
    const row =
      agg.get(l.account.id) ??
      ({
        accountId: l.account.id,
        accountNumber: l.account.account_number,
        accountName: l.account.account_name,
        accountType: type,
        totalDebits: 0,
        totalCredits: 0,
        balance: 0,
        isNormalDebit,
      } satisfies TrialBalanceRow)
    row.totalDebits += dr
    row.totalCredits += cr
    row.balance = isNormalDebit ? row.totalDebits - row.totalCredits : row.totalCredits - row.totalDebits
    agg.set(l.account.id, row)
  }
  return {
    rows: [...agg.values()].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
    totalDebits,
    totalCredits,
  }
}

/** Every posted line of the period, with its entry. */
export async function loadCpaGeneralLedger(db: Db, orgId: string, period: CpaPeriod): Promise<GlLine[]> {
  const jes = await readPostedEntries<{ id: string; entry_number: string; entry_date: string; memo: string | null; source: string }>(
    db,
    orgId,
    period,
    'id, entry_number, entry_date, memo, source',
  )
  if (jes.length === 0) return []
  type Line = {
    journal_entry_id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
    account: { account_number: string; account_name: string } | null
    fund: { code: string } | null
  }
  const lines = await readLines<Line>(
    db,
    orgId,
    'journal_entry_id, debit_amount, credit_amount, memo, account:account_id(account_number, account_name), fund:fund_id(code)',
    jes.map((j) => j.id),
  )
  const byId = new Map(jes.map((j) => [j.id, j]))
  return lines.map((l) => {
    const je = byId.get(l.journal_entry_id)
    return {
      entryDate: je?.entry_date ?? '',
      entryNumber: je?.entry_number ?? '',
      source: je?.source ?? '',
      entryMemo: je?.memo ?? null,
      accountNumber: l.account?.account_number ?? '',
      accountName: l.account?.account_name ?? 'Unknown account',
      fundCode: l.fund?.code ?? null,
      debit: Number(l.debit_amount),
      credit: Number(l.credit_amount),
      lineMemo: l.memo,
    }
  })
}

export interface CpaAgingRow {
  unitId: string
  owner: string
  buckets: Record<(typeof AGING_BUCKETS)[number], number>
  totalCents: number
}

/**
 * What each home owed at the close of the period, labelled by owner name
 * (the CPA can't read units). Same rule as the year-end package: charges due
 * by the period end less payments made by then.
 */
export async function loadCpaArAging(db: Db, orgId: string, period: CpaPeriod): Promise<{ rows: CpaAgingRow[]; totals: Record<string, number>; totalCents: number }> {
  const [charges, owners] = await Promise.all([
    readAll<{ unit_id: string; due_date: string; amount: number; payments: { amount: number; paid_at: string | null }[] | null }>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, unit_id, due_date, amount, payments(amount, paid_at)')
          .eq('organization_id', orgId)
          .eq('association_id', period.associationId)
          .is('deleted_at', null)
          .lte('due_date', period.end)
          .order('id', { ascending: true })
          .range(from, to),
      fail,
    ),
    db.rpc('cpa_owner_names', { p_org_id: orgId }),
  ])
  if (owners.error) throw fail(owners.error)
  const ownerBy = new Map(((owners.data ?? []) as Array<{ unit_id: string; owner_name: string | null }>).map((o) => [o.unit_id, o.owner_name]))
  const aging = arAgingAt(
    charges.map((c) => ({
      unitId: c.unit_id,
      dueDate: c.due_date,
      amount: c.amount,
      payments: (c.payments ?? []).map((p) => ({ day: dayOf(p.paid_at, DEFAULT_ASSOCIATION_TIME_ZONE), amount: p.amount })),
    })),
    new Map([...ownerBy].map(([unit, name]) => [unit, name ?? 'Owner not on file'])),
    period.end,
  )
  return {
    rows: aging.rows.map((r) => ({ unitId: r.unitId, owner: ownerBy.get(r.unitId) ?? 'Owner not on file', buckets: r.buckets, totalCents: r.totalCents })),
    totals: aging.totals,
    totalCents: aging.totalCents,
  }
}

const dollars = (c: number) => Math.round(c) / 100

export function cpaArAgingCsv(aging: Awaited<ReturnType<typeof loadCpaArAging>>, asOf: string): string {
  const header = ['Owner', 'Home ref', 'Current', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days', `Total owed at ${asOf}`]
  return csvDocument(header, [
    // Owner name and an id fragment to tell two homes of one owner apart. No contact details.
    ...aging.rows.map((r) => [r.owner, r.unitId.slice(0, 8), ...AGING_BUCKETS.map((b) => dollars(r.buckets[b])), dollars(r.totalCents)]),
    ['Total', '', ...AGING_BUCKETS.map((b) => dollars(aging.totals[b] ?? 0)), dollars(aging.totalCents)],
  ])
}

/** Build one export. Throws on any failed read. */
export async function buildCpaExport(db: Db, input: { orgId: string; kind: CpaExportKind; periodId: string }): Promise<CpaExport> {
  const period = await loadCpaPeriod(db, input.orgId, input.periodId)
  if (!period) return { ok: false, reason: 'period_not_found' }
  const tag = `${period.end}`
  switch (input.kind) {
    case 'trial_balance': {
      const tb = await loadCpaTrialBalance(db, input.orgId, period)
      return { ok: true, filename: `trial-balance-${tag}.csv`, csv: trialBalanceCsv(tb), rows: tb.rows.length }
    }
    case 'general_ledger': {
      const lines = await loadCpaGeneralLedger(db, input.orgId, period)
      return { ok: true, filename: `general-ledger-${tag}.csv`, csv: generalLedgerCsv(lines), rows: lines.length }
    }
    case 'ar_aging': {
      const aging = await loadCpaArAging(db, input.orgId, period)
      return { ok: true, filename: `ar-aging-${tag}.csv`, csv: cpaArAgingCsv(aging, period.end), rows: aging.rows.length }
    }
  }
}

/** The download. The CSV text itself came from lib/csv (csvDocument), so cells are quoted and formula-guarded. */
export function cpaCsvResponse(result: { filename: string; csv: string }): Response {
  return new Response(result.csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
