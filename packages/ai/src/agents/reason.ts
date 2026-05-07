import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY || 'local',
})

const MODEL_REASON = process.env.AI_MODEL ?? 'Qwen/Qwen2.5-14B-Instruct'

// Temperature 0 + JSON mode = deterministic structured output for compliance
// checks, CC&R matching, and other places we cannot tolerate hallucination.
export async function runReason<T = unknown>(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<T> {
  const res = await client.chat.completions.create({
    model: MODEL_REASON,
    messages,
    temperature: 0.0,
    max_tokens: opts?.max_tokens ?? 512,
    response_format: { type: 'json_object' },
  })
  const text = res.choices[0]?.message?.content ?? '{}'
  return JSON.parse(text) as T
}
