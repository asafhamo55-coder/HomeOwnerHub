// W1 — Governing Docs Brain
// Eval harness skeleton. Per spec §10 every workflow needs ≥10 fixtures
// passing at ≥85% to ship.
//
// v1 status: SKELETON. Real fixtures land once Madison Park's Declaration
// is uploaded and the 20 hand-curated questions are written (spec §5 W1).
// Until then, this file documents the eval shape and runs against the
// placeholder Declaration in fixtures/sample-ccr.md so the harness wiring
// can be tested.
//
// Run with: pnpm tsx packages/workflows/src/W1-governing-docs-brain/eval.ts
// (a runner script lands alongside the test fixtures.)

export interface EvalCase {
  /** Stable id so we can track per-case pass-rate across prompt versions. */
  id: string
  question: string
  /** Substrings the answer must contain (case-insensitive). */
  expectedAnswerContains: string[]
  /** doc_type the answer must cite. e.g. 'Declaration' or 'Rules'. */
  expectedCitationDocTypes: string[]
  /** Confidence floor — fail if the model returns lower. */
  expectedMinConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export const EVAL_CASES: EvalCase[] = [
  // Placeholder — replace with Madison Park's 20 hand-curated questions.
  {
    id: 'placeholder-paint-color',
    question: 'Can I paint my front door red?',
    expectedAnswerContains: ['approval', 'architectural'],
    expectedCitationDocTypes: ['Declaration', 'Rules'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'placeholder-pets',
    question: 'How many pets am I allowed to have?',
    expectedAnswerContains: ['pet'],
    expectedCitationDocTypes: ['Declaration', 'Rules'],
    expectedMinConfidence: 'MEDIUM',
  },
  {
    id: 'placeholder-dues-schedule',
    question: 'When are HOA dues due?',
    expectedAnswerContains: ['due'],
    expectedCitationDocTypes: ['Declaration', 'Bylaws'],
    expectedMinConfidence: 'MEDIUM',
  },
  // ... 17 more land here when Madison Park CC&Rs arrive.
]

export interface EvalResult {
  caseId: string
  passed: boolean
  reasons: string[]
  answer: string
  confidence: string
  citationsCount: number
}

export interface EvalSuiteResult {
  total: number
  passed: number
  passRate: number
  failures: EvalResult[]
}
