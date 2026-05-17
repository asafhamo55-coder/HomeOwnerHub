'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { postJournalEntry } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

export type ClosePeriodResult =
  | { ok: true; closingJeIds: string[]; netIncome: number }
  | { ok: false; error: string }

const ClosePeriodSchema = z.object({
  periodId: z.string().uuid(),
})

/**
 * Close a fiscal period. Builds the closing entries that move every
 * income and expense account's balance to the corresponding fund's
 * equity account. Spec §13.1 #1 (no balance columns) plus #5 (three
 * accounting bases via presentation) mean we don't zero balances by
 * mutation — we post explicit JEs.
 *
 * Per fund, the close emits two JEs (when the account totals are
 * non-zero):
 *
 *   1. Income → Equity   (Dr each income account, Cr fund equity, total = sum of income credits)
 *   2. Expense → Equity  (Dr fund equity, Cr each expense account, total = sum of expense debits)
 *
 * Each JE is balanced (Dr total = Cr total) AND fund-balanced (all lines
 * in the same fund) so the validate_je_balances trigger lets it through.
 * closing_entries rows record the JE + closing_type for audit.
 *
 * Period state flow: open → closing → closed. We use 'closing' as a
 * tombstone while the close is in flight so a concurrent close attempt
 * sees the wrong state and bails.
 */
