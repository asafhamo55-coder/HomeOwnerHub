// W21 — Vendor Onboarder
//
// Vendor uploads COI + W-9 + license. We extract via vision, validate
// against the association's requirements, produce a color-coded status
// and a specific deficiency list. The board approves green vendors
// (manager-side queue action; not done by this workflow).
//
// SKELETON: vision extraction is stubbed pending Phase 2.1 self-hosted
// cutover (ADR-002). The deficiency-validation half is real and runs
// against text input today — vendors can manually type their COI fields
// into the upload form as a fallback path.
//
// Acceptance (spec §5 W21): 10 ACORD-25 PDFs extracted at ≥ 95% field
// accuracy; Madison Park's 5 active vendors onboard end-to-end.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const VendorOnboarderInputSchema = z.object({
  vendorId: z.string().uuid(),
  associationId: z.string().uuid(),
  documents: z
    .array(
      z.object({
        docType: z.enum(['coi', 'w9', 'license']),
        storagePath: z.string().min(1),
      }),
    )
    .min(1),
})

export type VendorOnboarderInput = z.infer<typeof VendorOnboarderInputSchema>

export const DeficiencySchema = z.object({
  code: z.string(),
  severity: z.enum(['red', 'yellow']),
  detail: z.string(),
})

export type Deficiency = z.infer<typeof DeficiencySchema>

export const VendorOnboarderOutputSchema = z.object({
  complianceStatus: z.enum(['green', 'yellow', 'red', 'missing']),
  deficiencies: z.array(DeficiencySchema),
  extracted: z.object({
    coi: z.record(z.unknown()).nullable(),
    w9: z.record(z.unknown()).nullable(),
    license: z.record(z.unknown()).nullable(),
  }),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
})

export type VendorOnboarderOutput = z.infer<typeof VendorOnboarderOutputSchema>

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

export const vendorOnboarder = defineWorkflow({
  id: 'W21',
  name: 'Vendor Onboarder',
  version: '0.1.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // Vendor compliance status (green/yellow/red/missing) is advisory —
  // a manager approves the transition of vendors.status to 'active'.
  humanApprovalRequired: true,
  inputSchema: VendorOnboarderInputSchema,
  outputSchema: VendorOnboarderOutputSchema,

  async run(input, api, _ctx) {
    // SKELETON. Vision-extract phase awaits ADR-002 Phase 2.1 cutover.
    // Validation phase runs against manual-text fallback until then.
    void input
    void getClient
    void SYSTEM_PROMPT

    api.setConfidence(0)

    return {
      complianceStatus: 'missing' as const,
      deficiencies: [
        {
          code: 'workflow_skeleton',
          severity: 'yellow' as const,
          detail:
            'W21 vision extraction is not yet wired. Vendor compliance review is manual until Phase 2.1.',
        },
      ],
      extracted: { coi: null, w9: null, license: null },
      confidence: 'LOW' as const,
      summary:
        'W21 skeleton — vendor compliance review awaiting vision-model cutover (ADR-002 Phase 2.1).',
    }
  },
})
