// W1 — Governing Docs Brain
//
// The single source of truth for "what do the rules say about X?" Every
// downstream workflow (W2 Concierge, W3 Violation, W4 ARC, W13 Work
// Order Triage) calls this to ground its answers.
//
// Acceptance (spec §5 W1): Madison Park's Declaration loaded; answers 20
// hand-curated questions with correct CC&R section citations.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'
import { retrieveChunks } from './tools'

// ─── Public types ────────────────────────────────────────────────────

export const GoverningDocsBrainInputSchema = z.object({
  question: z.string().min(3).max(2000),
  associationId: z.string().uuid().nullable().optional(),
})

export type GoverningDocsBrainInput = z.infer<
  typeof GoverningDocsBrainInputSchema
>

export const GoverningDocsCitationSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  docType: z.string(),
  section: z.string().nullable(),
})

export type GoverningDocsCitation = z.infer<typeof GoverningDocsCitationSchema>

// A recommended next step, tied to a concrete action the portal actually
// offers. Rendered as a dedicated section in the resident UI.
export const GoverningDocsRecommendationSchema = z.object({
  action: z.enum(['arc', 'report_violation', 'ticket']),
  text: z.string(),
})

export type GoverningDocsRecommendation = z.infer<
  typeof GoverningDocsRecommendationSchema
>

export const GoverningDocsBrainOutputSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  citations: z.array(GoverningDocsCitationSchema),
  // A one-sentence follow-up question when the ask is ambiguous; null when
  // the question was specific enough to answer confidently.
  clarification: z.string().nullish(),
  // The single next step to take; null for purely informational questions.
  // `.nullish()` keeps existing callers/returns that omit it valid.
  recommendation: GoverningDocsRecommendationSchema.nullish(),
})

export type GoverningDocsBrainOutput = z.infer<
  typeof GoverningDocsBrainOutputSchema
>

// ─── LLM client (OpenAI-compatible; talks to whatever AI_BASE_URL) ───

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

// ─── Workflow definition ─────────────────────────────────────────────

export const governingDocsBrain = defineWorkflow({
  id: 'W1',
  name: 'Governing Docs Brain',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  humanApprovalRequired: false,
  inputSchema: GoverningDocsBrainInputSchema,
  outputSchema: GoverningDocsBrainOutputSchema,

  async run(input, api, ctx) {
    const retrieved = await retrieveChunks(input.question, {
      organizationId: ctx.organizationId,
      associationId: input.associationId ?? null,
      limit: 8,
    })

    if (retrieved.length === 0) {
      // No grounding chunks — but tell the user WHY. The canned "escalate
      // to board" message is correct when docs exist but the question
      // isn't covered; it's a terrible answer when no docs have been
      // uploaded at all. One extra count query disambiguates and makes
      // the answer actionable.
      api.setConfidence(0)
      const hasDocs = await hasGoverningDocs(
        ctx.organizationId,
        input.associationId ?? null,
      )
      const answer = hasDocs
        ? "I couldn't find anything in the governing documents that addresses that directly. " +
          "Try rephrasing the question, or browse the documents in Documents → Governing. " +
          "If this is a board-decision question, escalate to the board."
        : 'No governing documents are uploaded yet, so there’s nothing for me to search. ' +
          'Upload your CC&Rs, Bylaws, and Rules in Documents → Governing — once parsed, I can answer questions about them.'
      return {
        answer,
        confidence: 'LOW' as const,
        citations: [] as GoverningDocsCitation[],
      }
    }

    api.addCitations(retrieved.map((c) => c.id))

    const client = getClient()
    const completion = await client.chat.completions.create({
      model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.1, // grounded RAG — keep it tight
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPromptFor(input.question, retrieved) },
      ],
    })

    const usage = completion.usage
    if (usage) {
      api.setTokens(usage.prompt_tokens, usage.completion_tokens)
    }
    api.setModel(completion.model)

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = parseModelJson(raw)

    const confidence = normalizeConfidence(parsed.confidence)
    api.setConfidence(
      confidence === 'HIGH' ? 0.95 : confidence === 'MEDIUM' ? 0.7 : 0.3,
    )

    // Re-validate cited chunk ids against what we actually retrieved.
    // The model might hallucinate ids; we trust only the intersection.
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
      answer: typeof parsed.answer === 'string' ? parsed.answer : '',
      confidence,
      citations,
      clarification:
        typeof parsed.clarification === 'string' && parsed.clarification.trim()
          ? parsed.clarification.trim()
          : null,
      recommendation: normalizeRecommendation(parsed.recommendation),
    }
  },
})

// ─── Convenience wrapper used by W2/W3/W4/W5/W13 ─────────────────────

export async function queryGoverningDocs(
  question: string,
  ctx: { organizationId: string; associationId?: string | null },
): Promise<GoverningDocsBrainOutput & { runId: string }> {
  const result = await governingDocsBrain.execute(
    { question, associationId: ctx.associationId ?? null },
    { organizationId: ctx.organizationId },
  )
  return { ...result.output, runId: result.runId }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseModelJson(raw: string): {
  answer?: string
  confidence?: string
  cited_chunk_ids?: string[]
  clarification?: string
  recommendation?: unknown
} {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // model returned non-JSON despite response_format; fall through
  }
  return {}
}

/**
 * Coerce the model's free-form recommendation into our typed shape. The
 * model may emit action "none" (or an unknown value) with empty text — all
 * of those collapse to null so the UI simply omits the next-step section.
 */
function normalizeRecommendation(
  value: unknown,
): GoverningDocsRecommendation | null {
  if (!value || typeof value !== 'object') return null
  const { action, text } = value as { action?: unknown; text?: unknown }
  const cleanText = typeof text === 'string' ? text.trim() : ''
  if (!cleanText) return null
  if (action === 'arc' || action === 'report_violation' || action === 'ticket') {
    return { action, text: cleanText }
  }
  return null
}

function normalizeConfidence(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value
  return 'LOW'
}

/**
 * Cheap existence check — distinguishes "no docs at all" from "docs but
 * no match for this question." Uses head:true so Postgres only returns
 * the count, no rows. Service-role client because the workflow runs from
 * server code without a user session attached.
 *
 * Errors fall back to `false` (the worst case is the user sees the
 * "upload docs" message when they shouldn't — recoverable, not harmful).
 */
async function hasGoverningDocs(
  organizationId: string,
  associationId: string | null,
): Promise<boolean> {
  try {
    const db = createAdminClient()
    let query = db
      .from('governing_document_chunks')
      .select('id', { head: true, count: 'exact' })
      .eq('organization_id', organizationId)
      .limit(1)
    if (associationId) {
      // chunks are joined to docs for association_id; do a join via
      // document_id. We can't `eq` here directly without a JOIN — use a
      // separate count on governing_documents for the association-scoped
      // case.
      const { count } = await db
        .from('governing_documents')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('association_id', associationId)
      return (count ?? 0) > 0
    }
    const { count } = await query
    return (count ?? 0) > 0
  } catch {
    return false
  }
}