export async function closePeriod(input: {
  periodId: string
}): Promise<ClosePeriodResult> {
  const parsed = ClosePeriodSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  // 1. Validate period.
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id, status, association_id, organization_id, start_date, end_date')
    .eq('id', parsed.data.periodId)
    .eq('association_id', assoc.id)
    .single()
  if (!period) return { ok: false, error: 'Period not found.' }
  if (period.status !== 'open') {
    return { ok: false, error: `Period is ${period.status}; only open periods can be closed.` }
  }

  // 2. Tombstone it so a concurrent close attempt bails.
  const { error: tErr } = await supabase
    .from('fiscal_periods')
    .update({ status: 'closing' })
    .eq('id', period.id)
    .eq('status', 'open') // optimistic concurrency
  if (tErr) return { ok: false, error: `tombstone: ${tErr.message}` }

  // 3. Read every posted income/expense ledger entry for the period.
  const { data: jes } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('fiscal_period_id', period.id)
    .eq('status', 'posted')
  const jeIds = (jes ?? []).map((r) => r.id)

  const closingJeIds: string[] = []

  if (jeIds.length === 0) {
    // Empty period — just flip to closed.
    await supabase
      .from('fiscal_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', period.id)
    revalidatePath('/accounting')
    return { ok: true, closingJeIds, netIncome: 0 }
  }

  const { data: lines } = await supabase
    .from('ledger_entries')
    .select(
      'debit_amount, credit_amount, account_id, fund_id, account:account_id(account_number, account_name, account_type)',
    )
    .in('journal_entry_id', jeIds)

  type LineShape = {
    debit_amount: number
    credit_amount: number
    account_id: string
    fund_id: string
    account: { account_number: string; account_name: string; account_type: string } | null
  }

  // Aggregate per (fund_id, account_id). Track account_type so we know
  // which side to close.
  const agg = new Map<
    string,
    { fundId: string; accountId: string; accountType: 'income' | 'expense'; debit: number; credit: number }
  >()

  for (const l of (lines ?? []) as LineShape[]) {
    if (!l.account) continue
    const type = l.account.account_type
    if (type !== 'income' && type !== 'expense') continue
    const key = `${l.fund_id}:${l.account_id}`
    const prior = agg.get(key) ?? {
      fundId: l.fund_id,
      accountId: l.account_id,
      accountType: type,
      debit: 0,
      credit: 0,
    }
    prior.debit += Number(l.debit_amount)
    prior.credit += Number(l.credit_amount)
    agg.set(key, prior)
  }

  // Per-fund equity account: the seed names them "Fund Balance —
  // Operating" (3000) and "Fund Balance — Reserve" (3010). Each is
  // linked to a fund via fund_id. We resolve via funds.code from the
  // line's fund_id to find the right equity account.
  const fundIds = Array.from(new Set([...agg.values()].map((v) => v.fundId)))
  const { data: equityAccts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_number, fund_id')
    .eq('association_id', assoc.id)
    .eq('account_type', 'equity')
  const equityByFund = new Map<string, string>(
    (equityAccts ?? [])
      .filter((r): r is { id: string; account_number: string; fund_id: string } =>
        Boolean(r.fund_id),
      )
      .map((r) => [r.fund_id, r.id]),
  )

  for (const fundId of fundIds) {
    if (!equityByFund.has(fundId)) {
      // Roll back the tombstone — without an equity account we can't close.
      await supabase
        .from('fiscal_periods')
        .update({ status: 'open' })
        .eq('id', period.id)
      return {
        ok: false,
        error: `Fund ${fundId} has no equity account (3xxx with fund_id set). Add one to COA before closing.`,
      }
    }
  }

  // Helper: per-fund, build the income→equity JE and the expense→equity JE.
  // For each fund, sum income (net credit positive) and expense (net debit
  // positive) totals and emit balanced JEs.
  let totalNetIncome = 0

  for (const fundId of fundIds) {
    const equityAccountId = equityByFund.get(fundId)!
    const fundRows = [...agg.values()].filter((v) => v.fundId === fundId)

    const incomeRows = fundRows.filter((r) => r.accountType === 'income')
    const expenseRows = fundRows.filter((r) => r.accountType === 'expense')

    const incomeNetCr = incomeRows.reduce((s, r) => s + (r.credit - r.debit), 0)
    const expenseNetDr = expenseRows.reduce((s, r) => s + (r.debit - r.credit), 0)
    totalNetIncome += incomeNetCr - expenseNetDr

    // Close income: for each income account, Dr its net credit balance,
    // Cr equity for the total. Skip when zero.
    if (Math.abs(incomeNetCr) > 0.005) {
      const lines: {
        accountId: string
        fundId: string
        debit: number
        credit: number
      }[] = []
      for (const r of incomeRows) {
        const net = r.credit - r.debit
        if (Math.abs(net) < 0.005) continue
        lines.push({
          accountId: r.accountId,
          fundId,
          debit: net > 0 ? net : 0,
          credit: net < 0 ? -net : 0,
        })
      }
      const totalDr = lines.reduce((s, l) => s + l.debit, 0)
      const totalCr = lines.reduce((s, l) => s + l.credit, 0)
      // Plug to equity to balance: difference of debits over credits goes
      // to the credit (or debit) side of the equity line.
      const plug = totalDr - totalCr
      if (plug > 0) {
        lines.push({ accountId: equityAccountId, fundId, debit: 0, credit: plug })
      } else if (plug < 0) {
        lines.push({ accountId: equityAccountId, fundId, debit: -plug, credit: 0 })
      }
      const je = await postJournalEntry(supabase, {
        organizationId: period.organization_id,
        associationId: assoc.id,
        fiscalPeriodId: period.id,
        entryDate: period.end_date,
        memo: `Close income → equity (${fundId.slice(0, 8)})`,
        source: 'closing',
        lines,
      })
      if (!je.ok) {
        await supabase
          .from('fiscal_periods')
          .update({ status: 'open' })
          .eq('id', period.id)
        return { ok: false, error: `income close failed: ${je.error}` }
      }
      await supabase.from('closing_entries').insert({
        fiscal_period_id: period.id,
        journal_entry_id: je.journalEntryId,
        closing_type: 'income_to_equity',
      })
      closingJeIds.push(je.journalEntryId)
    }

    if (Math.abs(expenseNetDr) > 0.005) {
      const lines: {
        accountId: string
        fundId: string
        debit: number
        credit: number
      }[] = []
      for (const r of expenseRows) {
        const net = r.debit - r.credit
        if (Math.abs(net) < 0.005) continue
        lines.push({
          accountId: r.accountId,
          fundId,
          debit: net < 0 ? -net : 0,
          credit: net > 0 ? net : 0,
        })
      }
      const totalDr = lines.reduce((s, l) => s + l.debit, 0)
      const totalCr = lines.reduce((s, l) => s + l.credit, 0)
      const plug = totalCr - totalDr
      if (plug > 0) {
        lines.push({ accountId: equityAccountId, fundId, debit: plug, credit: 0 })
      } else if (plug < 0) {
        lines.push({ accountId: equityAccountId, fundId, debit: 0, credit: -plug })
      }
      const je = await postJournalEntry(supabase, {
        organizationId: period.organization_id,
        associationId: assoc.id,
        fiscalPeriodId: period.id,
        entryDate: period.end_date,
        memo: `Close expense → equity (${fundId.slice(0, 8)})`,
        source: 'closing',
        lines,
      })
      if (!je.ok) {
        await supabase
          .from('fiscal_periods')
          .update({ status: 'open' })
          .eq('id', period.id)
        return { ok: false, error: `expense close failed: ${je.error}` }
      }
      await supabase.from('closing_entries').insert({
        fiscal_period_id: period.id,
        journal_entry_id: je.journalEntryId,
        closing_type: 'expense_to_equity',
      })
      closingJeIds.push(je.journalEntryId)
    }
  }

  // 4. Flip period to closed.
  await supabase
    .from('fiscal_periods')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', period.id)

  revalidatePath('/accounting')
  revalidatePath('/accounting/periods')
  revalidatePath('/accounting/ledger')

  return { ok: true, closingJeIds, netIncome: totalNetIncome }
}
