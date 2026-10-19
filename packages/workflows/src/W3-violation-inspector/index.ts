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
// row. Inspection mode (BL-028) passes its photo keys as `photoPaths`; they
// are staged with the run for the approval to file, never read by the model.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel, JSON_MODE_PARAMS } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import { retrieveChunks } from '../W1-governing-docs-brain/tools'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'
import {
  RequestedActionSchema,
  StateRulesOutputSchema,
  applyStateRulesToDraft,
  assertRequestedActionAllowed,
  selectStateRules,
  stateRulesPromptContext,
} from './state-rules'

export {
  StatuteRuleRefusalError,
  selectStateRules,
  evaluateRequestedAction,
} from './state-rules'
export type { RequestedAction, StateRuleSet, StateRulesOutput } from './state-rules'

// ─── Public types ────────────────────────────────────────────────────

export const ViolationInspectorInputSchema = z.object({
  unitId: z.string().uuid(),
  violationType: z.string().min(2).max(120),
  description: z.string().min(10).max(4000),
  reporterNotes: z.string().max(2000).nullable().optional(),
  associationId: z.string().uuid().nullable().optional(),
  /** BL-019: the step the board wants drafted. Absent = first notice.
   *  A step the association's state rules forbid is refused before any
   *  model call (StatuteRuleRefusalError). */
  requestedAction: RequestedActionSchema.optional(),
  /** BL-028: storage keys (hoa-photos) of the photos behind this draft.
   *  Not sent to the model: they ride on the staged run so approving the
   *  draft files them on the violation. The caller proves each key is the
   *  org's own upload; W3 only bounds them. */
  photoPaths: z.array(z.string().min(1).max(300)).max(10).optional(),
  /** The caller's Idempotency-Key. Never sent to the model: it is kept so
   *  it lands in ai_runs.input, where POST /api/ai/violations/draft looks
   *  for it to answer a retried request with the draft it already made. */
  idempotencyKey: z.string().min(8).max(128).optional(),
  /** A follow-up letter (second notice, hearing notice, fine, decision)
   *  for an EXISTING violation. Never sent to the model: it rides on the
   *  staged run so approving the draft files the letter on that violation
   *  instead of opening a new one. The caller proves the id is the org's. */
  followUp: z
    .object({
      violationId: z.string().uuid(),
      letterKind: z.string().min(1).max(40).optional(),
      /** The board has not selected "Save to approvals" yet; Approvals
       *  hides the draft until it does (apps/hoa lib/violation-follow-up). */
      awaitingSave: z.literal(true).optional(),
    })
    .optional(),
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
  /** BL-019: the state rule set applied, its validated quotes and any
   *  warnings for the board. Absent on runs before W3 1.1.0. */
  stateRules: StateRulesOutputSchema,
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
  version: '1.1.0',
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

    // BL-019: the association's state picks the rule set. Refuse a
    // forbidden step here, before retrieval or any model call — a refused
    // draft must never be generated, let alone staged.
    const associationState = await loadAssociationState(
      db,
      ctx.organizationId,
      input.associationId ?? null,
    )
    const rules = selectStateRules(associationState)
    assertRequestedActionAllowed(rules, input.requestedAction)
    const step = RequestedActionSchema.parse(input.requestedAction ?? {}).step
    const statuteText = await loadStatuteText(db, rules)

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
            stateRulesContext: stateRulesPromptContext(rules, step),
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

    const recommendedFine = clampInt(
      parsed.recommended_fine_amount_cents,
      0,
      100_000_000,
      2500,
    )
    const statute = applyStateRulesToDraft({
      rules,
      requestedAction: input.requestedAction,
      modelNotice: typeof parsed.notice === 'string' ? parsed.notice : '',
      statuteText,
      recommendedFineAmountCents: recommendedFine,
    })

    return {
      notice: statute.notice,
      citedSection:
        typeof parsed.cited_section === 'string' ? parsed.cited_section : null,
      citations,
      recommendedSeverity: normalizeSeverity(parsed.recommended_severity),
      recommendedFineAmountCents: statute.recommendedFineAmountCents,
      recommendedCurePeriodDays: clampInt(
        parsed.recommended_cure_period_days,
        1,
        180,
        14,
      ),
      confidence,
      stateRules: statute.stateRules,
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

type AdminDb = ReturnType<typeof createAdminClient>

/**
 * `associations.state` for the named association, or the org's primary
 * association (first by name — same rule as apps/hoa getPrimaryAssociation)
 * when none is named. A failed read throws: silently falling back to the
 * generic rules would drop a Florida hearing requirement without saying so.
 */
async function loadAssociationState(
  db: AdminDb,
  organizationId: string,
  associationId: string | null,
): Promise<string | null> {
  let query = db
    .from('associations' as never)
    .select('state')
    .eq('organization_id' as never, organizationId)
  query = associationId
    ? query.eq('id' as never, associationId)
    : query.order('name' as never, { ascending: true })
  const { data, error } = await query.limit(1).maybeSingle<{ state: string | null }>()
  if (error) throw new Error(`association_state_lookup_failed: ${error.code ?? 'error'}`)
  return data?.state ?? null
}

/**
 * The ingested statute body the rule set quotes from. Absent or unreadable
 * text is not an error: the letter keeps its notice language and simply
 * quotes nothing (verifyStatuteQuotes adds a verify-against-the-statute
 * warning). It is never a reason to quote from memory.
 */
async function loadStatuteText(
  db: AdminDb,
  rules: ReturnType<typeof selectStateRules>,
): Promise<string | null> {
  if (!rules.citation || rules.quotes.length === 0 || !rules.state) return null
  const { data, error } = await db
    .from('state_statutes' as never)
    .select('body')
    .eq('state' as never, rules.state)
    .eq('code_citation' as never, rules.citation)
    .is('superseded_at' as never, null)
    .limit(1)
    .maybeSingle<{ body: string }>()
  if (error) {
    console.warn(`[W3] state_statutes read failed: ${error.code ?? 'error'}`)
    return null
  }
  return data?.body ?? null
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
