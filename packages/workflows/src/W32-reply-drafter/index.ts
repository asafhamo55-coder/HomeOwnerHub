// W32 — Reply Drafter
//
// Turns a thread's retrieved context (Task 7's `retrieveForThread`) into a
// suggested reply, written in the association's own voice, with every
// factual claim citable back to a fragment. A board member edits and
// approves it before anything sends — see `humanApprovalRequired` below.
//
// Pattern mirrors W30 (State Law Brain): own OpenAI-compatible client,
// JSON-object response format, citations validated against what was
// actually retrieved (never trust the model's own list of ids).

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, REPLY_DRAFTER_SYSTEM, buildReplyDrafterUserPrompt } from './prompt'
import { validateCitations, InvalidCitationError } from './tools'

// ─── Public types ────────────────────────────────────────────────────

export const ReplyDrafterInputSchema = z.object({
  threadSubject: z.string().nullable(),
  messages: z.array(
    z.object({
      direction: z.enum(['inbound', 'outbound']),
      from: z.string(),
      text: z.string(),
    }),
  ),
  fragments: z.array(
    z.object({
      refId: z.string(),
      sourceType: z.enum(['document', 'statute', 'property', 'past_reply']),
      label: z.string(),
      text: z.string(),
    }),
  ),
  degraded: z.array(z.string()),
  // W1's/W30's own synthesized answers (Task 7's `ThreadRetrieval.aiContext`).
  // Background orientation ONLY — never a citable source. See prompt.ts rule
  // 3 and README "aiContext" section for why this must never get a refId.
  aiContext: z.object({
    governingDocs: z.string().nullable(),
    stateLaw: z.string().nullable(),
  }),
})

export type ReplyDrafterInput = z.infer<typeof ReplyDrafterInputSchema>

export const ReplyDrafterOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  citations: z.array(z.object({ refId: z.string(), quote: z.string(), label: z.string() })),
  blanks: z.array(
    z.object({
      kind: z.enum(['money', 'enforcement', 'legal', 'other_resident']),
      prompt: z.string(),
    }),
  ),
  grounded: z.boolean(),
  groundingNote: z.string().nullable(),
})

export type ReplyDrafterOutput = z.infer<typeof ReplyDrafterOutputSchema>

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

// ─── Workflow ────────────────────────────────────────────────────────

export const replyDrafter = defineWorkflow({
  id: 'W32',
  name: 'Reply Drafter',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // Declared, not merely enforced in the UI. A draft is a proposal; only a
  // board member can send it. Static per spec §5 W32 (matches W3/W21/W22/W23,
  // which also set this directly rather than flip it conditionally in run()).
  humanApprovalRequired: true,
  inputSchema: ReplyDrafterInputSchema,
  outputSchema: ReplyDrafterOutputSchema,

  async run(input, api, _ctx) {
    const completion = await getClient().chat.completions.create({
      model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: REPLY_DRAFTER_SYSTEM },
        { role: 'user', content: buildReplyDrafterUserPrompt(input) },
      ],
    })

    if (completion.usage) {
      api.setTokens(completion.usage.prompt_tokens, completion.usage.completion_tokens)
    }
    api.setModel(completion.model)

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const output = processReplyDrafterResponse(
      raw,
      input.fragments.map((f) => f.refId),
    )

    api.addCitations(output.citations.map((c) => c.refId))
    api.setConfidence(output.grounded ? 0.8 : 0.2)

    return output
  },
})

/** Convenience wrapper matching queryGoverningDocs / askStateLaw. */
export async function draftReply(
  input: ReplyDrafterInput,
  ctx: { organizationId: string },
): Promise<ReplyDrafterOutput & { runId: string }> {
  const result = await replyDrafter.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}

export { InvalidCitationError }

// ─── Helpers ─────────────────────────────────────────────────────────

function parseModelJson(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('parsed value is not an object')
  } catch (err) {
    // Never log raw — it is the model's rendering of thread content.
    console.error('[W32] model response parse failed', { error: String(err) })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
}

/**
 * Parse + schema-validate the model's raw JSON response, then enforce the
 * citation gate against the refIds this run actually retrieved.
 *
 * Exported separately from `run()` so the citation gate is unit-testable
 * without a live model or database — this repo's root vitest harness is
 * deliberately pure-modules-only (see vitest.config.ts), and `run()` itself
 * can't be called in isolation because it's closed over by `defineWorkflow`.
 *
 * `validateCitations` is intentionally left to throw uncaught: a fabricated
 * refId fails the whole draft (see tools.ts / InvalidCitationError) rather
 * than being silently dropped while the rest of the draft is kept.
 */
export function processReplyDrafterResponse(
  raw: string,
  retrievedRefIds: string[],
): ReplyDrafterOutput {
  const parsed = parseModelJson(raw)
  const output = ReplyDrafterOutputSchema.parse(parsed)
  validateCitations(output.citations, retrievedRefIds)
  return output
}
