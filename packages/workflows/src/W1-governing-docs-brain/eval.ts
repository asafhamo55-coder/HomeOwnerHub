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
  // 20 graded cases against the synthetic Madison Park Declaration in
  // fixtures/sample-ccr.md. Diverse topics, mixed difficulty, two
  // escalation cases. Replace 1-for-1 when Madison Park's real
  // Declaration arrives (the question phrasings carry over; only the
  // expected substrings + section labels need re-grounding to the real
  // doc).

  // ─── Architectural Review (5 cases) ────────────────────────────────

  {
    id: 'paint-door-on-palette',
    // The fixture uses spelled-out durations ("thirty (30) days"); model
    // paraphrasing may emit "30 days" or "thirty days". Substrings here
    // pick robust phrasing that survives either form.
    question:
      'I want to paint my front door a navy blue from your Approved Door Color Palette. Do I need to file something with the ARC first?',
    expectedAnswerContains: ['notif', 'managing agent'],
    expectedAnswerExcludes: ['prior approval', 'arc submission required'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['4.3'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'paint-door-off-palette',
    question:
      'I want to paint my front door a bright orange. The color is not on the Approved Door Color Palette. What do I have to do?',
    expectedAnswerContains: ['arc', 'approval'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['4.1', '4.3'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'solar-panels-allowed',
    question: 'Can I install solar panels on my roof?',
    expectedAnswerContains: ['permitted', 'placement'],
    expectedAnswerExcludes: ['prohibited', 'not allowed'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['4.4'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'satellite-dish-allowed',
    question:
      'I want to install a small satellite dish on my house. Do I need ARC approval?',
    expectedAnswerContains: ['without arc approval', 'least visible'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['4.5'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'fence-chain-link',
    question: 'Can I put up a chain-link fence in my back yard?',
    expectedAnswerContains: ['prohibited'],
    expectedAnswerExcludes: ['allowed', 'permitted'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['4.6'],
    expectedMinConfidence: 'HIGH',
  },

  // ─── Use Restrictions (6 cases) ────────────────────────────────────

  {
    id: 'pets-max-count',
    question: 'How many pets am I allowed to have at my house?',
    expectedAnswerContains: ['two', '2'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.3'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'pets-pit-bull',
    question: 'Is a pit bull allowed in the community?',
    expectedAnswerContains: ['prohibited'],
    expectedAnswerExcludes: ['allowed without restriction'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.3', '13.1'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'rv-in-driveway',
    question: 'Can I park my RV in my driveway for a week while I clean it out?',
    expectedAnswerContains: ['enclosed', 'garage'],
    expectedAnswerExcludes: ['permitted indefinitely', 'no time limit'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.4'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'airbnb-allowed',
    question: 'Can I list my house on Airbnb?',
    expectedAnswerContains: ['prohibited', 'short-term'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.5'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'home-daycare',
    question: 'Can I run a small daycare out of my house?',
    expectedAnswerContains: ['prohibited'],
    expectedAnswerExcludes: ['allowed', 'permitted'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.2'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'us-flag-display',
    question: 'Can I fly an American flag from my house without ARC approval?',
    expectedAnswerContains: ['permitted'],
    expectedAnswerExcludes: ['arc approval required'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['5.7'],
    expectedMinConfidence: 'HIGH',
  },

  // ─── Assessments and Enforcement (5 cases) ─────────────────────────

  {
    id: 'dues-when-due',
    question: 'When are my HOA dues due each month?',
    expectedAnswerContains: ['first', '1st'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['6.1'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'late-fee-amount',
    question: 'How much is the late fee if I miss my monthly payment?',
    expectedAnswerContains: ['5%', '15th'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['6.2'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'lien-timeline',
    question:
      'If I fall 60 days behind on my assessments, what is the HOA legally required to do before filing a lien?',
    expectedAnswerContains: ['demand letter', 'before recording'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['6.4'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'attorney-fees',
    question: 'Can the HOA make me pay their attorney fees if they collect against me?',
    expectedAnswerContains: ['attorney fees'],
    expectedAnswerExcludes: ['cannot recover', 'not entitled'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['6.6'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'fine-hearing-rights',
    question: 'I just received a violation notice. Can I request a hearing before the Board?',
    expectedAnswerContains: ['hearing', 'request', 'managing agent'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['7.3'],
    expectedMinConfidence: 'HIGH',
  },

  // ─── Insurance, Board, Amenities (2 cases) ─────────────────────────

  {
    id: 'owner-interior-insurance',
    question:
      'I lease my unit to a tenant. Do I need any specific insurance policy?',
    expectedAnswerContains: ['ho-6'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['8.2'],
    expectedMinConfidence: 'HIGH',
  },
  {
    id: 'pool-hours',
    question: 'What time does the pool open and close?',
    expectedAnswerContains: ['6:00', '10:00'],
    expectedCitationDocTypes: ['declaration'],
    expectedCitationSections: ['10.2'],
    expectedMinConfidence: 'HIGH',
  },

  // ─── Escalation cases (2) — proves the model bails when the doc
  //     doesn't cover the topic, instead of fabricating an answer. ───

  {
    id: 'escalation-backyard-chickens',
    question: 'Am I allowed to keep backyard chickens for fresh eggs?',
    expectedAnswerContains: [],
    expectedCitationDocTypes: [],
    expectedMinConfidence: 'LOW',
    expectsEscalation: true,
  },
  {
    id: 'escalation-installing-ev-charger',
    question: 'What is the procedure for installing an EV charger in my garage?',
    expectedAnswerContains: [],
    expectedCitationDocTypes: [],
    expectedMinConfidence: 'LOW',
    expectsEscalation: true,
  },
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
