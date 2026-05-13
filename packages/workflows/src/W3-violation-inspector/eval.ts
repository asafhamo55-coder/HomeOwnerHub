// W3 — Violation Inspector
// Eval harness skeleton. Real fixtures land when Madison Park supplies
// 30+ historical violations with the board's actual outcomes (drafted
// notice, edits the board made, send/reject decision).
//
// Spec §5 W3 acceptance:
//   - 60% of violation drafts approved without edits
//   - 95%+ cite the correct CC&R section
//
// Until real cases land, this skeleton runs against synthetic scenarios.

export interface EvalCase {
  id: string
  unitId: string                 // a real unit id in the test database
  violationType: string
  description: string
  /** The CC&R section the board considered correct. */
  expectedCitationSection: string
  /** The severity the board rated, or null if it was at-staff discretion. */
  expectedSeverity: 'low' | 'medium' | 'high' | null
  /** Substrings the draft notice must contain. */
  expectedNoticeContains: string[]
}

export const EVAL_CASES: EvalCase[] = [
  // Synthetic — replace with Madison Park cases when available.
  {
    id: 'synthetic-paint-color',
    unitId: '00000000-0000-0000-0000-000000000000',
    violationType: 'unauthorized exterior paint color',
    description:
      'Owner repainted the front door bright red without submitting an ARC request.',
    expectedCitationSection: 'Article IV, Section 4.1',
    expectedSeverity: 'low',
    expectedNoticeContains: ['Architectural Review Committee', 'paint'],
  },
  {
    id: 'synthetic-rv-parking',
    unitId: '00000000-0000-0000-0000-000000000000',
    violationType: 'commercial vehicle parking',
    description:
      'A delivery van has been parked in the driveway for 5 consecutive days.',
    expectedCitationSection: 'Article V, Section 5.7',
    expectedSeverity: 'medium',
    expectedNoticeContains: ['commercial vehicle', '48 hours'],
  },
  // ... more land when real data does
]

export interface EvalResult {
  caseId: string
  passed: boolean
  reasons: string[]
  citedSection: string | null
  severity: string
  confidence: string
}

export interface EvalSuiteResult {
  total: number
  passed: number
  passRate: number
  citationAccuracy: number       // % of cases with correct section
  failures: EvalResult[]
}
