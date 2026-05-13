// W22 — RFP Composer eval harness skeleton.
//
// Spec §5 W22 acceptance: Madison Park approves a real RFP with ≤ 3 edits.
// Hard for an offline eval — it's a usability metric — but we can run a
// few deterministic checks on the structural shape and on the
// "did the model copy insurance numbers exactly?" property.

export interface RfpEvalCase {
  id: string
  /** Free-text need description fed to the workflow. */
  freeTextNeed: string
  /** Compliance settings the model MUST copy verbatim. */
  insuranceRequirements: Record<string, unknown>
  /** Substrings the title must contain (case-insensitive). */
  expectedTitleContains: string[]
  /** Minimum number of line items the draft must produce. */
  expectedMinLineItems: number
  /** Maximum confidence level we accept (model must rate honestly). */
  expectedMaxConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export const EVAL_CASES: RfpEvalCase[] = [
  {
    id: 'landscaping-bi-weekly',
    freeTextNeed:
      'We need a new landscaper. Current one is leaving end of month. Want bi-weekly mowing during growing season, quarterly fertilization, and leaf removal in fall.',
    insuranceRequirements: {
      gl_per_occurrence_min: 1_000_000,
      gl_aggregate_min: 2_000_000,
      workers_comp_required: true,
      additional_insured_required: true,
    },
    expectedTitleContains: ['landscap'],
    expectedMinLineItems: 3,
    expectedMaxConfidence: 'HIGH',
  },
  {
    id: 'vague-need',
    freeTextNeed: 'We need someone to fix the pool.',
    insuranceRequirements: { gl_per_occurrence_min: 1_000_000 },
    expectedTitleContains: ['pool'],
    expectedMinLineItems: 1,
    // Vague input should NOT get HIGH confidence — the model must flag it.
    expectedMaxConfidence: 'MEDIUM',
  },
  // More fixtures land here when Madison Park's RFP backlog is captured.
]

export interface VerbatimCopyCheck {
  caseId: string
  field: string
  inputValue: unknown
  outputValue: unknown
  matched: boolean
}
