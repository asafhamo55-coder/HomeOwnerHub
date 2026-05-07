import OpenAI from 'openai'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_FALLBACK_URL,
    apiKey: 'local',
  })
  return _client
}

const MODEL_CPU = process.env.AI_FALLBACK_MODEL ?? 'qwen2.5:7b'

// Always-warm CPU fallback (Ollama / llama.cpp). Slower but reliable when
// the GPU pod is restarting or unreachable.
export async function runCPU(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL_CPU,
    messages,
    temperature: 0.2,
    max_tokens: opts?.max_tokens ?? 800,
  })
  return res.choices[0]?.message?.content ?? ''
}
