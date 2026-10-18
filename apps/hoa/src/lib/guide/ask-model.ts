/**
 * The one model call behind "Ask the guide": Groq's OpenAI-compatible
 * /chat/completions, on the small model chosen by packages/ai
 * (`resolveFastModel`: AI_MODEL_FAST, then AI_MODEL, then
 * DEFAULT_FAST_MODEL). No new model id lives here.
 *
 * Plain fetch, as community-qa does: apps/hoa has no OpenAI SDK. JSON mode
 * with JSON_MODE_PARAMS, which gpt-oss needs or it may think out loud into
 * `content` and fail the JSON check. 8 s timeout (spec §6.3 step 7); every
 * failure throws a fixed message with no provider text, and the caller
 * degrades to the matching articles.
 */
import { JSON_MODE_PARAMS, resolveFastModel } from '@homeowner-portal/ai'
import type { ChatMessage } from './ask-core'

export const ASK_TIMEOUT_MS = 8_000
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

export async function completeAskWithModel(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) throw new Error('ai_not_configured')
  const baseUrl = process.env.AI_BASE_URL?.trim() || GROQ_BASE_URL
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: resolveFastModel(),
      messages,
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      ...JSON_MODE_PARAMS,
    }),
    signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
  })
  // Status only: a provider body can echo the prompt, and the prompt holds the question.
  if (!res.ok) throw new Error(`ai_http_${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('ai_empty_reply')
  return content
}
