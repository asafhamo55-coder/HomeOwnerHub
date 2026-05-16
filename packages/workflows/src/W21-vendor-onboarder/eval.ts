// W21 — Vendor Onboarder
// Eval harness skeleton. Spec §5 W21 acceptance:
//   - 10 sample ACORD-25 COI PDFs extracted at ≥ 95% field accuracy
//   - Madison Park's 5 active vendors onboard end-to-end
//
// v1 status: SKELETON. Two fixture sets anticipated:
//   1. Field-extraction cases (vision input → expected key/value pairs)
//   2. Validation cases (already-extracted struct → expected status + deficiencies)

import type { Deficiency } from './index'

export interface ValidationCase {
  id: string
  description: string
  expectedStatus: 'green' | 'yellow' | 'red' | 'missing'
  expectedDeficiencyCodes: string[]
}

export const VALIDATION_CASES: ValidationCase[] = [
  {
    id: 'green-fully-compliant',
    description: 'COI exceeds minima, W-9 + license on file, nothing expiring soon',
    expectedStatus: 'green',
    expectedDeficiencyCodes: [],
  },
  {
    id: 'yellow-coi-expiring',
    description: 'COI expires in 18 days — within the 30-day yellow window',
    expectedStatus: 'yellow',
    expectedDeficiencyCodes: ['coi_expiring_soon'],
  },
  {
    id: 'red-gl-below-minimum',
    description: 'GL per-occurrence $500K but association requires $1M',
    expectedStatus: 'red',
    expectedDeficiencyCodes: ['gl_below_minimum'],
  },
  {
    id: 'red-wc-expired',
    description: "Workers' comp policy expired last month",
    expectedStatus: 'red',
    expectedDeficiencyCodes: ['wc_expired'],
  },
  {
    id: 'missing-no-w9',
    description: 'COI uploaded, license uploaded, no W-9',
    expectedStatus: 'missing',
    expectedDeficiencyCodes: ['w9_missing'],
  },
  {
    id: 'red-additional-insured-missing',
    description:
      'COI valid + GL above minimum but association is not listed as additional insured',
    expectedStatus: 'red',
    expectedDeficiencyCodes: ['additional_insured_missing'],
  },
  {
    id: 'red-gl-aggregate-below-minimum',
    description: 'GL aggregate $1M, association requires $2M aggregate',
    expectedStatus: 'red',
    expectedDeficiencyCodes: ['gl_aggregate_below_minimum'],
  },
  {
    id: 'yellow-license-expiring',
    description:
      "Plumbing license expires in 22 days; trade requires a license",
    expectedStatus: 'yellow',
    expectedDeficiencyCodes: ['license_expiring_soon'],
  },
  {
    id: 'missing-license-required-trade',
    description:
      'Vendor trade is electrical (license required) but no license uploaded',
    expectedStatus: 'red',
    expectedDeficiencyCodes: ['license_missing'],
  },
  {
    id: 'yellow-extraction-low-confidence',
    description:
      'COI extraction returned LOW confidence; do not mark green even if values appear compliant',
    expectedStatus: 'yellow',
    expectedDeficiencyCodes: ['extraction_low_confidence'],
  },
]

export interface ExtractionCase {
  id: string
  fixturePdfPath: string
  expectedFields: Partial<{
    carrier: string
    policyNumber: string
    effectiveDate: string
    expirationDate: string
    generalLiabilityPerOccurrence: number
    generalLiabilityAggregate: number
  }>
}

export const EXTRACTION_CASES: ExtractionCase[] = [
  // Real fixtures land in ./fixtures/acord25-*.pdf once we have ≥ 10
  // ACORD-25 samples (real Madison Park COIs + synthetic generator).
]

export interface EvalResult {
  caseId: string
  passed: boolean
  reasons: string[]
  actualStatus?: string
  actualDeficiencies?: Deficiency[]
}
