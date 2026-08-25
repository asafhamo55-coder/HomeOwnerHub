import OpenAI from 'openai'
import { resolveModel } from '../model'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY || 'local',
  })
  return _client
}

export const MODEL_MAIN = resolveModel()

export async function runMain(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL_MAIN,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.max_tokens ?? 1500,
  })
  return res.choices[0]?.message?.content ?? ''
}
