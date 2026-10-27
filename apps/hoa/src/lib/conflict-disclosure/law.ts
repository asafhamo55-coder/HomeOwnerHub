/**
 * BL-165: directors disclosing conflicts of interest at bid award and
 * contract approval. O.C.G.A. § 43-17A-7(10) (SB 406 § 2), in force from
 * 2027-01-01 (SB 406 § 9(a)).
 *
 * The statute text is quoted only from lib/owner-rights/law.ts, whose
 * twelve quotes are checked word for word against
 * scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt; law.test.ts here
 * checks this one again against the same file.
 *
 * What the statute says is an owner's expectation of directors ("Expect
 * directors to disclose to the other directors ... any conflicting interest
 * with respect to a transaction"). It does not say how, or by when, so the
 * "required" below is this product's rule for Georgia associations from the
 * effective date, not a quoted requirement. Other states quote nothing.
 *
 * Pure and dependency-free apart from the owner-rights module (no `@/`).
 */

import { GA_OWNER_RIGHTS, gaOwnerRightsInForce, type OwnerRightQuote } from '../owner-rights/law'

const TEN = GA_OWNER_RIGHTS.find((r) => r.n === 10)
if (!TEN) throw new Error('§ 43-17A-7(10) missing from owner-rights/law')

/** § 43-17A-7(10), verbatim. */
export const GA_CONFLICT_DISCLOSURE_QUOTE: OwnerRightQuote = { cite: TEN.cite, quote: TEN.quote }

/**
 * required: Georgia, from 2027-01-01. recommended: Georgia before that day.
 * best_practice: any other state (or none set): optional, no statute quoted.
 */
export type DisclosureMode = 'required' | 'recommended' | 'best_practice'

/** `state` is the association's compliance state ('GA', 'FL', ...), or null. */
export function disclosureMode(state: string | null | undefined, today: string): DisclosureMode {
  if (state !== 'GA') return 'best_practice'
  return gaOwnerRightsInForce(today) ? 'required' : 'recommended'
}

/** The statute quote for a mode: Georgia only. */
export function quoteFor(mode: DisclosureMode): OwnerRightQuote | null {
  return mode === 'best_practice' ? null : GA_CONFLICT_DISCLOSURE_QUOTE
}

export const MODE_LABEL: Record<DisclosureMode, string> = {
  required: 'Required',
  recommended: 'Recommended',
  best_practice: 'Best practice',
}
