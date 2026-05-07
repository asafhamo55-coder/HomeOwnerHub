import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY || 'local',
})

export const MODEL_MAIN = process.env.AI_MODEL ?? 'Qwen/Qwen2.5-14B-Instruct'

export async function runMain(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_MAIN,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.max_tokens ?? 1500,
  })
  return res.choices[0]?.message?.content ?? ''
}
