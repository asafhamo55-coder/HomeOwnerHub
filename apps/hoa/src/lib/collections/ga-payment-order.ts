/**
 * BL-163: apply a payment in Georgia's statutory order (SB 406,
 * O.C.G.A. § 43-17A-8), from January 1, 2027.
 *
 * Pure: no I/O, no clock. The caller passes the association's today.
 * Browser-safe (no node imports), because the board's preview dialog
 * imports the labels and types.
 *
 * The statute, word for word (ga-sb406-2026-2027-text.txt, § 43-17A-8(a)):
 *
 *   "All funds remitted by an owner to an owners' association shall be
 *   applied by such owners' association to the following expenses by
 *   ranking of highest to lowest priority as follows:
 *   (1) Regular assessments or dues until current;
 *   (2) Special assessments until current;
 *   (3) Specific assessments until current; and
 *   (4) Other fees and fines."
 *
 * "Specific assessments" (§ 43-17A-1(10)): "an assessment imposed on an
 * owner for: (A) Costs incurred by the owners' association to repair or
 * remediate damage caused by such owner to the owners' association ...; or
 * (B) Fees or fines for nonpayment, insufficient payment, or untimely
 * payment of any assessment or for violation of a covenant of the owners'
 * association."
 *
 * How the app's charge types map (and where the statute is silent):
 *   regular                          -> (1) regular assessments or dues
 *   special                          -> (2) special assessments
 *   late_fee, fine                   -> (3) specific assessments, (B)
 *   everything else                  -> (4) other fees and fines, and each of
 *     those is flagged AMBIGUOUS so the board asks its attorney:
 *       interest, lien_filing, collection_legal (attorney fees),
 *       collection_letter, collection_processing, payment-plan installments
 *       (stored as 'special', but they may stand in for dues, fines or fees,
 *       and the original type is not kept), and any type the app doesn't know.
 *   The statute doesn't say where these go. Lowest rank is the conservative
 *   reading: dues are always paid first.
 *
 * "until current": only charges due on or before the association's today
 * take part. A charge not yet due is never paid by this allocator; whatever
 * is left after every due charge is unapplied credit, never over-applied.
 *
 * Before January 1, 2027, or outside Georgia, nothing changes: oldest due
 * date first, whatever the type (today's behaviour).
 */

import { GA_17A8_ORDER, type DriftCitation } from '@/lib/compliance/statute-drift'

/** SB 406 § 9(a): the Act is effective January 1, 2027. */
export const GA_PAYMENT_ORDER_EFFECTIVE_ON = '2027-01-01'

/** The four ranks, each quoted from § 43-17A-8(a)(1)-(4), in order. */
export const GA_PAYMENT_ORDER_TIERS = [
  { tier: 1, quote: 'Regular assessments or dues until current' },
  { tier: 2, quote: 'Special assessments until current' },
  { tier: 3, quote: 'Specific assessments until current' },
  { tier: 4, quote: 'Other fees and fines' },
] as const

export type PaymentTier = 1 | 2 | 3 | 4

/** The statute paragraph shown with the split. */
export const GA_PAYMENT_ORDER_CITATION: DriftCitation = GA_17A8_ORDER

/** Why a charge's rank is a reading, not the statute's words. */
export type AmbiguityCode =
  | 'interest'
  | 'collection_cost'
  | 'plan_installment'
  | 'unknown_type'

export const AMBIGUITY_TEXT: Record<AmbiguityCode, string> = {
  interest: 'Interest isn’t named in § 43-17A-8. It is ranked last (“Other fees and fines”).',
  collection_cost:
    'Collection costs (lien filing, attorney fees, letters, processing) aren’t named in § 43-17A-8. They are ranked last (“Other fees and fines”).',
  plan_installment:
    'A payment-plan installment may stand in for dues, a fine or a fee, and § 43-17A-8 doesn’t say where it ranks. It is ranked last (“Other fees and fines”).',
  unknown_type: 'This charge type isn’t one the statute names. It is ranked last (“Other fees and fines”).',
}

export const ASK_YOUR_ATTORNEY = 'Ask your attorney'

export interface OpenCharge {
  id: string
  /** assessments.assessment_type, or 'interest'. */
  type: string
  /** yyyy-mm-dd. */
  dueDate: string
  /** What is still owed, in cents. */
  remainingCents: number
  /** A payment-plan installment (stored as 'special'). */
  planInstallment?: boolean
}

export interface RankedCharge {
  tier: PaymentTier
  ambiguity: AmbiguityCode | null
}

/** The rank of one charge. Never throws; an unknown type is ranked last and flagged. */
export function rankCharge(charge: Pick<OpenCharge, 'type' | 'planInstallment'>): RankedCharge {
  if (charge.planInstallment) return { tier: 4, ambiguity: 'plan_installment' }
  switch (charge.type) {
    case 'regular':
      return { tier: 1, ambiguity: null }
    case 'special':
      return { tier: 2, ambiguity: null }
    case 'late_fee':
    case 'fine':
      return { tier: 3, ambiguity: null }
    case 'interest':
      return { tier: 4, ambiguity: 'interest' }
    case 'lien_filing':
    case 'collection_legal':
    case 'collection_letter':
    case 'collection_processing':
      return { tier: 4, ambiguity: 'collection_cost' }
    default:
      return { tier: 4, ambiguity: 'unknown_type' }
  }
}

