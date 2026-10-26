import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeBalanceSheet,
  computeBudgetVsActual,
  computeIncomeStatementForRange,
  listBudgets,
  type AccountingContext,
} from '@/lib/accounting/queries'
import { ownerBalance, ownerBudgets, ownerIncome, type Section } from '@/lib/annual-report/model'
import { readAll } from '@/lib/supabase/read-all'
import {
  adoptedForYear,
  packetYears,
  statementsForYear,
  type FinancialPacket,
  type PacketDocumentRow,
  type PacketFiscalPeriod,
  type PacketYearSection,
} from './financial-packet'

/**
 * BL-162: reads for the 3-year financial packet. The page has already run
 * requireBoardOrAdmin; every read uses the board's RLS-bound client and the
 * same report queries as /accounting/reports. Each piece loads on its own,
 * so one failed read is that piece's "Couldn't load", never zeros.
 * Logs carry codes only.
 */

export type FinancialPacketLoad = { ok: true; packet: FinancialPacket } | { ok: false; what: string }

const NO_ACCOUNTING = 'Accounting isn’t set up in HomeownerHub yet, so there are no figures for this year.'

async function piece<T>(what: string, load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { state: 'ok', data: await load() }
  } catch (e) {
    console.error('[financial-packet] read failed', { what, name: e instanceof Error ? e.name : 'unknown' })
    return { state: 'failed' }
  }
}

export async function loadFinancialPacket(opts: {
  supabase: SupabaseClient
  orgId: string
  /** null with ctxFailed false: no accounting set up. */
  ctx: AccountingContext | null
  ctxFailed: boolean
  today: string
}): Promise<FinancialPacketLoad> {
  const { supabase, orgId, ctx, today } = opts
  const assocId = ctx?.associationId ?? null

  let periods: PacketFiscalPeriod[] = []
  if (assocId) {
    const { data, error } = await supabase.from('fiscal_periods').select('start_date, end_date').eq('association_id', assocId)
    if (error) {
      console.error('[financial-packet] fiscal periods read failed', { code: error.code ?? null })
      return { ok: false, what: 'the association’s fiscal years' }
    }
    periods = (data ?? []) as PacketFiscalPeriod[]
  }
  const years = packetYears(periods, today)

  let docs: PacketDocumentRow[] = []
  let docsFailed = false
  try {
    docs = await readAll<PacketDocumentRow>(
      (a, b) =>
        supabase
          .from('hoa_documents')
          .select('id, name')
          .eq('org_id', orgId)
          .order('id', { ascending: true })
          .range(a, b) as unknown as PromiseLike<{ data: PacketDocumentRow[] | null; error: { code?: string } | null }>,
      (e) => new Error(`financial packet: documents failed (${e.code ?? 'no code'})`),
      20_000,
    )
  } catch (e) {
    docsFailed = true
    console.error('[financial-packet] documents read failed', { name: e instanceof Error ? e.name : 'unknown' })
  }

  const budgetsP = assocId ? listBudgets(assocId) : null
  budgetsP?.catch(() => undefined)

  const none = <T,>(): Section<T> => (opts.ctxFailed ? { state: 'failed' } : { state: 'none', why: NO_ACCOUNTING })

  const sections = await Promise.all(
    years.map(async (year): Promise<PacketYearSection> => {
      const [balance, income, budgets] = assocId
        ? await Promise.all([
            piece('balance sheet', async () => ownerBalance(await computeBalanceSheet(assocId, year.end))),
            piece('income statement', async () => ownerIncome(await computeIncomeStatementForRange(assocId, year.start, year.end, 'accrual'))),
            piece('budgets', async () => {
              const picked = adoptedForYear(await budgetsP!, year)
              const reports = await Promise.all(picked.map((b) => computeBudgetVsActual(assocId, b.id, { through: year.end })))
              return ownerBudgets(picked.flatMap((budget, i) => (reports[i] ? [{ budget, report: reports[i]! }] : [])))
            }),
          ])
        : [none(), none(), none()]
      return {
        year,
        balance: balance as PacketYearSection['balance'],
        income: income as PacketYearSection['income'],
        budgets: budgets as PacketYearSection['budgets'],
        statements: docsFailed ? { state: 'failed' } : { state: 'ok', data: statementsForYear(docs, year) },
      }
    }),
  )

  return { ok: true, packet: { associationName: ctx?.associationName ?? 'The association', preparedOn: today, years: sections } }
}
