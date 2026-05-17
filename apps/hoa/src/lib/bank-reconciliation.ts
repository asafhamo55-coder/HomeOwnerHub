'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

export type ReconcileResult =
  | { ok: true; reconciliationId: string; difference: number }
  | { ok: false; error: string }
export type ApproveReconciliationResult =
  | { ok: true }
  | { ok: false; error: string }

const ReconcileSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'statementDate must be YYYY-MM-DD'),
  statementBalance: z.number().refine((v) => !Number.isNaN(v), 'invalid balance'),
})

/**
 * Compute the ledger cash balance for an account as of statementDate
 * and write a bank_reconciliations row capturing both numbers. The
 * statementDate ledger balance is the sum of every posted debit minus
 * every posted credit hitting this fund's cash account through
 * statementDate (inclusive).
 *
 * "Reconciled balance" here = our ledger balance. The difference =
 * statement_balance - reconciled_balance tells the manager which side
 * is out of sync. Auto-approval is NOT performed; a future
 * approveReconciliation() server action would flip approved_at + by.
 */
export async function reconcileBankAccount(input: {
  bankAccountId: string
  statementDate: string
  statementBalance: number
}): Promise<ReconcileResult> {
  const parsed = ReconcileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: bankAcct } = await supabase
    .from('bank_accounts')
    .select('id, organization_id, association_id, fund_id')
    .eq('id', value.bankAccountId)
    .single()
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'Bank account not found in this association.' }
  }

  // Cash account for this fund — by convention, 1010 for OPERATING and
  // 1020 for RESERVE. Look up by fund_id to stay robust against
  // re-numbering.
  const { data: cashAcct } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('account_type', 'asset')
    .eq('fund_id', bankAcct.fund_id)
    .in('account_number', ['1010', '1020'])
    .maybeSingle()
  if (!cashAcct) {
    return { ok: false, error: 'Cash account for this fund is missing in the COA.' }
  }

  // Sum ledger entries hitting this cash account through statementDate.
  const { data: jeRows } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'posted')
    .lte('entry_date', value.statementDate)
  const jeIds = (jeRows ?? []).map((r) => r.id)

  let reconciledBalance = 0
  if (jeIds.length > 0) {
    const { data: lines } = await supabase
      .from('ledger_entries')
      .select('debit_amount, credit_amount')
      .eq('account_id', cashAcct.id)
      .in('journal_entry_id', jeIds)
    for (const l of lines ?? []) {
      reconciledBalance += Number(l.debit_amount) - Number(l.credit_amount)
    }
  }

  // Write or update the reconciliation row. UNIQUE
  // (bank_account_id, statement_date) — re-reconcile by overwriting.
  const { data: existing } = await supabase
    .from('bank_reconciliations')
    .select('id')
    .eq('bank_account_id', value.bankAccountId)
    .eq('statement_date', value.statementDate)
    .maybeSingle()

  let reconciliationId: string
  if (existing) {
    const { error } = await supabase
      .from('bank_reconciliations')
      .update({
        statement_balance: value.statementBalance,
        reconciled_balance: reconciledBalance,
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
    reconciliationId = existing.id
  } else {
    const { data, error } = await supabase
      .from('bank_reconciliations')
      .insert({
        organization_id: bankAcct.organization_id,
        bank_account_id: value.bankAccountId,
        statement_date: value.statementDate,
        statement_balance: value.statementBalance,
        reconciled_balance: reconciledBalance,
        reconciled_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: `insert: ${error?.message}` }
    reconciliationId = data.id
  }

  revalidatePath('/accounting/bank')
  return {
    ok: true,
    reconciliationId,
    difference: value.statementBalance - reconciledBalance,
  }
}

// ─── approveReconciliation ───────────────────────────────────────────

const ApproveSchema = z.object({
  reconciliationId: z.string().uuid(),
  force: z.boolean().optional(),
})

/**
 * Stamp approved_at + approved_by on a bank_reconciliations row. The
 * happy path requires (a) a successful reconcile (reconciled_at set)
 * and (b) statement_balance within $0.01 of reconciled_balance. Managers
 * can `force` an approval despite a difference — the difference stays
 * on the row, so reports + audits make the variance visible later.
 */
export async function approveReconciliation(input: {
  reconciliationId: string
  force?: boolean
}): Promise<ApproveReconciliationResult> {
  const parsed = ApproveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  // Confirm the row belongs to this association via the bank_account
  // join. RLS would block cross-org reads anyway, but a clear error is
  // nicer than the silent null.
  const { data: rec } = await supabase
    .from('bank_reconciliations')
    .select(
      'id, statement_balance, reconciled_balance, reconciled_at, approved_at, bank_account:bank_account_id(association_id)',
    )
    .eq('id', parsed.data.reconciliationId)
    .single()
  if (!rec) return { ok: false, error: 'reconciliation not found' }
  const bankAcct = rec.bank_account as { association_id: string } | null
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'reconciliation not in this association' }
  }
  if (rec.approved_at) {
    return { ok: false, error: 'already approved' }
  }
  if (!rec.reconciled_at) {
    return {
      ok: false,
      error: 'run reconcile first — reconciled_balance must be computed',
    }
  }

  const diff = Math.abs(
    Number(rec.statement_balance ?? 0) - Number(rec.reconciled_balance ?? 0),
  )
  if (diff > 0.01 && !parsed.data.force) {
    return {
      ok: false,
      error: `unresolved difference of ${diff.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}; re-submit with force=true to override`,
    }
  }

  // approved_by is the auth.users.id of the signed-in manager. Read it
  // from the session — falls back to NULL if somehow unavailable so the
  // approval still records the timestamp.
  const { data: userRes } = await supabase.auth.getUser()
  const approvedBy = userRes?.user?.id ?? null

  const { error } = await supabase
    .from('bank_reconciliations')
    .update({
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq('id', parsed.data.reconciliationId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/accounting/bank')
  return { ok: true }
}
