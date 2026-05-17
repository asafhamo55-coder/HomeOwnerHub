// W22 — RFP Composer
//
// Board describes a need ("we need a landscaper, bi-weekly mowing
// plus quarterly fertilization"). W22 drafts a structured RFP that
// the board reviews, edits, and approves. On approval the board's
// action writes `rfps` + `rfp_line_items` rows — this workflow does
// NOT write them itself, because the draft is advisory until the
// board signs off.
//
// Acceptance (spec §5 W22): Madison Park approves a real RFP with
// <= 3 edits, and the draft pulls insurance requirements correctly
// from association settings (no hallucinated numbers).

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  userPromptFor,
  type AssociationContext,
} from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const RfpComposerInputSchema = z.object({
  associationId: z.string().uuid(),
  freeTextNeed: z.string().min(10).max(4000),
  budgetMin: z.number().nonnegative().nullable().optional(),
  budgetMax: z.number().nonnegative().nullable().optional(),
  submissionDeadline: z.string().datetime(),
})

export type RfpComposerInput = z.infer<typeof RfpComposerInputSchema>

export const RfpLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const EvaluationCriterionSchema = z.object({
  criterion: z.string(),
  weight: z.number().int().min(0).max(100),
})

export const RfpComposerOutputSchema = z.object({
  title: z.string(),
  scope: z.string(),
  lineItems: z.array(RfpLineItemSchema),
  evaluationCriteria: z.array(EvaluationCriterionSchema),
  insuranceRequirements: z.record(z.unknown()).nullable(),
  qualifications: z.array(z.string()),
  submissionInstructions: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

export type RfpComposerOutput = z.infer<typeof RfpComposerOutputSchema>

// LLM-returned JSON (snake_case per prompt contract).
const LlmOutputSchema = z.object({
  title: z.string(),
  scope: z.string(),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
  evaluation_criteria: z.array(
    z.object({
      criterion: z.string(),
      weight: z.number().int().min(0).max(100),
    }),
  ),
  insurance_requirements: z.record(z.unknown()).nullable().optional(),
  qualifications: z.array(z.string()),
  submission_instructions: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

// ─── LLM client (OpenAI-compatible) ──────────────────────────────────

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

export const rfpComposer = defineWorkflow({
  id: 'W22',
  name: 'RFP Composer',
  version: '0.2.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // Drafts are never auto-published. Board approval mandatory.
  humanApprovalRequired: true,
  inputSchema: RfpComposerInputSchema,
  outputSchema: RfpComposerOutputSchema,

  async run(input, api, _ctx) {
    const db = createAdminClient()

    const { data: assoc, error: assocErr } = await db
      .from('associations' as never)
      .select('id, name, state, total_units, compliance_settings')
      .eq('id', input.associationId)
      .single<{
        id: string
        name: string
        state: string
        total_units: number | null
        compliance_settings: Record<string, unknown> | null
      }>()
    if (assocErr || !assoc) {
      throw new Error(
        `association_not_found: ${assocErr?.message ?? input.associationId}`,
      )
    }

    const associationContext: AssociationContext = {
      name: assoc.name,
      state: assoc.state,
      totalUnits: assoc.total_units,
      // common_area_acres isn't a column yet — placeholder for v1.5.
      commonAreaAcres: null,
      insuranceRequirements: assoc.compliance_settings ?? null,
      priorVendorScope: null,
    }

    const userPrompt = userPromptFor({
      freeTextNeed: input.freeTextNeed,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      submissionDeadline: input.submissionDeadline,
      association: associationContext,
    })

    const completion = await getClient().chat.completions.create({
      model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    if (completion.usage) {
      api.setTokens(
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
      )
    }

    const rawJson = completion.choices[0]?.message?.content
    if (!rawJson) {
      throw new Error('w22_empty_llm_response')
    }
    let parsed: z.infer<typeof LlmOutputSchema>
    try {
      parsed = LlmOutputSchema.parse(JSON.parse(rawJson))
    } catch (err) {
      throw new Error(
        `w22_llm_output_invalid: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    api.setConfidence(confidenceToNumber(parsed.confidence))

    return {
      title: parsed.title,
      scope: parsed.scope,
      lineItems: parsed.line_items,
      evaluationCriteria: parsed.evaluation_criteria,
      insuranceRequirements: parsed.insurance_requirements ?? null,
      qualifications: parsed.qualifications,
      submissionInstructions: parsed.submission_instructions,
      confidence: parsed.confidence,
    }
  },
})

function confidenceToNumber(level: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  if (level === 'HIGH') return 0.9
  if (level === 'MEDIUM') return 0.6
  return 0.3
}
