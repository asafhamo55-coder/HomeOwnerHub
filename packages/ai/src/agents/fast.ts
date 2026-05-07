import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL_FAST,
  apiKey: process.env.AI_API_KEY || 'local',
})

export const MODEL_FAST = process.env.AI_MODEL_FAST ?? 'Qwen/Qwen2.5-3B-Instruct'

export async function runFast(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_FAST,
    messages,
    temperature: 0.1,
    max_tokens: opts?.max_tokens ?? 256,
  })
  return res.choices[0]?.message?.content ?? ''
}
