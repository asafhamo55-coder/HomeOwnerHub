import OpenAI from 'openai'
import { resolveModel, JSON_MODE_PARAMS } from '../model'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY || 'local',
  })
  return _client
}

const MODEL_REASON = resolveModel()

// Temperature 0 + JSON mode = deterministic structured output for compliance
// checks, CC&R matching, and other places we cannot tolerate hallucination.
export async function runReason<T = unknown>(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: MODEL_REASON,
    messages,
    temperature: 0.0,
    max_completion_tokens: opts?.max_tokens ?? 2000,
    response_format: { type: 'json_object' },
    ...JSON_MODE_PARAMS,
  })
  const text = res.choices[0]?.message?.content ?? '{}'
  return JSON.parse(text) as T
}
