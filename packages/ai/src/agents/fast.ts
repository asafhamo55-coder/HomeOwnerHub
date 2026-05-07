import OpenAI from 'openai'

// Lazy init: never construct the OpenAI client at module-load. Apps may
// import this file's exports (or sibling exports from packages/ai/index)
// from the client, which would otherwise trip the SDK's browser guard.
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL_FAST,
    apiKey: process.env.AI_API_KEY || 'local',
  })
  return _client
}

export const MODEL_FAST = process.env.AI_MODEL_FAST ?? 'Qwen/Qwen2.5-3B-Instruct'

export async function runFast(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL_FAST,
    messages,
    temperature: 0.1,
    max_tokens: opts?.max_tokens ?? 256,
  })
  return res.choices[0]?.message?.content ?? ''
}
