// W18 — Bank Reconciliation Agent
// Deterministic helpers. The LLM is only invoked for Step D
// categorization suggestions (see index.ts); A/B/C are pure logic and
// live here.

// Memo-code grammar per ADR-005:
//   <ASSOC_SLUG: 2–4 uppercase letters> - <UNIT_NUMBER: 3–5 digits> - <PURPOSE>
// where PURPOSE ∈ { DUES, FEE, FINE, ASSESS }.
//
// Case-insensitive at parse time — many banks normalize memos to upper-
// case but a stubborn few don't.
export const MEMO_CODE_REGEX = /\b([A-Z]{2,4})-(\d{3,5})-(DUES|FEE|FINE|ASSESS)\b/

// The amount tolerance for exact-match auto-post. ADR-005 says ±$0.50.
export const EXACT_MATCH_AMOUNT_TOLERANCE_USD = 0.5

// Auto-post confidence floor. Below this, queue for human review.
export const AUTO_POST_CONFIDENCE_FLOOR = 0.95

// Confidence assigned when an exact memo + amount match lands. Spec §5 W18.
export const EXACT_MEMO_MATCH_CONFIDENCE = 0.99

// Window for "did a human or another agent already post this?" — see Step C.
export const DUPLICATE_JE_WINDOW_DAYS = 7

export interface MemoCodeParts {
  associationSlug: string
  unitNumber: string
  purpose: 'DUES' | 'FEE' | 'FINE' | 'ASSESS'
  /** The canonical memo code as it should appear in the database. */
  canonical: string
}

/**
 * Pull the first memo code out of a bank-transaction memo string.
 * Returns null if no recognizable code is present.
 *
 * Many banks prepend extra noise ("ZELLE PAYMENT FROM J SMITH MEMO:") — we
 * tolerate that by searching anywhere in the memo, not anchoring.
 */
export function parseMemoCode(memo: string | null | undefined): MemoCodeParts | null {
  if (!memo) return null
  const match = memo.toUpperCase().match(MEMO_CODE_REGEX)
  if (!match) return null
  const [, slug, unit, purpose] = match
  const canonical = `${slug}-${unit}-${purpose}`
  return {
    associationSlug: slug,
    unitNumber: unit,
    purpose: purpose as MemoCodeParts['purpose'],
    canonical,
  }
}

/**
 * Decide whether a transaction's amount matches an open assessment within
 * the configured tolerance. Both arguments are dollar amounts (not cents).
 */
export function amountsMatchExact(
  transactionAmount: number,
  assessmentAmount: number,
): boolean {
  return Math.abs(transactionAmount - assessmentAmount) <= EXACT_MATCH_AMOUNT_TOLERANCE_USD
}

/**
 * Fuzzy-amount check for Step B (memo isn't a recognized code, but the
 * amount is within 5% of an open assessment).
 */
export function amountsMatchFuzzy(
  transactionAmount: number,
  assessmentAmount: number,
  tolerancePct = 0.05,
): boolean {
  if (assessmentAmount <= 0) return false
  const pctDiff = Math.abs(transactionAmount - assessmentAmount) / assessmentAmount
  return pctDiff <= tolerancePct
}
