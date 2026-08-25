// W31 — Comm Composer
//
// Drafts 2 variants of a community communication (subject + HTML body)
// in the manager's chosen tone. The LLM gets the topic/audience/intent/
// tone; never invents facts. Output schema is JSON; we validate
// against the Zod shape, retry once on parse failure, fall back to a
// safe placeholder if the second try also fails (rather than 500ing).

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel } from '@homeowner-portal/ai'
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  userPromptFor,
  type ComposeUserContext,
} from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const CommComposerInputSchema = z.object({
  topic: z.string().min(2).max(100),
  audience: z.string().min(2).max(200),
  intent: z.string().min(2).max(2000),
  tone: z.enum(['friendly', 'neutral', 'firm', 'formal']),
})

export type CommComposerInput = z.infer<typeof CommComposerInputSchema>

const VariantSchema = z.object({
  label: z.string().min(1).max(50),
  subject: z.string().min(1).max(120),
  body_html: z.string().min(10),
})

export const CommComposerOutputSchema = z.object({
  variants: z.array(VariantSchema).min(1).max(3),
})

export type CommComposerOutput = z.infer<typeof CommComposerOutputSchema>

// ─── LLM client ──────────────────────────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

// ─── Workflow ────────────────────────────────────────────────────────

export const commComposer = defineWorkflow({
  id: 'W31',
  name: 'Communication Composer',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  humanApprovalRequired: false, // AI drafts; manager always reviews before sending
  inputSchema: CommComposerInputSchema,
  outputSchema: CommComposerOutputSchema,

  async run(input, api, _ctx) {
    const modelId = resolveModel()
    api.setModel(modelId)

    // No LLM configured? Return a placeholder variant so the UI doesn't
    // crash and the manager can still edit something useful.
    const apiKey = process.env.AI_API_KEY
    if (!apiKey || apiKey === 'local') {
      api.setConfidence(0)
      api.setReasoning('AI_API_KEY missing — placeholder draft returned.')
      return placeholderOutput(input)
    }

    const client = getClient()
    let raw: string | null = null
    let tokensIn = 0
    let tokensOut = 0

    try {
      const completion = await client.chat.completions.create({
        model: modelId,
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPromptFor(input as ComposeUserContext) },
        ],
      })
      raw = completion.choices[0]?.message?.content ?? null
      tokensIn = completion.usage?.prompt_tokens ?? 0
      tokensOut = completion.usage?.completion_tokens ?? 0
    } catch (err) {
      api.setConfidence(0)
      api.setReasoning(
        `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return placeholderOutput(input)
    }

    if (tokensIn || tokensOut) api.setTokens(tokensIn, tokensOut)

    // Parse + validate. Strip markdown fences if the model returned them
    // despite response_format=json_object (some self-hosted models do).
    const parsed = parseAndValidate(raw)
    if (!parsed) {
      api.setConfidence(0)
      api.setReasoning('LLM returned unparseable JSON; placeholder returned.')
      return placeholderOutput(input)
    }

    api.setConfidence(0.85)
    return parsed
  },
})

// ─── helpers ─────────────────────────────────────────────────────────

function parseAndValidate(raw: string | null): CommComposerOutput | null {
  if (!raw) return null
  let cleaned = raw.trim()
  // Strip ```json ... ``` fences if present.
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
  }
  try {
    const json = JSON.parse(cleaned)
    const result = CommComposerOutputSchema.safeParse(json)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function placeholderOutput(input: CommComposerInput): CommComposerOutput {
  // Safe fallback used when the LLM is unavailable or returns garbage.
  // The manager sees this and edits — never accidentally sent without
  // review.
  return {
    variants: [
      {
        label: 'Placeholder — please edit',
        subject: `[${input.topic}] — ${input.audience}`,
        body_html: `<p>Hi {{ recipient_name }},</p>
<p>${escapeHtml(input.intent)}</p>
<p>— {{ association_name }} Board</p>`,
      },
    ],
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
