// W23 — Bid Normalizer & Comparator (replaces v1.0 W10)
//
// 2-5 bids, three different PDF layouts -> normalized comparison table +
// flagged exclusions + a board-facing recommendation memo.
//
// Two-phase pipeline:
//   1. Per-bid extraction (deferred to ADR-002 Phase 2.1 vision cutover).
//      Today bids land in `bids` + `bid_line_items` via the public bid
//      submission form, so the values are already structured.
//   2. Cross-bid alignment + memo composition. THIS is what W23 owns.
//
// Acceptance (spec §5 W23): >= 90% line alignment accuracy on 3
// landscape bids; >= 1 real hidden exclusion flagged; board reads memo
// and decides in <= 10 minutes.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel, JSON_MODE_PARAMS } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  userPromptFor,
  type BidSummary,
  type RfpLineItemSummary,
} from './prompt'

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

// LLM-returned JSON (snake_case per prompt contract).
const LlmOutputSchema = z.object({
  comparison_table: z.array(
    z.object({
      rfp_line_item_id: z.string().uuid().nullable(),
      rfp_description: z.string(),
      bids: z.array(
        z.object({
          bid_id: z.string().uuid(),
          vendor_name: z.string(),
          matched_description: z.string().nullable(),
          amount: z.number().nullable(),
          status: z.enum(['matched', 'excluded', 'addition']),
        }),
      ),
    }),
  ),
  flagged_exclusions: z.array(
    z.object({
      bid_id: z.string().uuid(),
      line: z.string(),
      detail: z.string(),
    }),
  ),
  flagged_additions: z.array(
    z.object({
      bid_id: z.string().uuid(),
      line: z.string(),
      detail: z.string(),
    }),
  ),
  payment_term_diffs: z.array(
    z.object({ bid_id: z.string().uuid(), summary: z.string() }),
  ),
  warranty_diffs: z.array(
    z.object({ bid_id: z.string().uuid(), summary: z.string() }),
  ),
  recommendation_memo: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

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
  version: '0.2.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // The memo is advisory — board selects. The workflow never picks a winner.
  humanApprovalRequired: true,
  inputSchema: BidComparatorInputSchema,
  outputSchema: BidComparatorOutputSchema,

  async run(input, api, ctx) {
    const db = createAdminClient()

    // 1. Load the RFP.
    const { data: rfp, error: rfpErr } = await db
      .from('rfps' as never)
      .select('id, association_id, title, scope, organization_id')
      .eq('id', input.rfpId)
      .single<{
        id: string
        association_id: string
        title: string
        scope: string
        organization_id: string
      }>()
    if (rfpErr || !rfp) {
      throw new Error(`rfp_not_found: ${rfpErr?.message ?? input.rfpId}`)
    }

    // 2. Load RFP line items.
    const { data: rfpLineItemRows } = await db
      .from('rfp_line_items' as never)
      .select('id, description, quantity, unit')
      .eq('rfp_id', input.rfpId)
    const rfpLineItems: RfpLineItemSummary[] = (
      (rfpLineItemRows ?? []) as unknown as Array<{
        id: string
        description: string
        quantity: number | null
        unit: string | null
      }>
    ).map((r) => ({
      id: r.id,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
    }))

    // 3. Load all submitted bids + their line items + vendor names.
    const { data: bidRows } = await db
      .from('bids' as never)
      .select(
        'id, vendor_id, total_amount, payment_terms, warranty, start_date, completion_date, vendor:vendors(legal_name)',
      )
      .eq('rfp_id', input.rfpId)
      .eq('status', 'submitted')

    type BidRow = {
      id: string
      vendor_id: string
      total_amount: number
      payment_terms: string | null
      warranty: string | null
      start_date: string | null
      completion_date: string | null
      vendor: { legal_name: string } | null
    }
    const bids = (bidRows ?? []) as unknown as BidRow[]
    if (bids.length < 2) {
      throw new Error(
        `w23_needs_at_least_two_bids: got ${bids.length}. Wait for more bids before comparing.`,
      )
    }

    const bidIds = bids.map((b) => b.id)
    const { data: bidLineRows } = await db
      .from('bid_line_items' as never)
      .select(
        'bid_id, description, quantity, unit_price, line_total, is_excluded, is_addition, notes',
      )
      .in('bid_id', bidIds)
    type BidLineRow = {
      bid_id: string
      description: string
      quantity: number | null
      unit_price: number | null
      line_total: number | null
      is_excluded: boolean
      is_addition: boolean
      notes: string | null
    }
    const lineRows = (bidLineRows ?? []) as unknown as BidLineRow[]
    const linesByBid = new Map<string, BidLineRow[]>()
    for (const l of lineRows) {
      const list = linesByBid.get(l.bid_id) ?? []
      list.push(l)
      linesByBid.set(l.bid_id, list)
    }

    // 4. Load each vendor's compliance status for this RFP's association.
    const vendorIds = Array.from(new Set(bids.map((b) => b.vendor_id)))
    const { data: complianceRows } = await db
      .from('vendor_compliance' as never)
      .select('vendor_id, coi_status')
      .eq('association_id', rfp.association_id)
      .in('vendor_id', vendorIds)
    const complianceByVendor = new Map<
      string,
      'green' | 'yellow' | 'red' | 'missing' | null
    >()
    for (const c of (complianceRows ?? []) as unknown as Array<{
      vendor_id: string
      coi_status: 'green' | 'yellow' | 'red' | 'missing' | null
    }>) {
      complianceByVendor.set(c.vendor_id, c.coi_status)
    }

    const bidSummaries: BidSummary[] = bids.map((b) => ({
      bidId: b.id,
      vendorName: b.vendor?.legal_name ?? '(unknown vendor)',
      totalAmount: b.total_amount,
      paymentTerms: b.payment_terms,
      warranty: b.warranty,
      startDate: b.start_date,
      completionDate: b.completion_date,
      lineItems: (linesByBid.get(b.id) ?? []).map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        lineTotal: l.line_total,
        isExcluded: l.is_excluded,
        isAddition: l.is_addition,
        notes: l.notes,
      })),
      complianceStatus: complianceByVendor.get(b.vendor_id) ?? null,
    }))

    // 5. Build prompt + call LLM.
    const userPrompt = userPromptFor({
      rfpTitle: rfp.title,
      rfpScope: rfp.scope,
      rfpLineItems,
      bids: bidSummaries,
    })

    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      response_format: { type: 'json_object' },
      ...JSON_MODE_PARAMS,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    if (completion.usage) {
      api.setTokens(
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
      )
    }

    const rawJson = completion.choices[0]?.message?.content
    if (!rawJson) throw new Error('w23_empty_llm_response')

    let parsed: z.infer<typeof LlmOutputSchema>
    try {
      parsed = LlmOutputSchema.parse(JSON.parse(rawJson))
    } catch (err) {
      throw new Error(
        `w23_llm_output_invalid: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    api.setConfidence(confidenceToNumber(parsed.confidence))

    const result: BidComparatorOutput = {
      comparisonTable: parsed.comparison_table.map((row) => ({
        rfpLineItemId: row.rfp_line_item_id,
        rfpDescription: row.rfp_description,
        bids: row.bids.map((b) => ({
          bidId: b.bid_id,
          vendorName: b.vendor_name,
          matchedDescription: b.matched_description,
          amount: b.amount,
          status: b.status,
        })),
      })),
      flaggedExclusions: parsed.flagged_exclusions.map((f) => ({
        bidId: f.bid_id,
        line: f.line,
        detail: f.detail,
      })),
      flaggedAdditions: parsed.flagged_additions.map((f) => ({
        bidId: f.bid_id,
        line: f.line,
        detail: f.detail,
      })),
      paymentTermDiffs: parsed.payment_term_diffs.map((p) => ({
        bidId: p.bid_id,
        summary: p.summary,
      })),
      warrantyDiffs: parsed.warranty_diffs.map((w) => ({
        bidId: w.bid_id,
        summary: w.summary,
      })),
      recommendationMemo: parsed.recommendation_memo,
      confidence: parsed.confidence,
    }

    // 6. Upsert into bid_comparisons. Unique constraint is
    // (rfp_id, ai_workflow_id) — we'll get the ai_workflow_id from the
    // workflow execution wrapper post-return, but we need it here too.
    // The wrapper writes ai_runs first then returns the runId, so this
    // upsert happens with a placeholder workflow id derived from the
    // current timestamp. The actual ai_runs link is on the workflow
    // result's `runId`.
    const { error: insertErr } = await db
      .from('bid_comparisons' as never)
      .insert({
        organization_id: rfp.organization_id,
        rfp_id: rfp.id,
        comparison_table: result.comparisonTable,
        flagged_exclusions: result.flaggedExclusions,
        flagged_additions: result.flaggedAdditions,
        payment_term_diffs: result.paymentTermDiffs,
        warranty_diffs: result.warrantyDiffs,
        recommendation_memo: result.recommendationMemo,
        ai_workflow_id: `pending-${Date.now()}-${ctx.organizationId}`,
      } as never)

    if (insertErr) {
      throw new Error(`Could not save comparison: ${insertErr.message}`)
    }

    return result
  },
})

function confidenceToNumber(level: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  if (level === 'HIGH') return 0.9
  if (level === 'MEDIUM') return 0.6
  return 0.3
}
