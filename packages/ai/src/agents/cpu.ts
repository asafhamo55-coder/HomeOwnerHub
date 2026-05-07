import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_FALLBACK_URL,
  apiKey: 'local',
})

const MODEL_CPU = process.env.AI_FALLBACK_MODEL ?? 'qwen2.5:7b'

// Always-warm CPU fallback (Ollama / llama.cpp). Slower but reliable when
// the GPU pod is restarting or unreachable.
export async function runCPU(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_CPU,
    messages,
    temperature: 0.2,
    max_tokens: opts?.max_tokens ?? 800,
  })
  return res.choices[0]?.message?.content ?? ''
}
