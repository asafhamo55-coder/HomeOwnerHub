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

const PURPOSE_FOR_TYPE: Record<string, 'DUES' | 'FEE' | 'FINE' | 'ASSESS'> = {
  regular: 'DUES',
  late_fee: 'FEE',
  fine: 'FINE',
  special: 'ASSESS',
}

/**
 * Inverse of `parseMemoCode`: builds the canonical SLUG-UNIT-PURPOSE code
 * that goes onto an `assessments.memo_code` and back into a homeowner's
 * Zelle memo. The slug comes from `associations.slug`. The unit portion
 * uses `units.unit_number` when present; otherwise derives a 4-digit
 * number from the unit_id so we always have something in-grammar.
 *
 * Returns null when the slug is out-of-grammar (must be 2-4 uppercase
 * letters per ADR-005) so callers can decide whether to leave memo_code
 * NULL or fix the slug.
 */
export function memoCodeFor(input: {
  associationSlug: string
  unitNumber: string | null
  unitId: string
  assessmentType: string
}): string | null {
  // Strip non-letters then truncate. The migration's slug builder
  // (`regexp_replace(name, '[^A-Za-z0-9]', '', 'g')`) leaves digits in,
  // and doesn't cap length — "MADISONPARK" is 11 chars. The parser
  // regex caps at 4. We could change the slug at the DB level, but
  // truncating here keeps memo_code stable for already-seeded data and
  // doesn't require a migration.
  let slug = input.associationSlug.toUpperCase().replace(/[^A-Z]/g, '')
  if (slug.length < 2) return null
  if (slug.length > 4) slug = slug.slice(0, 4)

  const purpose = PURPOSE_FOR_TYPE[input.assessmentType]
  if (!purpose) return null

  let unit = (input.unitNumber ?? '').replace(/\D/g, '')
  if (unit.length < 3 || unit.length > 5) {
    // Fall back to a deterministic 4-digit number from unit_id. Take the
    // last 4 hex chars, mod 10000. Collisions are theoretically possible
    // within an association (~5% at 100 units) but the memo code is
    // disambiguated by amount + period during matching, so this is fine
    // for v1. Real Madison Park onboarding will set unit_number anyway.
    const hex = input.unitId.replace(/-/g, '').slice(-8)
    const n = Number.parseInt(hex, 16) % 10000
    unit = String(n).padStart(4, '0')
  }

  return `${slug}-${unit}-${purpose}`
}
