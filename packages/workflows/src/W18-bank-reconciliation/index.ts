// W18 — Bank Reconciliation Agent
//
// The reconciliation half of ADR-005's Pay-by-Zelle UX. Given an unmatched
// bank transaction, runs through:
//   A. Exact memo + amount match → auto-post JE, mark assessment paid
//   B. Fuzzy memo + amount match → manager queue with high-confidence hint
//   C. Duplicate of a recent JE → link, don't double-post
//   D. Unmatched → call LLM for categorization suggestion + queue
//
// Steps A/B/C are deterministic. The LLM only runs for Step D. This keeps
// the audit log readable and the auto-match path explainable to a
// treasurer in plain English.
//
// Acceptance (spec §5 W18): ≥ 70% auto-match rate at ≥ 95% accuracy on
// Madison Park's last 90 days. Eval suite lives in eval.ts.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel } from '@homeowner-portal/ai'
import {
  createAdminClient,
  loadAccountingRefs,
  postJournalEntry,
} from '@homeowner-portal/db'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'
import {
  amountsMatchExact,
  amountsMatchFuzzy,
  AUTO_POST_CONFIDENCE_FLOOR,
  DUPLICATE_JE_WINDOW_DAYS,
  EXACT_MEMO_MATCH_CONFIDENCE,
  parseMemoCode,
} from './tools'

// LLM client — same pattern as other workflows (e.g. W3, W21). The
// AI_BASE_URL env var lets ops swap from OpenAI to a self-hosted
// llama-3.3 endpoint without code changes.
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

// ─── Public types ────────────────────────────────────────────────────

export const BankReconciliationInputSchema = z.object({
  bankTransactionId: z.string().uuid(),
})

export type BankReconciliationInput = z.infer<typeof BankReconciliationInputSchema>

export const BankReconciliationOutputSchema = z.object({
  matchMethod: z.enum(['auto_exact', 'auto_fuzzy', 'duplicate_je', 'unmatched']),
  matchedJournalEntryId: z.string().uuid().nullable(),
  matchedAssessmentId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
  suggestedCategorization: z
    .object({
      accountNumber: z.string(),
      fundCode: z.string(),
      memo: z.string(),
    })
    .nullable(),
  notes: z.string(),
})

export type BankReconciliationOutput = z.infer<typeof BankReconciliationOutputSchema>

// ─── Workflow ────────────────────────────────────────────────────────

export const bankReconciliationAgent = defineWorkflow({
  id: 'W18',
  name: 'Bank Reconciliation Agent',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // Step A's auto-post does NOT require human approval. B/C/D do; the
  // body flips this per-run via api.requireHumanApproval().
  humanApprovalRequired: false,
  inputSchema: BankReconciliationInputSchema,
  outputSchema: BankReconciliationOutputSchema,

  async run(input, api, ctx) {
    const db = createAdminClient()

    // Load the bank transaction + its account context. Service-role bypass
    // is intentional: this workflow runs from the Plaid webhook with no
    // user session attached.
    const { data: txn, error: txnErr } = await db
      .from('bank_transactions')
      .select(
        'id, organization_id, bank_account_id, plaid_transaction_id, amount, posted_date, memo, merchant, matched_journal_entry_id, bank_account:bank_account_id(id, association_id, fund_id, account_name)',
      )
      .eq('id', input.bankTransactionId)
      .single()

    if (txnErr || !txn) {
      throw new Error(`bank_transaction_not_found: ${input.bankTransactionId}`)
    }

    type BankAcct = {
      id: string
      association_id: string
      fund_id: string
      account_name: string
    } | null
    const bankAccount = txn.bank_account as BankAcct
    if (!bankAccount) {
      throw new Error('bank_transaction has no bank_account')
    }

    // Already matched (idempotent re-fire): short-circuit. Could happen
    // if the webhook delivers duplicates or a manual disposition raced
    // the cron.
    if (txn.matched_journal_entry_id) {
      api.setConfidence(1)
      return {
        matchMethod: 'duplicate_je' as const,
        matchedJournalEntryId: txn.matched_journal_entry_id,
        matchedAssessmentId: null,
        confidence: 1,
        suggestedCategorization: null,
        notes: 'transaction already linked to a journal entry — no-op',
      }
    }

    void ctx // available for correlation logging when wired

    const memoParts = parseMemoCode(txn.memo)
    const isInbound = Number(txn.amount) > 0

    // ─── Step A: exact memo + amount match ─────────────────────────
    if (memoParts && isInbound) {
      const stepA = await runStepA(db, {
        txnId: txn.id,
        organizationId: txn.organization_id,
        associationId: bankAccount.association_id,
        bankFundId: bankAccount.fund_id,
        amount: Number(txn.amount),
        postedDate: txn.posted_date,
        memoParts,
        ai_workflow_id: 'W18',
      })
      if (stepA) {
        api.setConfidence(stepA.confidence)
        return stepA.output
      }
    }

    // ─── Step C: duplicate JE within 7-day window ─────────────────
    const stepC = await runStepC(db, {
      txnId: txn.id,
      associationId: bankAccount.association_id,
      amount: Number(txn.amount),
      postedDate: txn.posted_date,
    })
    if (stepC) {
      api.setConfidence(stepC.confidence)
      return stepC.output
    }

    // ─── Step B: fuzzy memo + amount, no auto-post ─────────────────
    if (isInbound) {
      const stepB = await runStepB(db, {
        associationId: bankAccount.association_id,
        amount: Number(txn.amount),
        memo: txn.memo,
      })
      if (stepB) {
        api.requireHumanApproval()
        api.setConfidence(stepB.confidence)
        return stepB.output
      }
    }

    // ─── Step D: unmatched, ask LLM for a categorization suggestion ─
    // The LLM never auto-posts (confidence is capped well below the
    // floor). It just enriches the manager-queue card with "here's
    // where I'd code this if I were you" guidance.
    api.requireHumanApproval()

    const stepD = await runStepD(db, {
      txn,
      bankAccount,
      api,
    })
    return stepD
  },
})

