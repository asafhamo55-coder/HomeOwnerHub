import OpenAI from 'openai'
import { resolveVisionModel } from '../model'

/**
 * Image understanding, via whichever OpenAI-compatible endpoint serves a
 * vision model.
 *
 * `AI_BASE_URL_VISION` exists because ADR-002 planned a SEPARATE self-hosted
 * box for vision (vLLM serving Qwen2-VL alongside Llama 70B on its own
 * machine). That box was never built, so the variable was never set, and an
 * unset `baseURL` sends every call to api.openai.com authenticated with a
 * Groq key — a guaranteed 401. Falling back to `AI_BASE_URL` makes the
 * single-provider case work with no configuration at all, while leaving the
 * split-endpoint door open if the ADR-002 plan is ever revived.
 *
 * Blank values are treated as ABSENT, not as a real base URL. This is the
 * failure mode the codebase has already been bitten by: commit 82e1a20 ("an
 * empty EMBEDDING_BASE_URL made every embedding call fetch ''"), and the live
 * health probe still reports EMBEDDING_BASE_URL_SET_BUT_EMPTY today. `??`
 * would treat '' as a real value and hand the SDK an empty base URL.
 *
 * Whitespace is trimmed before that test, matching `embeddings.ts` — a
 * Vercel field containing a stray space is blank in every sense that matters,
 * and empty-env.test.ts already pins that behavior for embeddings.
 *
 * Exported for testing: `getClient` memoizes, so a test that set env vars and
 * called `analyzeImage` would be testing whichever value happened to be
 * present on the first call in the process.
 */
export function resolveVisionBaseUrl(): string | undefined {
  const specific = process.env.AI_BASE_URL_VISION?.trim()
  if (specific) return specific
  const shared = process.env.AI_BASE_URL?.trim()
  if (shared) return shared
  return undefined
}

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: resolveVisionBaseUrl(),
    apiKey: process.env.AI_API_KEY || 'local',
  })
  return _client
}

/**
 * Groq's vision-capable model as of August 2026 (console.groq.com/docs/vision).
 *
 * NOT `Qwen/Qwen2-VL-7B-Instruct`, which this defaulted to for 83 days: that
 * is a HuggingFace repo id for the self-hosted plan, and no hosted provider
 * here serves it. The id below is the one Groq actually routes.
 */
export const MODEL_VISION = resolveVisionModel()

/** Groq rejects a request carrying more than this many images. */
export const MAX_IMAGES_PER_REQUEST = 5

export async function analyzeImage(params: {
  imageUrl: string
  question: string
  max_tokens?: number
}): Promise<string> {
  return analyzeImages({
    imageUrls: [params.imageUrl],
    question: params.question,
    max_tokens: params.max_tokens,
  })
}

/**
 * Several images in ONE call.
 *
 * One call rather than one per image because the model priced here carries a
 * 5x output premium over input ($0.60 in / $3.00 out per 1M): N separate
 * calls pay N separate output completions for what is one question. It also
 * lets the model relate the images to each other — two angles on the same
 * ceiling stain describe one problem, not two.
 *
 * Callers must respect MAX_IMAGES_PER_REQUEST; this asserts rather than
 * silently truncating, because dropping a photo the board expected to be read
 * is a wrong answer that looks like a right one.
 */
export async function analyzeImages(params: {
  imageUrls: string[]
  question: string
  max_tokens?: number
}): Promise<string> {
  if (params.imageUrls.length === 0) return ''
  if (params.imageUrls.length > MAX_IMAGES_PER_REQUEST) {
    throw new Error(
      `analyzeImages: ${params.imageUrls.length} images exceeds the ${MAX_IMAGES_PER_REQUEST}-image limit`,
    )
  }

  const res = await getClient().chat.completions.create({
    model: MODEL_VISION,
    messages: [
      {
        role: 'user',
        content: [
          ...params.imageUrls.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
          { type: 'text' as const, text: params.question },
        ],
      },
    ],
    temperature: 0.1,
    // Default kept low against that 5x output premium. Callers wanting more
    // must ask for it explicitly.
    max_tokens: params.max_tokens ?? 512,
  })
  return res.choices[0]?.message?.content ?? ''
}
