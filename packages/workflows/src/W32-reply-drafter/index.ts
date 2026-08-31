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
import { defineWorkflow, type WorkflowExecuteApi, resolveModel, JSON_MODE_PARAMS } from '@homeowner-portal/ai'
import { PROMPT_VERSION, REPLY_DRAFTER_SYSTEM, buildReplyDrafterUserPrompt } from './prompt'
import { validateCitations, InvalidCitationError, UnsupportedQuoteError } from './tools'

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
  // The ONLY citable set. A citation resolves against this array and
  // nothing else, so anything that must never be quoted must never appear
  // here — see `voiceExamples` below.
  fragments: z.array(
    z.object({
      refId: z.string(),
      sourceType: z.enum(['document', 'statute', 'property']),
      label: z.string(),
      text: z.string(),
    }),
  ),
  // The association's own past replies, for TONE ONLY. Never citable, and
  // deliberately carrying no refId — the same treatment `aiContext` gets,
  // and for a sharper reason: the sent-mail corpus these come from is
  // unscoped, so it contains correspondence about other households, with
  // attorneys and with vendors. While they were `fragments`, a verbatim
  // quote from one passed the citation gate cleanly and could be shipped to
  // a different resident under a citation label. Structure, not a prompt
  // rule, is what prevents that now. See prompt.ts rule 4 and
  // apps/hoa/src/lib/inbox/draft/retrieve.ts's `VoiceExample`.
  voiceExamples: z.array(
    z.object({
      subject: z.string().nullable(),
      body: z.string(),
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
  // `label` stays in the schema because the prompt still asks the model for
  // it and a required-but-absent key would fail the parse — but the value
  // the model puts here NEVER survives. `processReplyDrafterResponse`
  // overwrites every label from the retrieved fragment's own label before
  // returning. See the comment there for why it is overwritten rather than
  // compared.
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
  // Bumped for the corrective-retry behavior change below (defineWorkflow's
  // own docstring: bump `version` when prompt OR tool surface changes
  // meaningfully — this changes how run() behaves on a citation failure).
  version: '1.1.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // Declared, not merely enforced in the UI. A draft is a proposal; only a
  // board member can send it. Static per spec §5 W32 (matches W3/W21/W22/W23,
  // which also set this directly rather than flip it conditionally in run()).
  humanApprovalRequired: true,
  inputSchema: ReplyDrafterInputSchema,
  outputSchema: ReplyDrafterOutputSchema,

  async run(input, api, _ctx) {
    return generateReplyDraft(input, api, callModel)
  },
})

// ─── Retry orchestration ────────────────────────────────────────────

/** Injectable seam so `generateReplyDraft` is testable without a live model. */
export type ModelCaller = (
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
) => Promise<{ completion: OpenAI.Chat.ChatCompletion; raw: string }>

/**
 * One model call, and — only when it fails citation validation — exactly
 * one corrective retry that names the specific refId(s) and rule that
 * failed, before giving up.
 *
 * Exported separately from `run()` and takes `callModel` as a parameter for
 * the same reason `processReplyDrafterResponse` is exported separately: the
 * root vitest harness is pure-modules-only (no live model, no database —
 * see vitest.config.ts), and `run()` itself can't be called in isolation
 * because it's closed over by `defineWorkflow`. Injecting the model caller
 * makes the retry/give-up logic itself testable with a fake that returns
 * canned responses.
 */
export async function generateReplyDraft(
  input: ReplyDrafterInput,
  api: WorkflowExecuteApi,
  callModel: ModelCaller,
): Promise<ReplyDrafterOutput> {
  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: REPLY_DRAFTER_SYSTEM },
    { role: 'user', content: buildReplyDrafterUserPrompt(input) },
  ]

  // Running total across attempts: a retry is a second real model call, and
  // under-reporting the tokens actually spent would make the audit row
  // silently wrong about cost.
  let tokensIn = 0
  let tokensOut = 0
  function recordUsage(completion: OpenAI.Chat.ChatCompletion) {
    if (completion.usage) {
      tokensIn += completion.usage.prompt_tokens
      tokensOut += completion.usage.completion_tokens
      api.setTokens(tokensIn, tokensOut)
    }
    api.setModel(completion.model)
  }

  function finalize(output: ReplyDrafterOutput): ReplyDrafterOutput {
    api.addCitations(output.citations.map((c) => c.refId))
    api.setConfidence(output.grounded ? 0.8 : 0.2)
    return output
  }

  const first = await callModel(baseMessages)
  recordUsage(first.completion)

  try {
    return finalize(processReplyDrafterResponse(first.raw, input.fragments))
  } catch (err) {
    if (!(err instanceof InvalidCitationError || err instanceof UnsupportedQuoteError)) {
      throw err
    }

    // Exactly one corrective retry, never a loop: the quote-fidelity gate
    // (tools.ts) rejects real, on-topic drafts whose citation quote was
    // merely re-typed rather than copied verbatim — a formatting mistake,
    // not a fabrication. Retrying once with the SPECIFIC refId(s) and
    // reason named gives the model a real chance to fix exactly that,
    // instead of a board member getting nothing for a fixable slip. This
    // note is recorded on the audit row (setReasoning) so a retried run is
    // visible, not silent.
    api.setReasoning(
      `First draft rejected by citation validation (${err.name}: ${err.message}). ` +
        'Retried once with a corrective instruction naming the exact failure.',
    )

    const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...baseMessages,
      { role: 'assistant', content: first.raw },
      { role: 'user', content: buildCorrectionMessage(err) },
    ]

    const second = await callModel(retryMessages)
    recordUsage(second.completion)

    // Same `processReplyDrafterResponse` / `validateCitations` as the first
    // attempt — the gate is not weakened or bypassed on the retry. If the
    // second attempt also fails, this throws uncaught (as the single
    // -attempt path always did), but with the failure augmented to say both
    // attempts failed rather than silently reporting only the second.
    try {
      return finalize(processReplyDrafterResponse(second.raw, input.fragments))
    } catch (secondErr) {
      if (secondErr instanceof InvalidCitationError || secondErr instanceof UnsupportedQuoteError) {
        // Mutating `.message` (not swallowing/replacing the error) keeps
        // `secondErr` the same InvalidCitationError/UnsupportedQuoteError
        // instance — and therefore still `instanceof`-recognisable by
        // createDraft (via defineWorkflow's `.cause`, see workflow.ts) —
        // while making clear in the audit row and any log that this is the
        // second failure, not the only one.
        secondErr.message = `${secondErr.message} — persisted after one corrective retry (first attempt: ${err.name}: ${err.message})`
      }
      throw secondErr
    }
  }
}

