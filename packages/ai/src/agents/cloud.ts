import OpenAI from 'openai'

// "Cloud" agent — naming kept for backwards compatibility with callers.
// Now points at the same Qwen 2.5 14B OpenAI-compatible endpoint as
// runMain (your RunPod pod). The intent of the cloud agent was always
// "the place we send short, high-volume summarization tasks." Originally
// that meant Anthropic Claude Haiku for cost; now it means Qwen 14B on
// your own infrastructure.
//
// Operational note: the daily-digest cron at 7am ET hits this. The
// RunPod pod must be warm at that moment, or the digest job logs an
// AI failure and the dashboard digest stays stale until the user
// hits Refresh.

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY || 'local',
  })
  return _client
}

const MODEL_CLOUD = process.env.AI_MODEL_CLOUD ?? 'Qwen/Qwen2.5-14B-Instruct'

export async function runCloud(
  systemPrompt: string,
  userMessage: string,
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL_CLOUD,
    max_tokens: opts?.max_tokens ?? 512,
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}