// ─── Step D — LLM categorization suggestion ─────────────────────────

async function runStepD(
  db: Db,
  input: {
    txn: {
      amount: number | string
      posted_date: string
      memo: string | null
      merchant: string | null
      organization_id: string
    }
    bankAccount: {
      association_id: string
      fund_id: string
      account_name: string
    }
    api: {
      setConfidence: (v: number) => void
      setReasoning: (s: string) => void
      setTokens: (i: number, o: number) => void
      setModel: (m: string) => void
    }
  },
): Promise<BankReconciliationOutput> {
  const isInbound = Number(input.txn.amount) > 0

  // If no LLM is configured (offline / dev without keys), fall back to
  // the placeholder. The workflow shouldn't fail the run just because
  // the suggestion step is unavailable.
  const apiKey = process.env.AI_API_KEY
  if (!apiKey || apiKey === 'local') {
    input.api.setConfidence(0)
    return {
      matchMethod: 'unmatched',
      matchedJournalEntryId: null,
      matchedAssessmentId: null,
      confidence: 0,
      suggestedCategorization: null,
      notes:
        isInbound
          ? 'inbound deposit without a recognizable memo code or fuzzy match — manager triage (LLM unavailable)'
          : 'outbound payment — manager triage (LLM unavailable)',
    }
  }

  // Fetch the context the prompt needs.
  const [accountsRes, fundsRes, vendorsRes, fundCodeRes] = await Promise.all([
    db
      .from('chart_of_accounts')
      .select('account_number, account_name, account_type')
      .eq('association_id', input.bankAccount.association_id)
      .eq('is_active', true)
      .order('account_number'),
    db
      .from('funds')
      .select('code, name, fund_type')
      .eq('association_id', input.bankAccount.association_id)
      .eq('is_active', true),
    db
      .from('vendors')
      .select('id, legal_name, trades')
      .eq('organization_id', input.txn.organization_id)
      .eq('status', 'active')
      .limit(50),
    db
      .from('funds')
      .select('code')
      .eq('id', input.bankAccount.fund_id)
      .single(),
  ])

  const accounts = (accountsRes.data ?? []).map((a) => ({
    accountNumber: a.account_number,
    accountName: a.account_name,
    accountType: a.account_type,
  }))
  const funds = (fundsRes.data ?? []).map((f) => ({
    code: f.code,
    name: f.name,
    fundType: f.fund_type,
  }))
  const vendors = (vendorsRes.data ?? []).map((v) => ({
    id: v.id,
    legalName: v.legal_name,
    trades: (v.trades ?? []) as string[],
  }))

  const userPrompt = userPromptFor({
    amount: Number(input.txn.amount),
    postedDate: input.txn.posted_date,
    memo: input.txn.memo,
    merchant: input.txn.merchant,
    bankAccountName: input.bankAccount.account_name,
    primaryFundCode: fundCodeRes.data?.code ?? 'OPERATING',
    accounts,
    funds,
    vendors,
  })

  const modelId = resolveModel()
  input.api.setModel(modelId)

  let llmResponse: {
    suggested_account_number?: string
    suggested_fund_code?: string
    suggested_memo?: string
    likely_payment_from_resident?: boolean
    likely_vendor_payment_to?: string | null
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
    reasoning?: string
  } | null = null

  try {
    const completion = await getClient().chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })
    const raw = completion.choices[0]?.message?.content ?? null
    if (completion.usage) {
      input.api.setTokens(
        completion.usage.prompt_tokens ?? 0,
        completion.usage.completion_tokens ?? 0,
      )
    }
    if (raw) {
      try {
        llmResponse = JSON.parse(raw)
      } catch {
        llmResponse = null
      }
    }
  } catch (err) {
    // LLM call failure is non-fatal — fall back to placeholder.
    input.api.setReasoning(
      `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // Confidence stays low — Step D never auto-posts regardless of what
  // the model thinks. Map LLM's qualitative label to a numeric cap.
  const conf =
    llmResponse?.confidence === 'HIGH'
      ? 0.6
      : llmResponse?.confidence === 'MEDIUM'
        ? 0.4
        : llmResponse?.confidence === 'LOW'
          ? 0.2
          : 0
  input.api.setConfidence(conf)
  if (llmResponse?.reasoning) input.api.setReasoning(llmResponse.reasoning)

  const suggested =
    llmResponse?.suggested_account_number && llmResponse?.suggested_fund_code
      ? {
          accountNumber: String(llmResponse.suggested_account_number),
          fundCode: String(llmResponse.suggested_fund_code),
          memo: String(
            llmResponse.suggested_memo ??
              (isInbound ? 'inbound deposit' : 'outbound payment'),
          ),
        }
      : null

  return {
    matchMethod: 'unmatched',
    matchedJournalEntryId: null,
    matchedAssessmentId: null,
    confidence: conf,
    suggestedCategorization: suggested,
    notes:
      llmResponse?.reasoning ??
      (isInbound
        ? 'inbound deposit — manager triage'
        : 'outbound payment — manager triage'),
  }
}

// ─── Step A — exact memo + amount auto-post ─────────────────────────

type Db = ReturnType<typeof createAdminClient>

async function runStepA(
  db: Db,
  input: {
    txnId: string
    organizationId: string
    associationId: string
    bankFundId: string
    amount: number
    postedDate: string
    memoParts: NonNullable<ReturnType<typeof parseMemoCode>>
    ai_workflow_id: string
  },
): Promise<{ output: BankReconciliationOutput; confidence: number } | null> {
  // Look up the open assessment by canonical memo_code. The memo_code
  // index is partial WHERE memo_code IS NOT NULL — fast.
  const { data: candidates } = await db
    .from('assessments')
    .select('id, amount, status, unit_id, fiscal_period_id')
    .eq('association_id', input.associationId)
    .eq('memo_code', input.memoParts.canonical)
    .in('status', ['open', 'partial'])

  const match = (candidates ?? []).find((a) =>
    amountsMatchExact(input.amount, Number(a.amount)),
  )
  if (!match) {
    // Memo code matched but amount didn't — record the audit row so a
    // human can investigate, but don't auto-post.
    await db.from('zelle_inbound_matches').insert({
      organization_id: input.organizationId,
      bank_transaction_id: input.txnId,
      memo_code: input.memoParts.canonical,
      matched_assessment_id: null,
      matched_unit_id: null,
      status: 'unmatched',
      ai_workflow_id: input.ai_workflow_id,
    })
    return null
  }

  const refs = await loadAccountingRefs(db, input.associationId)
  if (!refs) {
    throw new Error(
      `accounting refs missing for association ${input.associationId} — run pnpm seed:accounting`,
    )
  }

  // Cash receipt: Dr Cash (bank account's fund) / Cr AR.
  const je = await postJournalEntry(db, {
    organizationId: input.organizationId,
    associationId: input.associationId,
    fiscalPeriodId: match.fiscal_period_id,
    entryDate: input.postedDate,
    memo: `Zelle: ${input.memoParts.canonical} → assessment ${match.id.slice(0, 8)}`,
    source: 'bank_rec',
    sourceId: input.txnId,
    aiGenerated: true,
    aiWorkflowId: input.ai_workflow_id,
    lines: [
      {
        accountId: refs.acctCashOperating,
        fundId: input.bankFundId,
        debit: input.amount,
        credit: 0,
      },
      {
        accountId: refs.acctAR,
        fundId: input.bankFundId,
        debit: 0,
        credit: input.amount,
      },
    ],
  })

  if (!je.ok) {
    throw new Error(`step_a_je_failed: ${je.error}`)
  }

  // Side effects: cross-link transaction → JE, mark assessment paid,
  // log the audit row.
  await Promise.all([
    db
      .from('bank_transactions')
      .update({
        matched_journal_entry_id: je.journalEntryId,
        match_method: 'auto_exact',
        match_confidence: EXACT_MEMO_MATCH_CONFIDENCE,
      })
      .eq('id', input.txnId),
    db
      .from('payments')
      .insert({
        organization_id: input.organizationId,
        unit_id: match.unit_id,
        assessment_id: match.id,
        amount: input.amount,
        payment_method: 'zelle_assisted',
        external_ref: input.txnId,
        paid_at: new Date(input.postedDate).toISOString(),
        journal_entry_id: je.journalEntryId,
      }),
    db
      .from('assessments')
      .update({
        status:
          input.amount >= Number(match.amount) ? 'paid' : 'partial',
      })
      .eq('id', match.id),
    db.from('zelle_inbound_matches').insert({
      organization_id: input.organizationId,
      bank_transaction_id: input.txnId,
      memo_code: input.memoParts.canonical,
      matched_assessment_id: match.id,
      matched_unit_id: match.unit_id,
      status: 'matched',
      ai_workflow_id: input.ai_workflow_id,
    }),
  ])

  return {
    confidence: EXACT_MEMO_MATCH_CONFIDENCE,
    output: {
      matchMethod: 'auto_exact',
      matchedJournalEntryId: je.journalEntryId,
      matchedAssessmentId: match.id,
      confidence: EXACT_MEMO_MATCH_CONFIDENCE,
      suggestedCategorization: null,
      notes: `auto-matched on memo_code=${input.memoParts.canonical}, amount within $${0.5}`,
    },
  }
}

// ─── Step B — fuzzy memo + amount, queue for human review ───────────

async function runStepB(
  db: Db,
  input: {
    associationId: string
    amount: number
    memo: string | null
  },
): Promise<{ output: BankReconciliationOutput; confidence: number } | null> {
  // No recognizable memo code, but the amount is within 5% of some open
  // assessment. Surface the best candidate to the manager queue.
  const { data: candidates } = await db
    .from('assessments')
    .select('id, amount, unit_id')
    .eq('association_id', input.associationId)
    .in('status', ['open', 'partial'])

  const fuzzy = (candidates ?? []).filter((a) =>
    amountsMatchFuzzy(input.amount, Number(a.amount)),
  )
  if (fuzzy.length === 0) return null

  // The match confidence is "the amount is plausible, the memo is not."
  // Below AUTO_POST_CONFIDENCE_FLOOR by design — never auto-posts.
  const best = fuzzy[0]
  const confidence = 0.7
  return {
    confidence,
    output: {
      matchMethod: 'auto_fuzzy',
      matchedJournalEntryId: null,
      matchedAssessmentId: best.id,
      confidence,
      suggestedCategorization: null,
      notes:
        fuzzy.length === 1
          ? `amount $${input.amount.toFixed(2)} is within 5% of one open assessment — confirm in queue`
          : `amount $${input.amount.toFixed(2)} matches ${fuzzy.length} open assessments — pick in queue`,
    },
  }
  void input.memo
}

// ─── Step C — duplicate JE within window ────────────────────────────

async function runStepC(
  db: Db,
  input: {
    txnId: string
    associationId: string
    amount: number
    postedDate: string
  },
): Promise<{ output: BankReconciliationOutput; confidence: number } | null> {
  const windowStart = new Date(input.postedDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - DUPLICATE_JE_WINDOW_DAYS)
  const windowEnd = new Date(input.postedDate)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + DUPLICATE_JE_WINDOW_DAYS)

  const { data: candidates } = await db
    .from('journal_entries')
    .select(
      'id, entry_date, memo, status, lines:ledger_entries(debit_amount, credit_amount)',
    )
    .eq('association_id', input.associationId)
    .eq('status', 'posted')
    .neq('source', 'bank_rec') // don't match our own auto-posts
    .gte('entry_date', windowStart.toISOString().slice(0, 10))
    .lte('entry_date', windowEnd.toISOString().slice(0, 10))

  type JeRow = {
    id: string
    entry_date: string
    memo: string
    status: string
    lines: { debit_amount: number; credit_amount: number }[]
  }
  const absAmount = Math.abs(input.amount)
  const dupe = (candidates as JeRow[] | null)?.find((je) => {
    const total = (je.lines ?? []).reduce(
      (s, l) => s + Number(l.debit_amount),
      0,
    )
    return amountsMatchExact(total, absAmount)
  })

  if (!dupe) return null

  // Link the bank_transaction to the existing JE — don't double-post.
  await db
    .from('bank_transactions')
    .update({
      matched_journal_entry_id: dupe.id,
      match_method: 'manual', // it's a duplicate of a human's JE
      match_confidence: 0.9,
    })
    .eq('id', input.txnId)

  return {
    confidence: 0.9,
    output: {
      matchMethod: 'duplicate_je',
      matchedJournalEntryId: dupe.id,
      matchedAssessmentId: null,
      confidence: 0.9,
      suggestedCategorization: null,
      notes: `matches existing JE ${dupe.id.slice(0, 8)} posted ${dupe.entry_date}; linked without double-posting`,
    },
  }
}

// AUTO_POST_CONFIDENCE_FLOOR is exported for callers writing their own
// guards (e.g. eval); the workflow itself never auto-posts below it.
export { AUTO_POST_CONFIDENCE_FLOOR }
