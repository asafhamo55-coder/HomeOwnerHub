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

export const GoverningDocsBrainOutputSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  citations: z.array(GoverningDocsCitationSchema),
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
      // No grounding chunks — return a low-confidence "I don't know"
      // rather than letting the LLM hallucinate. This is the safety
      // floor the spec demands ("never speculate or invent rules").
      api.setConfidence(0)
      return {
        answer:
          "The governing documents I have access to don't address this directly. Please escalate to the board.",
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
} {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // model returned non-JSON despite response_format; fall through
  }
  return {}
}

function normalizeConfidence(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value
  return 'LOW'
}
