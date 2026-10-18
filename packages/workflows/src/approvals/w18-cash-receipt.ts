// W18 Step A's cash receipt, as an approval action.
//
// Before sub-project D, W18 posted this itself the moment memo + amount
// matched. Now W18 proposes it (buildCashReceiptProposal) and this
// executor posts it after a board member or admin approves. The JE and
// side effects are the same shape W18 Step A and bank-rec.ts's
// confirmFuzzyMatch produce: Dr Cash / Cr AR in the bank account's fund,
// a payments row, the assessment flipped to paid/partial, and a
// zelle_inbound_matches audit row.

import { z } from 'zod'
import { loadAccountingRefs, postJournalEntry, type Json } from '@homeowner-portal/db'
import type { ApprovalExecutor, ProposeApprovalInput } from './index'
import { completePaidOffPlans } from '../payment-plans/settle'

export const W18_CASH_RECEIPT = 'w18.cash_receipt'

export const CashReceiptPayloadSchema = z.object({
  bankTransactionId: z.string().uuid(),
  associationId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  unitId: z.string().uuid().nullable(),
  fiscalPeriodId: z.string().uuid(),
  bankFundId: z.string().uuid(),
  amount: z.number().positive(),
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memoCode: z.string(),
})
export type CashReceiptPayload = z.infer<typeof CashReceiptPayloadSchema>

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function buildCashReceiptProposal(
  organizationId: string,
  payload: CashReceiptPayload,
): ProposeApprovalInput {
  return {
    organizationId,
    workflowId: 'W18',
    actionType: W18_CASH_RECEIPT,
    subjectType: 'bank_transaction',
    subjectId: payload.bankTransactionId,
    payload: payload as unknown as Json,
    summary: `Zelle ${payload.memoCode}: ${usd(payload.amount)} received ${payload.postedDate} → assessment ${payload.assessmentId.slice(0, 8)}`,
    amount: payload.amount,
  }
}

const toCents = (n: number) => Math.round(n * 100)

/**
 * Pure re-validation against current state. The proposal was a snapshot;
 * a manager may have matched the transaction by hand, the assessment may
 * have been paid or waived, or the row may be gone.
 */
export function validateCashReceipt(
  payload: CashReceiptPayload,
  txn: {
    amount: number | string
    matched_journal_entry_id: string | null
    association_id: string | null
  } | null,
  assessment: { association_id: string; amount: number | string; status: string } | null,
): { ok: true; newAssessmentStatus: 'paid' | 'partial' } | { ok: false; error: string } {
  if (!txn) return { ok: false, error: 'bank transaction no longer exists' }
  if (txn.matched_journal_entry_id) {
    return {
      ok: false,
      error: `bank transaction already matched to journal entry ${txn.matched_journal_entry_id}`,
    }
  }
  if (txn.association_id !== payload.associationId) {
    return { ok: false, error: 'bank transaction is no longer in this association' }
  }
  if (toCents(Number(txn.amount)) !== toCents(payload.amount)) {
    return { ok: false, error: 'bank transaction amount no longer matches the proposal' }
  }
  if (!assessment || assessment.association_id !== payload.associationId) {
    return { ok: false, error: 'assessment not found in this association' }
  }
  if (assessment.status !== 'open' && assessment.status !== 'partial') {
    return { ok: false, error: `assessment is ${assessment.status}` }
  }
  return {
    ok: true,
    newAssessmentStatus: payload.amount >= Number(assessment.amount) ? 'paid' : 'partial',
  }
}

