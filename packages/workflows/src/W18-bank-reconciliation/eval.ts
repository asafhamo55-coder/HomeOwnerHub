// W18 — Bank Reconciliation Agent
// Eval harness skeleton. Spec §5 W18 acceptance requires Madison Park's
// last 90 days at ≥ 70% auto-match rate / ≥ 95% accuracy, plus the
// two synthetic Zelle test sets (10 valid, 10 malformed).
//
// v1 status: SKELETON. Real fixtures land once Plaid Sandbox is wired
// against Madison Park's seed data.
//
// Two fixture sets are anticipated:
//   1. Memo-code parser unit cases — pure-function tests against tools.ts
//   2. End-to-end reconciliation cases — driven against fixture rows
//      inserted into `bank_transactions` + `assessments`.

export interface MemoParseCase {
  id: string
  memo: string
  expectedSlug: string | null
  expectedUnit: string | null
  expectedPurpose: 'DUES' | 'FEE' | 'FINE' | 'ASSESS' | null
}

export const MEMO_PARSE_CASES: MemoParseCase[] = [
  {
    id: 'happy-path-dues',
    memo: 'MP-1247-DUES',
    expectedSlug: 'MP',
    expectedUnit: '1247',
    expectedPurpose: 'DUES',
  },
  {
    id: 'bank-prepends-noise',
    memo: 'ZELLE PAYMENT FROM JOHN SMITH MEMO: MP-1247-DUES THANKS',
    expectedSlug: 'MP',
    expectedUnit: '1247',
    expectedPurpose: 'DUES',
  },
  {
    id: 'mixed-case',
    memo: 'mp-1247-dues',
    expectedSlug: 'MP',
    expectedUnit: '1247',
    expectedPurpose: 'DUES',
  },
  {
    id: 'fee-purpose',
    memo: 'MP-1247-FEE',
    expectedSlug: 'MP',
    expectedUnit: '1247',
    expectedPurpose: 'FEE',
  },
  {
    id: 'no-code',
    memo: 'thanks for the help',
    expectedSlug: null,
    expectedUnit: null,
    expectedPurpose: null,
  },
  {
    id: 'wrong-purpose',
    memo: 'MP-1247-LUNCH',
    expectedSlug: null,
    expectedUnit: null,
    expectedPurpose: null,
  },
  {
    id: 'unit-too-short',
    memo: 'MP-12-DUES',
    expectedSlug: null,
    expectedUnit: null,
    expectedPurpose: null,
  },
  {
    id: 'slug-too-long',
    memo: 'MADISONPARK-1247-DUES',
    expectedSlug: null,
    expectedUnit: null,
    expectedPurpose: null,
  },
  // 12 more land here when synthetic Madison Park traffic is generated.
]

export interface ReconciliationCase {
  id: string
  /** Description of what the bank transaction looks like. */
  scenario: string
  expectedMatchMethod: 'auto_exact' | 'auto_fuzzy' | 'duplicate_je' | 'unmatched'
  expectedMinConfidence: number
}

export const RECONCILIATION_CASES: ReconciliationCase[] = [
  // Placeholders — real fixtures arrive with Plaid Sandbox setup.
  {
    id: 'placeholder-exact-zelle',
    scenario: 'Inbound deposit $345.00, memo MP-1247-DUES, matching open assessment exists',
    expectedMatchMethod: 'auto_exact',
    expectedMinConfidence: 0.99,
  },
  {
    id: 'placeholder-fuzzy-name',
    scenario:
      'Inbound deposit $345.00, memo "Zelle from John Smith", no memo code; John Smith is the owner of unit 1247 with an open $345 assessment',
    expectedMatchMethod: 'auto_fuzzy',
    expectedMinConfidence: 0.7,
  },
  {
    id: 'placeholder-unmatched',
    scenario: 'Outbound payment to "Home Depot" for $87.34; no vendor on file',
    expectedMatchMethod: 'unmatched',
    expectedMinConfidence: 0,
  },
]
