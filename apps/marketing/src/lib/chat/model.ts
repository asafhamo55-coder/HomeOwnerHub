// The one model call behind the chat: the same provider setup as apps/hoa's
// "Ask the guide" (apps/hoa/src/lib/guide/ask-model.ts). OpenAI-compatible
// /chat/completions at AI_BASE_URL (default Groq), key AI_API_KEY, model from
// packages/ai (AI_MODEL_FAST, then AI_MODEL, then the tested fast default).
// Plain fetch with a timeout. Every failure throws a fixed message with no
// provider text: a provider body can echo the visitor's question.

import { JSON_MODE_PARAMS, resolveFastModel } from '@homeowner-portal/ai/model'
import { beforeAiCall } from '@homeowner-portal/ai/guard'
import { MODEL_TIMEOUT_MS } from './limits'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

export function chatKey(): string | undefined {
  return process.env.AI_API_KEY?.trim() || undefined
}

export async function completeChat(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = chatKey()
  if (!apiKey) throw new Error('ai_not_configured')
  const baseUrl = process.env.AI_BASE_URL?.trim() || GROQ_BASE_URL
  // The platform kill switch (AI_PLATFORM_KILL_SWITCH) applies here too.
  beforeAiCall('chat')
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: resolveFastModel(),
      messages,
      temperature: 0.1,
      max_tokens: 450,
      ...JSON_MODE_PARAMS,
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`ai_http_${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('ai_empty_reply')
  return content
}
