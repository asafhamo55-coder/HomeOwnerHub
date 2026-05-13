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
// ≤ 3 edits, and the draft pulls insurance requirements correctly
// from association settings (no hallucinated numbers).

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'

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
  version: '0.1.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // Drafts are never auto-published. Board approval mandatory.
  humanApprovalRequired: true,
  inputSchema: RfpComposerInputSchema,
  outputSchema: RfpComposerOutputSchema,

  async run(input, api, _ctx) {
    // SKELETON. The full pipeline requires:
    //   1. Load association context (units, common-area acres, prior
    //      vendor scope, compliance_settings) — the compliance_settings
    //      column is added to `associations` in a follow-up migration.
    //   2. Format with userPromptFor() and call the LLM with JSON mode.
    //   3. Validate the LLM's output against the schema; if confidence
    //      is LOW, queue for board with a "please flesh out manually"
    //      message.
    void input
    void getClient
    void SYSTEM_PROMPT

    api.setConfidence(0)

    return {
      title: 'RFP draft (skeleton)',
      scope:
        'W22 skeleton — RFP composition awaits association compliance_settings column and association-context loader (see README).',
      lineItems: [],
      evaluationCriteria: [],
      insuranceRequirements: null,
      qualifications: [],
      submissionInstructions:
        'Vendors will receive a tokenized link to submit their bid.',
      confidence: 'LOW' as const,
    }
  },
})
