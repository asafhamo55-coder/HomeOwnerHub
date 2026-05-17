'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { loadAccountingRefs, postJournalEntry } from '@homeowner-portal/db'
import { bankReconciliationAgent } from '@homeowner-portal/workflows'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

export type BankRecActionResult =
  | { ok: true; matchMethod: string; confidence: number; notes: string }
  | { ok: false; error: string }
export type BankRecSimpleResult =
  | { ok: true; journalEntryId?: string }
  | { ok: false; error: string }

// ─── re-run W18 ──────────────────────────────────────────────────────

const ReRunSchema = z.object({
  bankTransactionId: z.string().uuid(),
})

export async function reRunBankMatch(input: {
  bankTransactionId: string
}): Promise<BankRecActionResult> {
  const parsed = ReRunSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: row } = await supabase
    .from('bank_transactions')
    .select('id, organization_id, bank_account:bank_account_id(association_id)')
    .eq('id', parsed.data.bankTransactionId)
    .single()
  if (!row) return { ok: false, error: 'transaction not found' }
  const bankAcct = row.bank_account as { association_id: string } | null
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'transaction does not belong to this association' }
  }

  try {
    const result = await bankReconciliationAgent.execute(
      { bankTransactionId: parsed.data.bankTransactionId },
      { organizationId: row.organization_id },
    )
    revalidatePaths()
    return {
      ok: true,
      matchMethod: result.output.matchMethod,
      confidence: result.output.confidence ?? 0,
      notes: result.output.notes,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── confirm fuzzy match ────────────────────────────────────────────

const ConfirmMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  assessmentId: z.string().uuid(),
})

/**
 * Manager confirmed a Step B fuzzy-match candidate. Post the cash-receipt
 * JE and link everything (same shape as W18 Step A, just at a lower
 * confidence because the memo wasn't auto-recognizable).
 */
export async function confirmFuzzyMatch(input: {
  bankTransactionId: string
  assessmentId: string
}): Promise<BankRecSimpleResult> {
  const parsed = ConfirmMatchSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: txn } = await supabase
    .from('bank_transactions')
    .select(
      'id, organization_id, amount, posted_date, matched_journal_entry_id, bank_account:bank_account_id(association_id, fund_id)',
    )
    .eq('id', parsed.data.bankTransactionId)
    .single()
  if (!txn) return { ok: false, error: 'transaction not found' }
  if (txn.matched_journal_entry_id) {
    return { ok: false, error: 'transaction already matched' }
  }
  const bankAcct = txn.bank_account as { association_id: string; fund_id: string } | null
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'transaction does not belong to this association' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, association_id, unit_id, fiscal_period_id, amount, status')
    .eq('id', parsed.data.assessmentId)
    .single()
  if (!assessment || assessment.association_id !== assoc.id) {
    return { ok: false, error: 'assessment not found in this association' }
  }
  if (assessment.status === 'paid' || assessment.status === 'waived') {
    return { ok: false, error: `assessment is ${assessment.status}` }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) return { ok: false, error: 'accounting not set up' }

  const amount = Number(txn.amount)
  const je = await postJournalEntry(supabase, {
    organizationId: txn.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: assessment.fiscal_period_id,
    entryDate: txn.posted_date,
    memo: `Manual confirm: txn ${txn.id.slice(0, 8)} → assessment ${assessment.id.slice(0, 8)}`,
    source: 'bank_rec',
    sourceId: txn.id,
    lines: [
      { accountId: refs.acctCashOperating, fundId: bankAcct.fund_id, debit: amount, credit: 0 },
      { accountId: refs.acctAR, fundId: bankAcct.fund_id, debit: 0, credit: amount },
    ],
  })
  if (!je.ok) return { ok: false, error: `JE failed: ${je.error}` }

  await Promise.all([
    supabase
      .from('bank_transactions')
      .update({
        matched_journal_entry_id: je.journalEntryId,
        match_method: 'manual',
        match_confidence: 0.95,
      })
      .eq('id', txn.id),
    supabase.from('payments').insert({
      organization_id: txn.organization_id,
      unit_id: assessment.unit_id,
      assessment_id: assessment.id,
      amount,
      payment_method: 'zelle_assisted',
      external_ref: txn.id,
      paid_at: new Date(txn.posted_date).toISOString(),
      journal_entry_id: je.journalEntryId,
    }),
    supabase
      .from('assessments')
      .update({
        status: amount >= Number(assessment.amount) ? 'paid' : 'partial',
      })
      .eq('id', assessment.id),
    supabase.from('zelle_inbound_matches').insert({
      organization_id: txn.organization_id,
      bank_transaction_id: txn.id,
      memo_code: 'MANUAL',
      matched_assessment_id: assessment.id,
      matched_unit_id: assessment.unit_id,
      status: 'manual_override',
      ai_workflow_id: 'W18',
    }),
  ])

  revalidatePaths()
  return { ok: true, journalEntryId: je.journalEntryId }
}

