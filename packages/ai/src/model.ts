/**
 * The one place the default chat model is named.
 *
 * Before this module existed, twelve workflows plus community-qa each
 * carried their own `process.env.AI_MODEL ?? 'llama-3.3-70b-versatile'`.
 * When Groq decommissioned that model on 2026-08-16 every AI feature in
 * the product broke at once, and fixing it meant finding all twelve copies
 * — which is exactly the failure mode a shared constant prevents.
 * `agents/main.ts` had drifted to a *different* default entirely
 * ('Qwen/Qwen2.5-14B-Instruct'), so the copies were not even consistent.
 *
 * Check `DECOMMISSIONED_MODELS` against
 * https://console.groq.com/docs/deprecations before repinning DEFAULT_MODEL.
 */

/**
 * Ids the provider has retired. A request naming one of these fails fast
 * with a 404, so the only value of the list is to keep a dead id from being
 * pinned again — model.test.ts asserts DEFAULT_MODEL is not in it.
 */
export const DECOMMISSIONED_MODELS: ReadonlySet<string> = new Set([
  'llama-3.3-70b-versatile', // shut down 2026-08-16
  'deepseek-r1-distill-llama-70b', // shut down 2025-10-02
  'llama3-70b-8192', // shut down 2025-08-30
  'mixtral-8x7b-32768', // shut down 2025-03-20
])

/**
 * Groq's own recommended successor to llama-3.3-70b-versatile, and on its
 * Production tier (131k context, 65k max completion). The other suggested
 * replacement, qwen/qwen3.6-27b, is Preview-only — fine for the vision
 * client that already pins it, not for the text path that every workflow
 * depends on.
 */
export const DEFAULT_MODEL = 'openai/gpt-oss-120b'

/** Groq's small Production text model — for the high-volume `fast` path. */
export const DEFAULT_FAST_MODEL = 'openai/gpt-oss-20b'

/**
 * Vision has its OWN default and deliberately never falls back to AI_MODEL:
 * DEFAULT_MODEL is text-only, so borrowing it for an image request fails in
 * a far more confusing way than a missing config would.
 */
export const DEFAULT_VISION_MODEL = 'qwen/qwen3.6-27b'

/**
 * Ids that were never served by ANY provider configured here — HuggingFace
 * repo ids and Ollama tags left over from the self-hosted plan in ADR-002
 * that was never built. Distinct from DECOMMISSIONED_MODELS: those worked
 * once, these never did. Kept so model.test.ts can assert no default is one.
 */
export const NEVER_SERVED_MODELS: ReadonlySet<string> = new Set([
  'Qwen/Qwen2.5-14B-Instruct',
  'Qwen/Qwen2.5-3B-Instruct',
  'Qwen/Qwen2-VL-7B-Instruct',
  'qwen2.5:7b',
])

/** First non-blank value, or undefined. Empty/whitespace counts as absent. */
function firstUsable(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

/**
 * Resolve the chat model id, preferring an explicit override, then
 * AI_MODEL, then DEFAULT_MODEL.
 *
 * Empty and whitespace-only values count as ABSENT. `??` alone does not:
 * Vercel writes `AI_MODEL=""` into pulled env files for Sensitive vars, and
 * `process.env.AI_MODEL ?? DEFAULT_MODEL` happily returns `''` for that,
 * which ships a model-less request to whatever baseURL is configured. That
 * is the 401-from-api.openai.com in ai_runs on 2026-08-02. Same class of
 * bug as the embedding/vision base URLs in empty-env.test.ts.
 */
export function resolveModel(override?: string): string {
  return firstUsable(override, process.env.AI_MODEL) ?? DEFAULT_MODEL
}

/**
 * The `fast` agent's model. AI_MODEL_FAST wins, then the shared AI_MODEL,
 * then the small default — a deployment that only sets AI_MODEL still gets
 * a working fast path rather than a 404.
 */
export function resolveFastModel(): string {
  return firstUsable(process.env.AI_MODEL_FAST, process.env.AI_MODEL) ?? DEFAULT_FAST_MODEL
}

/**
 * The `cloud` agent's model — the daily digest and the dashboard's board
 * insights run through it. Same chain as the chat path with its own
 * override first, and it shares DEFAULT_MODEL rather than owning one:
 * cloud is the same text path, just a different call site.
 *
 * Exists as a named function so /api/health can report what the cloud
 * client will actually use. agents/cloud.ts previously inlined
 * `resolveModel(process.env.AI_MODEL_CLOUD)`, which health could only
 * mirror by duplicating the chain — and a duplicated chain drifts, which
 * is exactly how a health endpoint starts reassuring you about a model
 * nothing is calling.
 */
export function resolveCloudModel(): string {
  return firstUsable(process.env.AI_MODEL_CLOUD, process.env.AI_MODEL) ?? DEFAULT_MODEL
}

/**
 * The vision model. Note the deliberately SHORT chain — AI_MODEL is not
 * consulted, for the reason on DEFAULT_VISION_MODEL above.
 */
export function resolveVisionModel(): string {
  return firstUsable(process.env.AI_MODEL_VISION) ?? DEFAULT_VISION_MODEL
}

/**
 * Extra parameters every `response_format: { type: 'json_object' }` call
 * must carry now that the default model is a reasoning model.
 *
 * `reasoning_format` is REQUIRED to be 'parsed' or 'hidden' in JSON mode
 * (console.groq.com/docs/reasoning). Left unset, gpt-oss emits its chain of
 * thought into `content` alongside the answer, the result is not valid
 * JSON, and Groq rejects the whole request with
 * `400 Failed to generate JSON. Please adjust your prompt.` — which is what
 * broke "Ask the Docs" (W1) on 2026-08-31. It is intermittent, because it
 * depends on whether the model chose to think out loud that turn, so two
 * runs succeeded either side of the failure.
 *
 * 'hidden' rather than 'parsed': none of these workflows read the trace,
 * and the audit row's reasoning field is populated from the workflow's own
 * output, not the provider's.
 *
 * `reasoning_effort` defaults to 'medium' for gpt-oss. Those tokens are
 * billed and counted against the completion budget while contributing
 * nothing to a grounded extract-and-cite task, so these calls opt down to
 * 'low' instead of paying for deliberation they discard.
 */
export const JSON_MODE_PARAMS = {
  reasoning_format: 'hidden',
  reasoning_effort: 'low',
} as const
