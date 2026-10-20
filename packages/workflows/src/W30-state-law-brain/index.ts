// W30 — State Law Brain
//
// Per-state RAG over HOA statutes (Module 8 — added in v1.2). Pattern
// mirrors W1 (Governing Docs Brain) exactly, partitioned on `state`
// instead of organization. Answers questions like "When does Georgia
// require an HOA to hold an annual meeting?" grounded in the actual
// statute text with citations like "(O.C.G.A. § 44-3-108)".
//
// Acceptance: 20 hand-curated questions per state answered with the
// correct code section citation. (Same shape as W1 §21 acceptance.)
//
// Disclaimer: this workflow ALWAYS returns informational answers, never
// legal advice. The UI must render the disclaimer line near every
// answer.

import { z } from 'zod'
import OpenAI from 'openai'
import { guardAiClient } from '@homeowner-portal/ai/guard'
import { defineWorkflow, resolveModel, JSON_MODE_PARAMS, type WorkflowExecuteApi } from '@homeowner-portal/ai'
import { isStateLoaded, stateNotLoadedMessage, type CountLiveStatutes } from './coverage'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'
import { countLiveStatutes, retrieveStatuteChunks } from './tools'

export { STATE_LAW_NAMES, stateNotLoadedMessage, isStateLoaded } from './coverage'

// ─── Public types ────────────────────────────────────────────────────

export const StateLawBrainInputSchema = z.object({
  state: z.enum(['GA', 'FL', 'CA', 'TX']),
  question: z.string().min(3).max(2000),
})

export type StateLawBrainInput = z.infer<typeof StateLawBrainInputSchema>

export const StateLawCitationSchema = z.object({
  chunkId: z.string().uuid(),
  statuteId: z.string().uuid(),
  codeCitation: z.string(),
  title: z.string(),
  category: z.string().nullable(),
})

export type StateLawCitation = z.infer<typeof StateLawCitationSchema>

export const StateLawBrainOutputSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  citations: z.array(StateLawCitationSchema),
  disclaimer: z.string(),
  /** false: the state has no statute text on file yet, and the answer says
   *  so instead of answering. Callers must not fall back to a model. The
   *  workflow always sets it; it is optional only so existing callers'
   *  fakes stay valid — test it with `=== false`. */
  stateLoaded: z.boolean().optional(),
})

export type StateLawBrainOutput = z.infer<typeof StateLawBrainOutputSchema>

const DISCLAIMER =
  'This is informational only, not legal advice. Consult a licensed attorney for guidance specific to your association.'

// ─── LLM client ──────────────────────────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = guardAiClient(new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  }))
  return _client
}

// ─── Workflow ────────────────────────────────────────────────────────

export const stateLawBrain = defineWorkflow({
  id: 'W30',
  name: 'State Law Brain',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // Q&A is read-only; no human approval needed for the answer. The
  // disclaimer carries the "this isn't legal advice" load.
  humanApprovalRequired: false,
  inputSchema: StateLawBrainInputSchema,
  outputSchema: StateLawBrainOutputSchema,

  run: (input, api) => runStateLawBrain(input, api),
})

export interface StateLawBrainDeps {
  retrieve: typeof retrieveStatuteChunks
  countLive: CountLiveStatutes
}

const DEFAULT_DEPS: StateLawBrainDeps = { retrieve: retrieveStatuteChunks, countLive: countLiveStatutes }

/**
 * The workflow body. Exported (with injectable retrieval) so the
 * no-statutes guard is unit-testable without a database or a model.
 */
export async function runStateLawBrain(
  input: StateLawBrainInput,
  api: Pick<WorkflowExecuteApi, 'setConfidence' | 'addCitations' | 'setTokens' | 'setModel'>,
  deps: StateLawBrainDeps = DEFAULT_DEPS,
): Promise<StateLawBrainOutput> {
  const retrieved = await deps.retrieve(input.question, { state: input.state, limit: 8 }, api)

  if (retrieved.length === 0) {
    api.setConfidence(0)
    // Nothing retrieved has two very different meanings. If the state has
    // no statute text at all (FL / CA / TX before their first refresh),
    // say exactly that — never imply the law is silent on the question.
    if (!isStateLoaded(await deps.countLive(input.state))) {
      return {
        answer: stateNotLoadedMessage(input.state),
        confidence: 'LOW' as const,
        citations: [],
        disclaimer: DISCLAIMER,
        stateLoaded: false,
      }
    }
    return {
      answer:
        `The statutes I have access to for ${input.state} don't address this directly. Consult an attorney or your state's Attorney General office.`,
      confidence: 'LOW' as const,
      citations: [],
      disclaimer: DISCLAIMER,
      stateLoaded: true,
    }
  }

  api.addCitations(retrieved.map((c) => c.id))

  const completion = await getClient().chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_completion_tokens: 2500,
    response_format: { type: 'json_object' },
    ...JSON_MODE_PARAMS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPromptFor(input.state, input.question, retrieved) },
    ],
  })

  if (completion.usage) {
    api.setTokens(completion.usage.prompt_tokens, completion.usage.completion_tokens)
  }
  api.setModel(completion.model)

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const parsed = parseModelJson(raw, api)

  const confidence = normalizeConfidence(parsed.confidence)
  api.setConfidence(confidence === 'HIGH' ? 0.95 : confidence === 'MEDIUM' ? 0.7 : 0.3)

  // Validate cited chunk ids against what we actually retrieved.
  const retrievedById = new Map(retrieved.map((c) => [c.id, c]))
  const citations: StateLawCitation[] = (parsed.cited_chunk_ids ?? [])
    .filter((id) => retrievedById.has(id))
    .map((id) => {
      const c = retrievedById.get(id)!
      return {
        chunkId: c.id,
        statuteId: c.statuteId,
        codeCitation: c.codeCitation,
        title: c.title,
        category: c.category,
      }
    })

  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer : '',
    confidence,
    citations,
    disclaimer: DISCLAIMER,
    stateLoaded: true,
  }
}

// ─── Convenience wrapper ─────────────────────────────────────────────

export async function askStateLaw(
  question: string,
  state: 'GA' | 'FL' | 'CA' | 'TX',
  ctx: { organizationId: string },
): Promise<StateLawBrainOutput & { runId: string }> {
  const result = await stateLawBrain.execute(
    { state, question },
    { organizationId: ctx.organizationId },
  )
  return { ...result.output, runId: result.runId }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseModelJson(
  raw: string,
  // api param kept positional for symmetry; the workflow runtime captures
  // console output, so we don't need its logger here.
  _api?: unknown,
): {
  answer?: string
  confidence?: string
  cited_chunk_ids?: string[]
} {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('parsed value is not an object')
  } catch (err) {
    // Never log err.message/String(err) — for a JSON.parse SyntaxError, the
    // message embeds a prefix of the offending input, which here is the
    // model's rendering of thread/legal content. Log only the error's type
    // and safe, non-content metadata.
    const errorName = err instanceof Error ? err.name : 'UnknownError'
    console.error('[W30] model response parse failed', { errorName, responseLength: raw.length })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
}

function normalizeConfidence(v: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v
  return 'LOW'
}