export type AllocationMode = 'ga_statutory' | 'oldest_first'

/** True for a Georgia association (the governing-law state) on or after January 1, 2027. */
export function gaPaymentOrderApplies(state: string | null | undefined, today: string): boolean {
  return (state ?? '').trim().toUpperCase() === 'GA' && today >= GA_PAYMENT_ORDER_EFFECTIVE_ON
}

export function allocationMode(state: string | null | undefined, today: string): AllocationMode {
  return gaPaymentOrderApplies(state, today) ? 'ga_statutory' : 'oldest_first'
}

const byDueThenId = (a: { dueDate: string; id: string }, b: { dueDate: string; id: string }) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export interface AllocationLine {
  chargeId: string
  type: string
  dueDate: string
  tier: PaymentTier
  ambiguity: AmbiguityCode | null
  /** Cents of the payment applied to this charge: 1 to remainingBefore. */
  appliedCents: number
  remainingBeforeCents: number
  remainingAfterCents: number
}

export interface Allocation {
  mode: AllocationMode
  lines: AllocationLine[]
  totalCents: number
  appliedCents: number
  /** Left after every eligible charge: never applied to anything. */
  unappliedCents: number
}

/**
 * Split `amountCents` over the open charges.
 *
 * ga_statutory: charges due on or before `today`, by rank (1 to 4), oldest
 * due first within a rank, id as the last tie-break. oldest_first: every
 * open charge, oldest due first, type ignored.
 *
 * Never applies more than a charge's remaining or more than the amount;
 * lines sum to appliedCents, and appliedCents + unappliedCents = totalCents.
 * Charges with nothing remaining are skipped. Throws RangeError for an
 * amount that isn't a positive whole number of cents or a remaining that
 * isn't a whole number of cents, so a float never reaches the books.
 */
export function allocatePayment(input: {
  amountCents: number
  charges: readonly OpenCharge[]
  mode: AllocationMode
  today: string
}): Allocation {
  const { amountCents, mode, today } = input
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError('amountCents must be a positive whole number of cents')
  }
  for (const c of input.charges) {
    if (!Number.isSafeInteger(c.remainingCents)) throw new RangeError('remainingCents must be a whole number of cents')
  }

  const open = input.charges.filter((c) => c.remainingCents > 0)
  const ranked = open.map((c) => ({ c, r: rankCharge(c) }))
  const ordered =
    mode === 'ga_statutory'
      ? ranked
          .filter((x) => x.c.dueDate <= today)
          .sort((a, b) => a.r.tier - b.r.tier || byDueThenId(a.c, b.c))
      : [...ranked].sort((a, b) => byDueThenId(a.c, b.c))

  let left = amountCents
  const lines: AllocationLine[] = []
  for (const { c, r } of ordered) {
    if (left <= 0) break
    const applied = Math.min(left, c.remainingCents)
    left -= applied
    lines.push({
      chargeId: c.id,
      type: c.type,
      dueDate: c.dueDate,
      tier: r.tier,
      ambiguity: r.ambiguity,
      appliedCents: applied,
      remainingBeforeCents: c.remainingCents,
      remainingAfterCents: c.remainingCents - applied,
    })
  }
  return { mode, lines, totalCents: amountCents, appliedCents: amountCents - left, unappliedCents: left }
}

/**
 * Pay-line order for the Zelle screens. ga_statutory: charges due on or
 * before today by rank then oldest due, then charges not yet due oldest
 * first. oldest_first: oldest due first (today's order). Same elements,
 * never dropped or duplicated.
 */
export function orderForPayLines<T extends { id: string; assessmentType: string; dueDate: string }>(
  charges: readonly T[],
  mode: AllocationMode,
  today: string,
  planInstallmentIds: ReadonlySet<string> = new Set(),
): T[] {
  if (mode !== 'ga_statutory') return [...charges].sort(byDueThenId)
  const tierOf = (c: T) => rankCharge({ type: c.assessmentType, planInstallment: planInstallmentIds.has(c.id) }).tier
  const due = charges.filter((c) => c.dueDate <= today).sort((a, b) => tierOf(a) - tierOf(b) || byDueThenId(a, b))
  const later = charges.filter((c) => c.dueDate > today).sort(byDueThenId)
  return [...due, ...later]
}

/** Ambiguity codes in a split, each once, in order of first use. */
export function ambiguitiesIn(lines: readonly Pick<AllocationLine, 'ambiguity'>[]): AmbiguityCode[] {
  const seen: AmbiguityCode[] = []
  for (const l of lines) if (l.ambiguity && !seen.includes(l.ambiguity)) seen.push(l.ambiguity)
  return seen
}
