// W3 — Violation Inspector
//
// Drafts a covenant-violation notice for board approval. Grounds the
// citation in W1 (Governing Docs Brain) so the draft quotes the exact
// clause being enforced; recommends severity, fine amount, and cure
// period. Never auto-sends — every draft is staged as
// `pending_human_approval` in ai_runs and shows up on the board's
// approval queue page.
//
// Acceptance per spec §5 W3: 60% of drafts approved without edits;
// 95%+ cite the correct CC&R section. Eval suite TBD when Madison Park
// supplies historical violations + outcomes.
//
// Phase 2.0: text-only. The spec calls for a vision step (photo →
// classify); ADR-002 defers that to Phase 2.1 alongside self-hosted
// Qwen2-VL. Today the input is the reporter's text description; the
// wizard's photo upload happens separately and lands on the violation
// row, not on the workflow input.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel, JSON_MODE_PARAMS } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import { retrieveChunks } from '../W1-governing-docs-brain/tools'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const ViolationInspectorInputSchema = z.object({
  unitId: z.string().uuid(),
  violationType: z.string().min(2).max(120),
  description: z.string().min(10).max(4000),
  reporterNotes: z.string().max(2000).nullable().optional(),
  associationId: z.string().uuid().nullable().optional(),
})

export type ViolationInspectorInput = z.infer<
  typeof ViolationInspectorInputSchema
>

export const ViolationInspectorOutputSchema = z.object({
  notice: z.string(),
  citedSection: z.string().nullable(),
  citations: z.array(
    z.object({
      chunkId: z.string().uuid(),
      documentId: z.string().uuid(),
      docType: z.string(),
      section: z.string().nullable(),
    }),
  ),
  recommendedSeverity: z.enum(['low', 'medium', 'high']),
  recommendedFineAmountCents: z.number().int().min(0),
  recommendedCurePeriodDays: z.number().int().min(1).max(180),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

export type ViolationInspectorOutput = z.infer<
  typeof ViolationInspectorOutputSchema
>

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

export const violationInspector = defineWorkflow({
  id: 'W3',
  name: 'Violation Inspector',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  humanApprovalRequired: true, // spec §5 W3: mandatory board approval
  inputSchema: ViolationInspectorInputSchema,
  outputSchema: ViolationInspectorOutputSchema,

  async run(input, api, ctx) {
    // Look up the unit + current owner. The v1 schema is `units` +
    // open-ended `ownerships` (valid_to IS NULL = current). Service-role
    // client because workflow runs are server-side and the upstream
    // caller (API route) has already authorized.
    const db = createAdminClient()
    const { data: unit, error: unitErr } = await db
      .from('units' as never)
      .select('id, organization_id, address_line1, address_line2, unit_number')
      .eq('id' as never, input.unitId)
      .eq('organization_id' as never, ctx.organizationId)
      .single<UnitRow>()

    if (unitErr || !unit) {
      throw new Error(`unit_not_found: ${unitErr?.message ?? 'no row'}`)
    }

    const unitAddress = formatUnitAddress(unit)

    const { data: owner } = (await db
      .from('ownerships' as never)
      .select('owner_name, owner_email')
      .eq('unit_id' as never, input.unitId)
      .is('valid_to' as never, null)
      .order('valid_from' as never, { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as {
      data: { owner_name: string | null; owner_email: string | null } | null
    }

    // Build a focused query for W1: the violation type + a snippet of
    // the description. This is what gets embedded / FTS-searched against
    // the governing-doc chunks.
    const w1Query = buildRagQuery(input.violationType, input.description)

    const retrieved = await retrieveChunks(w1Query, {
      organizationId: ctx.organizationId,
      associationId: input.associationId ?? null,
      limit: 6,
    })

    api.addCitations(retrieved.map((c) => c.id))

    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      temperature: 0.2, // some variability is OK in the prose; not the citation
      max_completion_tokens: 3000,
      response_format: { type: 'json_object' },
      ...JSON_MODE_PARAMS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: userPromptFor({
            violationType: input.violationType,
            description: input.description,
            unitAddress,
            ownerName: owner?.owner_name ?? null,
            reporterNotes: input.reporterNotes ?? null,
            chunks: retrieved.map((c) => ({
              id: c.id,
              docType: c.docType,
              section: c.section,
              text: c.text,
            })),
          }),
        },
      ],
    })

    if (completion.usage) {
      api.setTokens(completion.usage.prompt_tokens, completion.usage.completion_tokens)
    }
    api.setModel(completion.model)

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = parseModelJson(raw)

    const confidence = normalizeConfidence(parsed.confidence)
    api.setConfidence(
      confidence === 'HIGH' ? 0.95 : confidence === 'MEDIUM' ? 0.7 : 0.4,
    )

    // Trust only chunk ids the model cited that we actually retrieved.
    const retrievedIds = new Set(retrieved.map((c) => c.id))
    const validCitedIds = (parsed.cited_chunk_ids ?? []).filter((id) =>
      retrievedIds.has(id),
    )
    const citations = retrieved
      .filter((c) => validCitedIds.includes(c.id))
      .map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        docType: c.docType,
        section: c.section,
      }))

    return {
      notice: typeof parsed.notice === 'string' ? parsed.notice : '',
      citedSection:
        typeof parsed.cited_section === 'string' ? parsed.cited_section : null,
      citations,
      recommendedSeverity: normalizeSeverity(parsed.recommended_severity),
      recommendedFineAmountCents: clampInt(
        parsed.recommended_fine_amount_cents,
        0,
        100_000_000,
        2500,
      ),
      recommendedCurePeriodDays: clampInt(
        parsed.recommended_cure_period_days,
        1,
        180,
        14,
      ),
      confidence,
    }
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────

interface UnitRow {
  id: string
  organization_id: string
  address_line1: string
  address_line2: string | null
  unit_number: string | null
}

function formatUnitAddress(u: UnitRow): string {
  const parts = [u.address_line1]
  if (u.unit_number) parts.push(`Unit ${u.unit_number}`)
  if (u.address_line2) parts.push(u.address_line2)
  return parts.filter(Boolean).join(', ')
}

function buildRagQuery(violationType: string, description: string): string {
  // Short, focused query; embeddings / FTS work better on tight phrases.
  // Trim the description so we don't drown the retrieval in noise.
  const trimmed = description.length > 240
    ? description.slice(0, 240) + '...'
    : description
  return `${violationType} — ${trimmed}`
}

function parseModelJson(raw: string): {
  notice?: string
  cited_section?: string | null
  cited_chunk_ids?: string[]
  recommended_severity?: string
  recommended_fine_amount_cents?: number
  recommended_cure_period_days?: number
  confidence?: string
} {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // model returned non-JSON; fall through to empty
  }
  return {}
}

function normalizeConfidence(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value
  return 'LOW'
}

function normalizeSeverity(value: unknown): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'low'
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  const i = Math.round(value)
  if (i < min) return min
  if (i > max) return max
  return i
}
