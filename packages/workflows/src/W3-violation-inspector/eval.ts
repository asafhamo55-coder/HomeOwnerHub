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
//
// BL-019 adds STATUTE_EVAL_CASES (FL / CA / other-state): the deterministic
// statute layer — rule selection, refusals, notice language and quote
// validation. They never call a model: the model's prose is a fixed stub,
// because what is being evaluated is everything W3 adds AROUND that prose.
// runStatuteEvalSuite() is exercised by eval.test.ts in `pnpm test:unit`.

import {
  StatuteRuleRefusalError,
  applyStateRulesToDraft,
  selectStateRules,
  type RequestedAction,
  type StateRuleSet,
} from './state-rules'

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

// ─── BL-019: statute-aware letters (offline) ─────────────────────────

export type StatuteEvalExpectation =
  | { refused: true; reasonContains: string[] }
  | {
      refused: false
      noticeContains: string[]
      /** Pinpoints that must be quoted verbatim, e.g. '(2)(b)'. */
      quotedPinpoints: string[]
      /** True when the letter must carry no verbatim statute quote. */
      noQuote?: boolean
      maxRecommendedFineCents?: number
    }

export interface StatuteEvalCase {
  id: string
  /** associations.state as stored. */
  state: string | null
  violationType: string
  requestedAction?: RequestedAction
  /** What the (stubbed) model recommended. */
  modelRecommendedFineCents?: number
  expect: StatuteEvalExpectation
}

export const STATUTE_EVAL_CASES: StatuteEvalCase[] = [
  {
    id: 'fl-first-notice-paint',
    state: 'FL',
    violationType: 'unauthorized exterior paint color',
    expect: {
      refused: false,
      noticeContains: ['Fla. Stat. § 720.305', 'at least 14 days', 'committee', 'cure the violation'],
      quotedPinpoints: ['(2)(b)', '(2)(e)'],
    },
  },
  {
    id: 'fl-hearing-notice-21-days',
    state: 'FL',
    violationType: 'commercial vehicle parking',
    requestedAction: { step: 'hearing_notice', hearingNoticeDays: 21 },
    expect: {
      refused: false,
      noticeContains: ['Hearing: [DATE', 'TELEPHONE / VIDEO ACCESS'],
      quotedPinpoints: ['(2)(b)', '(2)(e)'],
    },
  },
  {
    id: 'fl-fine-without-hearing-refused',
    state: 'FL',
    violationType: 'commercial vehicle parking',
    requestedAction: { step: 'impose_fine', fineAmountCents: 5000 },
    expect: { refused: true, reasonContains: ['720.305(2)(b)', 'hearing notice'] },
  },
  {
    id: 'fl-hearing-notice-7-days-refused',
    state: 'Florida',
    violationType: 'trash cans visible from street',
    requestedAction: { step: 'hearing_notice', hearingNoticeDays: 7 },
    expect: { refused: true, reasonContains: ['at least 14 days'] },
  },
  {
    id: 'fl-fine-after-cure-refused',
    state: 'FL',
    violationType: 'overgrown lawn',
    requestedAction: { step: 'impose_fine', hearingHeld: true, violationCured: true, fineAmountCents: 5000 },
    expect: { refused: true, reasonContains: ['720.305(2)(e)', 'cured'] },
  },
  {
    id: 'fl-fine-after-committee-hearing',
    state: 'FL',
    violationType: 'overgrown lawn',
    requestedAction: { step: 'impose_fine', hearingHeld: true, fineAmountCents: 5000 },
    expect: {
      refused: false,
      noticeContains: ['committee approved this fine', 'at least 30 days'],
      quotedPinpoints: ['(2)(b)', '(2)(e)', '(2)(f)'],
    },
  },
  {
    id: 'ca-first-notice',
    state: 'CA',
    violationType: 'unapproved satellite dish',
    modelRecommendedFineCents: 25_000,
    expect: {
      refused: false,
      noticeContains: ['Civil Code §§ 5850 and 5855', 'at least 10 days', '$100', 'late fees or interest', 'financial commitment to cure', 'within 14 days'],
      quotedPinpoints: [],
      noQuote: true,
      maxRecommendedFineCents: 10_000,
    },
  },
  {
    id: 'ca-fine-over-cap-refused',
    state: 'CA',
    violationType: 'unapproved satellite dish',
    requestedAction: { step: 'impose_fine', hearingHeld: true, fineAmountCents: 25_000 },
    expect: { refused: true, reasonContains: ['$100', 'health or safety'] },
  },
  {
    id: 'ca-fine-over-cap-with-health-safety-finding',
    state: 'CA',
    violationType: 'blocked fire lane',
    requestedAction: { step: 'impose_fine', hearingHeld: true, fineAmountCents: 25_000, healthSafetyFinding: true },
    modelRecommendedFineCents: 25_000,
    expect: { refused: false, noticeContains: ['14 days', 'internal dispute resolution'], quotedPinpoints: [], noQuote: true },
  },
  {
    id: 'ca-late-fee-on-fine-refused',
    state: 'California',
    violationType: 'unapproved satellite dish',
    requestedAction: { step: 'impose_fine', hearingHeld: true, fineAmountCents: 5000, lateFeeOrInterestOnFine: true },
    expect: { refused: true, reasonContains: ['late fees or interest'] },
  },
  {
    id: 'ca-hearing-notice-5-days-refused',
    state: 'CA',
    violationType: 'noise',
    requestedAction: { step: 'hearing_notice', hearingNoticeDays: 5 },
    expect: { refused: true, reasonContains: ['at least 10 days'] },
  },
  {
    id: 'tx-generic-wording',
    state: 'TX',
    violationType: 'unauthorized exterior paint color',
    requestedAction: { step: 'impose_fine', fineAmountCents: 5000 },
    expect: { refused: false, noticeContains: ["verify against your state's statute"], quotedPinpoints: [], noQuote: true },
  },
]

