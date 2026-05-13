// W23 — Bid Normalizer & Comparator (replaces v1.0 W10)
//
// 2–5 bids, three different PDF layouts → normalized comparison table +
// flagged exclusions + a board-facing recommendation memo.
//
// Two-phase: first, vision/LLM extracts each bid into bid_line_items
// (the per-bid extraction can run when a bid is submitted, not at
// comparison time). Second, this workflow runs cross-bid alignment +
// memo composition.
//
// SKELETON. Per-bid extraction depends on the vision model coming
// online (ADR-002 Phase 2.1). Cross-bid alignment is text-only and
// can run today against bids that were submitted via the
// structured-form fallback.
//
// Acceptance (spec §5 W23): ≥ 90% line alignment accuracy on 3
// landscape bids; ≥ 1 real hidden exclusion flagged; board reads memo
// and decides in ≤ 10 minutes.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const BidComparatorInputSchema = z.object({
  rfpId: z.string().uuid(),
})

export type BidComparatorInput = z.infer<typeof BidComparatorInputSchema>

export const ComparisonRowSchema = z.object({
  rfpLineItemId: z.string().uuid().nullable(),
  rfpDescription: z.string(),
  bids: z.array(
    z.object({
      bidId: z.string().uuid(),
      vendorName: z.string(),
      matchedDescription: z.string().nullable(),
      amount: z.number().nullable(),
      status: z.enum(['matched', 'excluded', 'addition']),
    }),
  ),
})

export const FlaggedItemSchema = z.object({
  bidId: z.string().uuid(),
  line: z.string(),
  detail: z.string(),
})

export const PerBidSummarySchema = z.object({
  bidId: z.string().uuid(),
  summary: z.string(),
})

export const BidComparatorOutputSchema = z.object({
  comparisonTable: z.array(ComparisonRowSchema),
  flaggedExclusions: z.array(FlaggedItemSchema),
  flaggedAdditions: z.array(FlaggedItemSchema),
  paymentTermDiffs: z.array(PerBidSummarySchema),
  warrantyDiffs: z.array(PerBidSummarySchema),
  recommendationMemo: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

export type BidComparatorOutput = z.infer<typeof BidComparatorOutputSchema>

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

export const bidComparator = defineWorkflow({
  id: 'W23',
  name: 'Bid Normalizer & Comparator',
  version: '0.1.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // The memo is advisory — board selects. The workflow never picks a winner.
  humanApprovalRequired: true,
  inputSchema: BidComparatorInputSchema,
  outputSchema: BidComparatorOutputSchema,

  async run(input, api, _ctx) {
    // SKELETON. Pipeline that lands in month 4 per spec §9:
    //   1. Load the RFP + rfp_line_items
    //   2. Load all submitted bids + bid_line_items
    //   3. Load each vendor's compliance status from vendor_compliance
    //   4. Format with userPromptFor() and call the LLM in JSON mode
    //   5. Validate the output, upsert bid_comparisons
    void input
    void getClient
    void SYSTEM_PROMPT

    api.setConfidence(0)

    return {
      comparisonTable: [],
      flaggedExclusions: [],
      flaggedAdditions: [],
      paymentTermDiffs: [],
      warrantyDiffs: [],
      recommendationMemo:
        'W23 skeleton — bid comparison pipeline awaits per-bid extraction (vision-model cutover, ADR-002 Phase 2.1) and the comparator UI in month 4 per spec §9.',
      confidence: 'LOW' as const,
    }
  },
})