// ─── categorize as expense ──────────────────────────────────────────

const CategorizeExpenseSchema = z.object({
  bankTransactionId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  memo: z.string().max(500).optional(),
})

/**
 * Outbound payment — manager picks an expense account. Posts Dr Expense /
 * Cr Cash (the cash is the bank account's fund). For inbound, the
 * equivalent server action would be `categorizeAsIncome` (we don't
 * expose that yet; inbound that isn't a homeowner payment is rare).
 */
export async function categorizeAsExpense(input: {
  bankTransactionId: string
  expenseAccountId: string
  memo?: string
}): Promise<BankRecSimpleResult> {
  const parsed = CategorizeExpenseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: txn } = await supabase
    .from('bank_transactions')
    .select(
      'id, organization_id, amount, posted_date, memo, merchant, matched_journal_entry_id, bank_account:bank_account_id(association_id, fund_id)',
    )
    .eq('id', parsed.data.bankTransactionId)
    .single()
  if (!txn) return { ok: false, error: 'transaction not found' }
  if (txn.matched_journal_entry_id) {
    return { ok: false, error: 'transaction already matched' }
  }
  const bankAcct = txn.bank_account as { association_id: string; fund_id: string } | null
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'transaction does not belong to this association' }
  }

  const { data: expenseAcct } = await supabase
    .from('chart_of_accounts')
    .select('id, account_type')
    .eq('id', parsed.data.expenseAccountId)
    .eq('association_id', assoc.id)
    .single()
  if (!expenseAcct || expenseAcct.account_type !== 'expense') {
    return { ok: false, error: 'Not a valid expense account.' }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) return { ok: false, error: 'accounting not set up' }

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) return { ok: false, error: 'No open fiscal period.' }

  const absAmount = Math.abs(Number(txn.amount))
  const je = await postJournalEntry(supabase, {
    organizationId: txn.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.id,
    entryDate: txn.posted_date,
    memo:
      parsed.data.memo ??
      `Manual expense: ${txn.memo ?? txn.merchant ?? txn.id.slice(0, 8)}`,
    source: 'bank_rec',
    sourceId: txn.id,
    lines: [
      { accountId: parsed.data.expenseAccountId, fundId: bankAcct.fund_id, debit: absAmount, credit: 0 },
      { accountId: refs.acctCashOperating, fundId: bankAcct.fund_id, debit: 0, credit: absAmount },
    ],
  })
  if (!je.ok) return { ok: false, error: `JE failed: ${je.error}` }

  await supabase
    .from('bank_transactions')
    .update({
      matched_journal_entry_id: je.journalEntryId,
      match_method: 'manual',
      match_confidence: 1,
    })
    .eq('id', txn.id)

  revalidatePaths()
  return { ok: true, journalEntryId: je.journalEntryId }
}

// ─── ignore transaction ─────────────────────────────────────────────

const IgnoreSchema = z.object({
  bankTransactionId: z.string().uuid(),
})

/**
 * Mark a transaction as reviewed without posting. Useful for inbound
 * deposits that are management-fee transfers from another HOA account,
 * or other non-ledger events. We don't have an explicit "ignored" state
 * column, so we write a no-amount JE? No — simpler: stamp match_method
 * to 'manual' with confidence 0 and set matched_journal_entry_id to NULL
 * but a sentinel ai_runs / zelle_inbound_matches row records "reviewed."
 * Actually the cleanest signal is the zelle_inbound_matches audit row.
 */
export async function ignoreTransaction(input: {
  bankTransactionId: string
}): Promise<BankRecSimpleResult> {
  const parsed = IgnoreSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: txn } = await supabase
    .from('bank_transactions')
    .select(
      'id, organization_id, matched_journal_entry_id, bank_account:bank_account_id(association_id)',
    )
    .eq('id', parsed.data.bankTransactionId)
    .single()
  if (!txn) return { ok: false, error: 'transaction not found' }
  const bankAcct = txn.bank_account as { association_id: string } | null
  if (!bankAcct || bankAcct.association_id !== assoc.id) {
    return { ok: false, error: 'transaction does not belong to this association' }
  }

  // Bind the txn to a sentinel JE? No — keep it null so it stays in the
  // queue if a future audit wants to re-examine. The audit row is the
  // record of "reviewed."
  await supabase
    .from('bank_transactions')
    .update({ match_method: 'manual', match_confidence: 0 })
    .eq('id', txn.id)

  await supabase.from('zelle_inbound_matches').insert({
    organization_id: txn.organization_id,
    bank_transaction_id: txn.id,
    memo_code: 'IGNORED',
    matched_assessment_id: null,
    matched_unit_id: null,
    status: 'manual_override',
    ai_workflow_id: 'W18',
  })

  revalidatePaths()
  return { ok: true }
}

function revalidatePaths(): void {
  revalidatePath('/accounting/bank')
  revalidatePath('/accounting/bank/queue')
  revalidatePath('/accounting/ledger')
}
