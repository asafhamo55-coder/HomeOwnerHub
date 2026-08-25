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
  const candidate = (override ?? process.env.AI_MODEL ?? '').trim()
  return candidate.length > 0 ? candidate : DEFAULT_MODEL
}