const STUB_MODEL_NOTICE =
  'Dear Owner,\n\nThis notice concerns an observed covenant violation at your property.\n\nSincerely,\nThe Board of Directors'

export interface StatuteEvalDeps {
  /** Ingested statute text for a rule set (tests pass the official fixture). */
  statuteTextFor: (rules: StateRuleSet) => string | null
}

export function runStatuteEvalCase(c: StatuteEvalCase, deps: StatuteEvalDeps): { caseId: string; passed: boolean; reasons: string[] } {
  const reasons: string[] = []
  const rules = selectStateRules(c.state)
  try {
    const out = applyStateRulesToDraft({
      rules,
      requestedAction: c.requestedAction,
      modelNotice: STUB_MODEL_NOTICE,
      statuteText: deps.statuteTextFor(rules),
      recommendedFineAmountCents: c.modelRecommendedFineCents ?? 2500,
    })
    if (c.expect.refused) {
      reasons.push('expected a refusal, got a draft')
    } else {
      for (const s of c.expect.noticeContains) {
        if (!out.notice.toLowerCase().includes(s.toLowerCase())) reasons.push(`notice missing "${s}"`)
      }
      const pins = out.stateRules.quotes.map((q) => q.pinpoint)
      for (const p of c.expect.quotedPinpoints) if (!pins.includes(p)) reasons.push(`quote ${p} missing`)
      for (const q of out.stateRules.quotes) {
        if (!out.notice.includes(`“${q.quote}”`)) reasons.push(`quote ${q.pinpoint} not in the letter`)
      }
      if (c.expect.noQuote && (pins.length > 0 || out.notice.includes('“'))) reasons.push('unexpected verbatim quote')
      if (c.expect.maxRecommendedFineCents !== undefined && out.recommendedFineAmountCents > c.expect.maxRecommendedFineCents) {
        reasons.push(`recommended fine ${out.recommendedFineAmountCents} above ${c.expect.maxRecommendedFineCents}`)
      }
    }
  } catch (err) {
    if (!(err instanceof StatuteRuleRefusalError)) throw err
    if (!c.expect.refused) {
      reasons.push(`unexpected refusal: ${err.reasons.join(' | ')}`)
    } else {
      const all = err.reasons.join(' ').toLowerCase()
      for (const s of c.expect.reasonContains) if (!all.includes(s.toLowerCase())) reasons.push(`refusal missing "${s}"`)
    }
  }
  return { caseId: c.id, passed: reasons.length === 0, reasons }
}

export function runStatuteEvalSuite(
  cases: StatuteEvalCase[],
  deps: StatuteEvalDeps,
): { total: number; passed: number; failures: Array<{ caseId: string; reasons: string[] }> } {
  const results = cases.map((c) => runStatuteEvalCase(c, deps))
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failures: results.filter((r) => !r.passed).map(({ caseId, reasons }) => ({ caseId, reasons })),
  }
}
