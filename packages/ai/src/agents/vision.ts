import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL_VISION,
  apiKey: process.env.AI_API_KEY || 'local',
})

const MODEL_VISION = process.env.AI_MODEL_VISION ?? 'Qwen/Qwen2-VL-7B-Instruct'

export async function analyzeImage(params: {
  imageUrl: string
  question: string
  max_tokens?: number
}): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_VISION,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: params.imageUrl } },
          { type: 'text', text: params.question },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: params.max_tokens ?? 512,
  })
  return res.choices[0]?.message?.content ?? ''
}