export const executeW18CashReceipt: ApprovalExecutor = async (db, request) => {
  const parsed = CashReceiptPayloadSchema.safeParse(request.payload)
  if (!parsed.success) {
    return { ok: false, error: `invalid payload: ${parsed.error.issues[0]?.message}` }
  }
  const p = parsed.data

  const [{ data: txnRow }, { data: assessment }, refs] = await Promise.all([
    db
      .from('bank_transactions')
      .select('id, amount, matched_journal_entry_id, bank_account:bank_account_id(association_id)')
      .eq('id', p.bankTransactionId)
      .maybeSingle(),
    db
      .from('assessments')
      .select('id, association_id, amount, status')
      .eq('id', p.assessmentId)
      .maybeSingle(),
    loadAccountingRefs(db, p.associationId),
  ])

  const txn = txnRow
    ? {
        amount: txnRow.amount,
        matched_journal_entry_id: txnRow.matched_journal_entry_id,
        association_id:
          (txnRow.bank_account as { association_id: string } | null)?.association_id ?? null,
      }
    : null

  const check = validateCashReceipt(p, txn, assessment)
  if (!check.ok) return check
  if (!refs) return { ok: false, error: 'accounting refs missing for this association' }

  const je = await postJournalEntry(db, {
    organizationId: request.organization_id,
    associationId: p.associationId,
    fiscalPeriodId: p.fiscalPeriodId,
    entryDate: p.postedDate,
    memo: `Zelle: ${p.memoCode} → assessment ${p.assessmentId.slice(0, 8)} (approved)`,
    source: 'bank_rec',
    sourceId: p.bankTransactionId,
    aiGenerated: true,
    aiWorkflowId: 'W18',
    createdBy: request.decided_by ?? undefined,
    lines: [
      { accountId: refs.acctCashOperating, fundId: p.bankFundId, debit: p.amount, credit: 0 },
      { accountId: refs.acctAR, fundId: p.bankFundId, debit: 0, credit: p.amount },
    ],
  })
  // postJournalEntry deletes its own header on failure — nothing posted.
  if (!je.ok) return { ok: false, error: `journal entry failed: ${je.error}` }

  // From here the JE exists: never throw, never return ok:false. Collect
  // problems into a warning so the request is recorded as posted.
  const problems: string[] = []

  // Link first, and only if still unmatched. Zero rows means someone
  // matched it in the window since validation — flag for review.
  const link = await db
    .from('bank_transactions')
    .update({
      matched_journal_entry_id: je.journalEntryId,
      match_method: 'auto_exact',
      match_confidence: 0.99,
    })
    .eq('id', p.bankTransactionId)
    .is('matched_journal_entry_id', null)
    .select('id')
  if (link.error) problems.push(`link: ${link.error.message}`)
  else if ((link.data ?? []).length === 0) {
    problems.push(
      `bank transaction was matched concurrently — journal entry ${je.journalEntryId} may duplicate it; review`,
    )
  }

  const results = await Promise.all([
    db.from('payments').insert({
      organization_id: request.organization_id,
      unit_id: p.unitId,
      assessment_id: p.assessmentId,
      amount: p.amount,
      payment_method: 'zelle_assisted',
      external_ref: p.bankTransactionId,
      // postedDate is a calendar date. Noon UTC keeps it that day in every
      // US zone; UTC midnight read as the evening before (BL-043).
      paid_at: `${p.postedDate}T12:00:00Z`,
      journal_entry_id: je.journalEntryId,
    }),
    db
      .from('assessments')
      .update({ status: check.newAssessmentStatus })
      .eq('id', p.assessmentId),
    db.from('zelle_inbound_matches').insert({
      organization_id: request.organization_id,
      bank_transaction_id: p.bankTransactionId,
      memo_code: p.memoCode,
      matched_assessment_id: p.assessmentId,
      matched_unit_id: p.unitId,
      status: 'matched',
      ai_workflow_id: 'W18',
    }),
  ])
  const labels = ['payment', 'assessment', 'zelle_inbound_matches']
  results.forEach((r, i) => {
    if (r.error) problems.push(`${labels[i]}: ${r.error.message}`)
  })

  // BL-080: this payment may have paid off the unit's payment plan. The
  // nightly run catches anything missed here, so a failure is a warning.
  if (p.unitId && !results[0].error) {
    try {
      await completePaidOffPlans(db, {
        organizationId: request.organization_id,
        associationId: p.associationId,
        unitIds: [p.unitId],
        today: p.postedDate,
        actorUserId: request.decided_by,
        trigger: 'payment',
      })
    } catch (err) {
      problems.push(`payment plan check: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }

  return {
    ok: true,
    resultRef: je.journalEntryId,
    ...(problems.length > 0 ? { warning: problems.join('; ') } : {}),
  }
}