const callModel: ModelCaller = async (messages) => {
  const completion = await getClient().chat.completions.create({
    model: resolveModel(),
    temperature: 0.2,
    max_completion_tokens: 4000,
    response_format: { type: 'json_object' },
    ...JSON_MODE_PARAMS,
    messages,
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  return { completion, raw }
}

/**
 * Names exactly what failed so the retry has a real chance of fixing it:
 * which refId(s), and — for a quote failure — the precise rule (exact
 * substring, no paraphrase) rather than a vague "try again".
 */
function buildCorrectionMessage(err: InvalidCitationError | UnsupportedQuoteError): string {
  if (err instanceof InvalidCitationError) {
    return (
      `Your previous JSON response was rejected: it cited refId(s) ${err.invalidRefIds.join(', ')}, ` +
      'which do not exist anywhere in the SOURCES block above. Only cite a refId that is printed ' +
      'verbatim in SOURCES. Return the corrected JSON only, following the same schema as before.'
    )
  }
  return (
    `Your previous JSON response was rejected: the "quote" field for refId(s) ${err.unsupportedRefIds.join(', ')} ` +
    "was not found as an exact substring inside that refId's own text in SOURCES. Every \"quote\" must be " +
    'copied character-for-character from SOURCES — no paraphrasing, no reworded or reordered text, no ' +
    'fixed punctuation, no ellipsis. Fix the quote(s) for the refId(s) named above so each one is an exact ' +
    'substring of that refId\'s text (or drop that citation and the claim it supports if no exact quote ' +
    'supports it). Return the corrected JSON only, following the same schema as before.'
  )
}

/** Convenience wrapper matching queryGoverningDocs / askStateLaw. */
export async function draftReply(
  input: ReplyDrafterInput,
  ctx: { organizationId: string },
): Promise<ReplyDrafterOutput & { runId: string }> {
  const result = await replyDrafter.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}

export { InvalidCitationError, UnsupportedQuoteError }

// ─── Helpers ─────────────────────────────────────────────────────────

function parseModelJson(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('parsed value is not an object')
  } catch (err) {
    // Never log raw, and never log err.message/String(err) — for a
    // JSON.parse SyntaxError, the message embeds a prefix of the offending
    // input, which here is the model's rendering of thread content (a
    // resident's name, address, balance, etc). Log only the error's type
    // and safe, non-content metadata.
    const errorName = err instanceof Error ? err.name : 'UnknownError'
    console.error('[W32] model response parse failed', { errorName, responseLength: raw.length })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
}

/**
 * Parse + schema-validate the model's raw JSON response, enforce the
 * citation gate against the fragments this run actually retrieved, then
 * replace every citation label with the retrieved fragment's own.
 *
 * The gate (tools.ts) checks two things: that every cited refId was
 * actually retrieved, and that the citation's `quote` really occurs in that
 * refId's text. Neither looks at `label`, and `label` is the only part of a
 * citation the board member actually reads — DraftPanel.tsx renders
 * `label — "quote"` and never shows the refId. So a model could emit
 * `{ refId: 'prop:context', quote: <a real line from the property record>,
 * label: 'CC&Rs §4.2' }`, pass every gate, and put a fabricated authority
 * in front of the reviewer with the one field that would expose it hidden.
 *
 * The fix is to stop treating `label` as model output at all. Retrieval
 * already knows each fragment's authoritative label (retrieve.ts's
 * `collectFragments`), so it is taken from there unconditionally. The
 * model's label is DISCARDED, not compared: a mismatch check would have to
 * decide what counts as "close enough", and there is no reason to grant the
 * model any authorship of an attribution in the first place. The fallback
 * is the refId itself, never the model's string — after `validateCitations`
 * every refId is present in the map, so it is unreachable, but it must fail
 * toward something non-model-authored rather than back to the value this
 * exists to discard.
 *
 * Exported separately from `run()` so the citation gate is unit-testable
 * without a live model or database — this repo's root vitest harness is
 * deliberately pure-modules-only (see vitest.config.ts), and `run()` itself
 * can't be called in isolation because it's closed over by `defineWorkflow`.
 *
 * `validateCitations` is intentionally left to throw uncaught: a fabricated
 * refId, or a quote that isn't actually in the cited fragment, fails the
 * whole draft rather than being silently dropped while the rest is kept.
 */
export function processReplyDrafterResponse(
  raw: string,
  retrievedFragments: Array<{ refId: string; label: string; text: string }>,
): ReplyDrafterOutput {
  const parsed = parseModelJson(raw)
  const output = ReplyDrafterOutputSchema.parse(parsed)
  validateCitations(output.citations, retrievedFragments)

  const labelByRefId = new Map(retrievedFragments.map((f) => [f.refId, f.label]))
  return {
    ...output,
    citations: output.citations.map((c) => ({
      refId: c.refId,
      quote: c.quote,
      label: labelByRefId.get(c.refId) ?? c.refId,
    })),
  }
}
