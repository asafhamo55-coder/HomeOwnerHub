// W21 — Vendor Onboarder
//
// Vendor uploads COI + W-9 + license (or types the values manually in the
// text-only fallback). We validate against the association's compliance
// requirements and produce a color-coded status + deficiency list.
// The board approves green vendors (manager-side queue action; not done
// by this workflow).
//
// Vision extraction is deferred to Phase 2.1 per ADR-002. Until then the
// caller provides `manualExtract` — the validation half is real and
// graded by the LLM against `associations.compliance_settings`.
//
// Acceptance (spec §5 W21): 10 ACORD-25 PDFs extracted at >= 95% field
// accuracy (vision path); Madison Park's 5 active vendors onboard
// end-to-end.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  userPromptFor,
  type AssociationRequirements,
  type ExtractedCOI,
  type ExtractedW9,
  type ExtractedLicense,
} from './prompt'

// ─── Public types ────────────────────────────────────────────────────

const ExtractedCOISchema = z.object({
  carrier: z.string().nullable(),
  policyNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  expirationDate: z.string().nullable(),
  generalLiabilityPerOccurrence: z.number().nullable(),
  generalLiabilityAggregate: z.number().nullable(),
  workersComp: z.boolean().nullable(),
  autoLiability: z.number().nullable(),
  umbrella: z.number().nullable(),
  additionalInsuredPresent: z.boolean().nullable(),
  extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

const ExtractedW9Schema = z.object({
  legalName: z.string().nullable(),
  einMasked: z.string().nullable(),
  address: z.string().nullable(),
  classification: z.string().nullable(),
  extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

const ExtractedLicenseSchema = z.object({
  number: z.string().nullable(),
  state: z.string().nullable(),
  trade: z.string().nullable(),
  expiration: z.string().nullable(),
  status: z.string().nullable(),
  extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

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
    .optional()
    .default([]),
  // Text-only fallback (Phase 2.1 not yet live). Vendor (or staff) types
  // the values into a form; W21 validates without vision/OCR.
  manualExtract: z
    .object({
      coi: ExtractedCOISchema.nullable(),
      w9: ExtractedW9Schema.nullable(),
      license: ExtractedLicenseSchema.nullable(),
    })
    .optional(),
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
    coi: ExtractedCOISchema.nullable(),
    w9: ExtractedW9Schema.nullable(),
    license: ExtractedLicenseSchema.nullable(),
  }),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
})

export type VendorOnboarderOutput = z.infer<typeof VendorOnboarderOutputSchema>

// LLM-returned JSON shape (snake_case per prompt contract). Translated to
// the public camelCase output schema below.
const LlmOutputSchema = z.object({
  compliance_status: z.enum(['green', 'yellow', 'red', 'missing']),
  deficiencies: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(['red', 'yellow']),
      detail: z.string(),
    }),
  ),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
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

export const vendorOnboarder = defineWorkflow({
  id: 'W21',
  name: 'Vendor Onboarder',
  version: '0.2.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // Compliance status is advisory — a board/manager flips vendors.status
  // to 'active'. The workflow never does.
  humanApprovalRequired: true,
  inputSchema: VendorOnboarderInputSchema,
  outputSchema: VendorOnboarderOutputSchema,

  async run(input, api, _ctx) {
    const db = createAdminClient()

    // 1. Load the association's compliance settings + vendor trades.
    const { data: assoc, error: assocErr } = await db
      .from('associations' as never)
      .select('id, compliance_settings')
      .eq('id', input.associationId)
      .single<{ id: string; compliance_settings: unknown }>()
    if (assocErr || !assoc) {
      throw new Error(
        `association_not_found: ${assocErr?.message ?? input.associationId}`,
      )
    }

    const { data: vendor, error: vendorErr } = await db
      .from('vendors' as never)
      .select('id, organization_id, trades')
      .eq('id', input.vendorId)
      .single<{ id: string; organization_id: string; trades: string[] | null }>()
    if (vendorErr || !vendor) {
      throw new Error(
        `vendor_not_found: ${vendorErr?.message ?? input.vendorId}`,
      )
    }

    const requirements = parseRequirements(assoc.compliance_settings)
    const extracted = {
      coi: input.manualExtract?.coi ?? null,
      w9: input.manualExtract?.w9 ?? null,
      license: input.manualExtract?.license ?? null,
    }

    // 2. Missing-docs short-circuit: if no extract AND no documents,
    // there is nothing to grade.
    if (!extracted.coi && !extracted.w9 && !extracted.license) {
      const result = {
        complianceStatus: 'missing' as const,
        deficiencies: requiredDocDeficiencies(requirements, extracted),
        extracted,
        confidence: 'HIGH' as const,
        summary:
          'No documents or manual entries provided. Upload COI, W-9, and license (if required for trade) to begin review.',
      }
      api.setConfidence(1)
      await upsertCompliance(db, vendor, input.associationId, result, _ctx)
      return result
    }

    // 3. Ask the LLM to grade extract vs. requirements.
    const userPrompt = userPromptFor({
      vendorTrades: vendor.trades ?? [],
      requirements,
      coi: extracted.coi as ExtractedCOI | null,
      w9: extracted.w9 as ExtractedW9 | null,
      license: extracted.license as ExtractedLicense | null,
    })

    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      response_format: { type: 'json_object' },
      temperature: 0.1,
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
      throw new Error('w21_empty_llm_response')
    }
    let parsed: z.infer<typeof LlmOutputSchema>
    try {
      parsed = LlmOutputSchema.parse(JSON.parse(rawJson))
    } catch (err) {
      throw new Error(
        `w21_llm_output_invalid: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    api.setConfidence(confidenceToNumber(parsed.confidence))

    const result: VendorOnboarderOutput = {
      complianceStatus: parsed.compliance_status,
      deficiencies: parsed.deficiencies,
      extracted,
      confidence: parsed.confidence,
      summary: parsed.summary,
    }

    // 4. Upsert vendor_compliance with the graded result.
    await upsertCompliance(db, vendor, input.associationId, result, _ctx)

    return result
  },
})

// ─── helpers ─────────────────────────────────────────────────────────

function parseRequirements(raw: unknown): AssociationRequirements {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    glPerOccurrenceMin:
      typeof obj.gl_per_occurrence_min === 'number'
        ? obj.gl_per_occurrence_min
        : null,
    glAggregateMin:
      typeof obj.gl_aggregate_min === 'number' ? obj.gl_aggregate_min : null,
    workersCompRequired: obj.workers_comp_required === true,
    additionalInsuredRequired: obj.additional_insured_required === true,
    umbrellaMin:
      typeof obj.umbrella_min === 'number' ? obj.umbrella_min : null,
    licenseRequiredFor: Array.isArray(obj.license_required_for)
      ? (obj.license_required_for as unknown[]).filter(
          (t): t is string => typeof t === 'string',
        )
      : [],
  }
}

function requiredDocDeficiencies(
  requirements: AssociationRequirements,
  extracted: {
    coi: ExtractedCOI | null
    w9: ExtractedW9 | null
    license: ExtractedLicense | null
  },
): Deficiency[] {
  const out: Deficiency[] = []
  if (!extracted.coi) {
    out.push({
      code: 'coi_missing',
      severity: 'red',
      detail:
        'Certificate of Insurance has not been uploaded. COI is required for all vendors.',
    })
  }
  if (!extracted.w9) {
    out.push({
      code: 'w9_missing',
      severity: 'red',
      detail: 'W-9 has not been uploaded. W-9 is required before payments can be issued.',
    })
  }
  if (!extracted.license && requirements.licenseRequiredFor.length > 0) {
    out.push({
      code: 'license_missing',
      severity: 'yellow',
      detail: `Contractor license has not been uploaded. License required for trades: ${requirements.licenseRequiredFor.join(', ')}.`,
    })
  }
  return out
}

function confidenceToNumber(level: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  if (level === 'HIGH') return 0.9
  if (level === 'MEDIUM') return 0.6
  return 0.3
}

async function upsertCompliance(
  db: ReturnType<typeof createAdminClient>,
  vendor: { id: string; organization_id: string },
  associationId: string,
  result: VendorOnboarderOutput,
  _ctx: { organizationId: string },
): Promise<void> {
  const coi = result.extracted.coi
  const license = result.extracted.license
  const w9 = result.extracted.w9

  const { error } = await db
    .from('vendor_compliance' as never)
    .upsert(
      {
        organization_id: vendor.organization_id,
        vendor_id: vendor.id,
        association_id: associationId,
        coi_status: result.complianceStatus,
        coi_carrier: coi?.carrier ?? null,
        coi_policy_number: coi?.policyNumber ?? null,
        coi_effective_date: coi?.effectiveDate ?? null,
        coi_expiration_date: coi?.expirationDate ?? null,
        coi_general_liability_per_occurrence:
          coi?.generalLiabilityPerOccurrence ?? null,
        coi_general_liability_aggregate: coi?.generalLiabilityAggregate ?? null,
        coi_workers_comp: coi?.workersComp ?? null,
        coi_auto_liability: coi?.autoLiability ?? null,
        coi_umbrella: coi?.umbrella ?? null,
        coi_additional_insured_present: coi?.additionalInsuredPresent ?? null,
        w9_on_file: w9 != null,
        license_number: license?.number ?? null,
        license_state: license?.state ?? null,
        license_trade: license?.trade ?? null,
        license_expiration: license?.expiration ?? null,
        license_status: license?.status ?? null,
        deficiencies: result.deficiencies,
        last_reviewed_at: new Date().toISOString(),
      } as never,
      { onConflict: 'vendor_id,association_id' } as never,
    )

  if (error) {
    throw new Error(`vendor_compliance_upsert_failed: ${error.message}`)
  }
}
