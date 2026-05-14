// W1 — Governing Docs Brain
// Eval harness contracts.
//
// The runner lives at scripts/eval-w1.ts. It loads EVAL_CASES, executes
// each through governingDocsBrain.execute(), and reports pass rate +
// per-case detail.
//
// Spec §21 ("The Discipline") calls W1 the v1 gate: ≥ 90% citation
// accuracy on a 20-question eval set against Madison Park's CC&Rs by
// end of week 2. Until Madison Park's Declaration is uploaded, EVAL_CASES
// holds 3 placeholders so the runner wiring can be smoke-tested.
//
// To add a case: append to EVAL_CASES with a stable id, the question, the
// substrings the answer must contain, the doc_types and (optionally)
// section labels the citation must include, and the confidence floor.

/** Confidence levels W1 emits, ordered low → high for ≥ comparisons. */
const CONFIDENCE_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const
export type Confidence = keyof typeof CONFIDENCE_ORDER

export function confidenceAtLeast(actual: Confidence, floor: Confidence): boolean {
  return CONFIDENCE_ORDER[actual] >= CONFIDENCE_ORDER[floor]
}

export interface EvalCase {
  /** Stable id so we can track per-case pass-rate across prompt versions. */
  id: string
  question: string
  /** Substrings the answer MUST contain (case-insensitive). All must match. */
  expectedAnswerContains: string[]
  /** Substrings the answer MUST NOT contain (case-insensitive). Any match → fail. */
  expectedAnswerExcludes?: string[]
  /**
   * doc_type values the citation must cite. At least one returned
   * citation must match one of these. Use `[]` for cases where the
   * documents shouldn't address the topic and the model should bail with
   * a LOW-confidence escalate-to-board response.
   */
  expectedCitationDocTypes: string[]
  /**
   * Optional. If set, at least one returned citation's `section` must
   * match (case-insensitive substring) one of these values. Tighter than
   * doc-type-only — use for the spec §5 W1 acceptance ("correct CC&R
   * section citations").
   */
  expectedCitationSections?: string[]
  /** Confidence floor — case fails if W1 returns lower. */
  expectedMinConfidence: Confidence
  /**
   * If true, this case asserts the model SHOULD bail (LOW confidence,
   * "escalate to the board" wording, no fabricated citations). Used for
   * out-of-document questions to prove the model doesn't hallucinate.
   */
  expectsEscalation?: boolean
}

export const EVAL_CASES: EvalCase[] = [
  // PLACEHOLDERS — replace with Madison Park's 20 hand-curated questions
  // once the Declaration is uploaded. The runner accepts whatever number of
  // cases is here; the spec §21 gate is ≥ 90% on 20+ cases against the
  // real Declaration, not against these placeholders.
  {
    id: 'placeholder-paint-color',
    question: 'Can I paint my front door red?',
    expectedAnswerContains: ['approval', 'architectural'],
    expectedCitationDocTypes: ['declaration', 'rules'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'placeholder-pets',
    question: 'How many pets am I allowed to have?',
    expectedAnswerContains: ['pet'],
    expectedCitationDocTypes: ['declaration', 'rules'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'placeholder-dues-schedule',
    question: 'When are HOA dues due?',
    expectedAnswerContains: ['due'],
    expectedCitationDocTypes: ['declaration', 'bylaws'],
    expectedMinConfidence: 'MEDIUM',
  },
  // ... 17 more land here when Madison Park CC&Rs arrive (spec §21 gate).
]

/** Minimum pass rate the runner enforces for a green exit. Spec §21: ≥ 90%. */
export const W1_GATE_PASS_RATE = 0.9

/** Minimum number of cases required to count the run as a real gate check. */
export const W1_GATE_MIN_CASES = 20

export interface CaseResult {
  caseId: string
  passed: boolean
  /** One human-readable line per failed assertion. Empty when passed. */
  reasons: string[]
  question: string
  /** What W1 actually answered. */
  answer: string
  confidence: Confidence
  citations: { docType: string; section: string | null }[]
  latencyMs: number
}

export interface SuiteResult {
  total: number
  passed: number
  passRate: number
  citationAccuracy: number
  confidenceAccuracy: number
  results: CaseResult[]
  /** True when (a) ≥ W1_GATE_MIN_CASES were run AND (b) passRate ≥ W1_GATE_PASS_RATE. */
  gatePassed: boolean
  ranAt: string
}
