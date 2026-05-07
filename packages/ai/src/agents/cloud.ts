import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL_CLOUD = process.env.AI_MODEL_CLOUD ?? 'claude-haiku-4-5'

export async function runCloud(
  systemPrompt: string,
  userMessage: string,
  opts?: { max_tokens?: number },
): Promise<string> {
  const res = await client.messages.create({
    model: MODEL_CLOUD,
    max_tokens: opts?.max_tokens ?? 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  const first = res.content[0]
  return first && first.type === 'text' ? first.text : ''
}
