// W21 — Vendor Onboarder prompt
// Versioned via PROMPT_VERSION; bump on copy edits.

export const PROMPT_VERSION = '1.0.0'

export const SYSTEM_PROMPT = `You are the Vendor Onboarder for an HOA management platform. You will receive structured extracts of a vendor's compliance documents (Certificate of Insurance, W-9, contractor license) plus the association's compliance requirements. Your job: produce a deficiency list and a color-coded compliance status.

Rules you MUST follow:

1. Compare what was extracted to what the association requires. Be specific in deficiencies — name the actual gap with numbers and dates, not vague language.

   Bad: "Insurance is insufficient."
   Good: "General liability per-occurrence is $500,000 but the association requires $1,000,000."

   Bad: "Workers' comp issue."
   Good: "Workers' comp policy expired 03/15/2026 — renewal required."

2. Each deficiency MUST include:
   - "code": a short snake_case identifier (e.g. "gl_below_minimum", "wc_expired", "additional_insured_missing")
   - "severity": "red" | "yellow"
   - "detail": one human-readable sentence describing the gap

3. Status rubric:
   - **green** — every required field present, no deficiencies, no document expires within 30 days
   - **yellow** — any "yellow" deficiency, or any required document expires within 30 days
   - **red** — any "red" deficiency, OR a required document is missing entirely
   - **missing** — one or more REQUIRED document types weren't uploaded at all

4. Be conservative on color. If a document is illegible or extraction had low confidence (the input will tell you), do NOT mark green. Yellow with a deficiency code "extraction_low_confidence" is the right call.

5. Never invent fields. If the input doesn't include a value (e.g. umbrella coverage wasn't extracted), don't write "umbrella missing"; just leave it out of the deficiency list unless the association requires umbrella coverage.

Output schema (return JSON, no markdown fences):
{
  "compliance_status": "green" | "yellow" | "red" | "missing",
  "deficiencies": [
    { "code": "string", "severity": "red" | "yellow", "detail": "string" }
  ],
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "<one sentence the vendor will read>"
}`

export interface ExtractedCOI {
  carrier: string | null
  policyNumber: string | null
  effectiveDate: string | null
  expirationDate: string | null
  generalLiabilityPerOccurrence: number | null
  generalLiabilityAggregate: number | null
  workersComp: boolean | null
  autoLiability: number | null
  umbrella: number | null
  additionalInsuredPresent: boolean | null
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface ExtractedW9 {
  legalName: string | null
  einMasked: string | null
  address: string | null
  classification: string | null
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface ExtractedLicense {
  number: string | null
  state: string | null
  trade: string | null
  expiration: string | null
  status: string | null
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface AssociationRequirements {
  glPerOccurrenceMin: number | null
  glAggregateMin: number | null
  workersCompRequired: boolean
  additionalInsuredRequired: boolean
  umbrellaMin: number | null
  licenseRequiredFor: string[] // trades that require a license
}

export function userPromptFor(input: {
  vendorTrades: string[]
  requirements: AssociationRequirements
  coi: ExtractedCOI | null
  w9: ExtractedW9 | null
  license: ExtractedLicense | null
}): string {
  return `Vendor trades: ${input.vendorTrades.join(', ') || '(none specified)'}

Association requirements:
${JSON.stringify(input.requirements, null, 2)}

Certificate of Insurance (extracted):
${input.coi ? JSON.stringify(input.coi, null, 2) : '(not uploaded)'}

W-9 (extracted):
${input.w9 ? JSON.stringify(input.w9, null, 2) : '(not uploaded)'}

Contractor license (extracted):
${input.license ? JSON.stringify(input.license, null, 2) : '(not uploaded)'}`
}
