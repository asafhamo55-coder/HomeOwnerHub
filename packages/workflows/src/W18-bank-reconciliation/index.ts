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
// Madison Park's last 90 days. Eval suite TBD when sandbox fixture lands.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'

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

// ─── LLM client (OpenAI-compatible) ──────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

// ─── Workflow ────────────────────────────────────────────────────────
//
// SKELETON: The matching pipeline (Steps A–D), DB writes, and LLM call
// are stubbed below. The shape, audit-log behavior, and zod contracts
// are real — wiring the pipeline against migration 0006 happens in
// month 3 (spec §9 build order).

export const bankReconciliationAgent = defineWorkflow({
  id: 'W18',
  name: 'Bank Reconciliation Agent',
  version: '0.1.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // Auto-post path (Step A) does NOT require human approval. Steps B/D do.
  // The defineWorkflow primitive flips per-run via api.requireHumanApproval().
  humanApprovalRequired: false,
  inputSchema: BankReconciliationInputSchema,
  outputSchema: BankReconciliationOutputSchema,

  async run(input, api, _ctx) {
    // SKELETON — see acceptance notes in README. Real pipeline runs once
    // the Plaid feed and accounting tables are populated for Madison
    // Park (month 3 per spec §9).
    void input
    void getClient
    void SYSTEM_PROMPT

    api.requireHumanApproval()
    api.setConfidence(0)

    return {
      matchMethod: 'unmatched' as const,
      matchedJournalEntryId: null,
      matchedAssessmentId: null,
      confidence: 0,
      suggestedCategorization: null,
      notes:
        'W18 skeleton — pipeline not yet wired. Manual reconciliation required for now. ' +
        'Implement against migration 0006 (bank_transactions, assessments, journal_entries) in month 3.',
    }
  },
})
