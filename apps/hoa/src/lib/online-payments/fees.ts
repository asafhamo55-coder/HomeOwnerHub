/**
 * Online payment fee engine (BL-035, design doc section 2). PURE: integer cents
 * only, no floats in any money value, no I/O, no flag checks. The Pay screen,
 * the server action that creates the PaymentIntent, and the receipt all call
 * `computeOnlinePaymentFees`, so the three can never disagree. The server
 * recomputes; a client number is only a preview.
 *
 * Vocabulary
 *   duesCents        what the homeowner owes and the ledger records.
 *   feeCents         the price of paying online (the "convenience fee"; for
 *                    cards a surcharge in network terms). 0 when exempt.
 *   feePayer         who bears feeCents: 'homeowner' adds it to the charge,
 *                    'association' leaves the charge at dues and the fee is
 *                    deducted from the association's Stripe balance.
 *   grossCents       the PaymentIntent amount (dues, plus fee if homeowner pays).
 *   stripeCostEstimateCents  Stripe's processing fee on grossCents (an estimate).
 *   applicationFeeCents      our Connect application_fee_amount =
 *                    max(0, feeCents - stripe cost). Never negative, so we never
 *                    absorb a loss; if Stripe's cost exceeds the fee, the
 *                    association bears the shortfall.
 *   netToHoaCents    gross - Stripe cost - application fee. Equals dues whenever
 *                    the homeowner pays and the fee covers Stripe's cost.
 *
 * The owner has not decided pricing (OA-42). Everything below the "CONFIG"
 * banner is a constant to change in one place; defaults are the design
 * document's recommendations.
 */

// ── CONFIG ──────────────────────────────────────────────────────────────

export type PaymentMethodKind = 'ach' | 'credit_card' | 'debit_card'
export type FeePayer = 'association' | 'homeowner'

/** Card fee: percentage in basis points of dues (300 = 3.0%) plus a fixed amount. */
export const CARD_FEE_PERCENT_BPS = 300
export const CARD_FEE_FIXED_CENTS = 50
/**
 * Network surcharge ceiling on the PERCENTAGE part, in basis points (Visa's is
 * currently 3%; verify with counsel, OA-48). The configured rate is clamped to it.
 */
export const CARD_SURCHARGE_NETWORK_CAP_BPS = 300
/** Hard ceiling on a single card fee, whatever the amount. */
export const CARD_FEE_MAX_CENTS = 50_000

/** 'scaled': max(floor, stripe ACH cost + margin) up to the cap. 'flat': always the floor. */
export type AchFeeModel = 'flat' | 'scaled'
export const ACH_FEE_MODEL: AchFeeModel = 'scaled'
export const ACH_FEE_FLOOR_CENTS = 245
export const ACH_FEE_CAP_CENTS = 545
/** Our margin over Stripe's ACH cost in the scaled model. */
export const ACH_FEE_MARGIN_CENTS = 45

/** Default fee payer per method (board-configurable per association). */
export const DEFAULT_ACH_FEE_PAYER: FeePayer = 'association'
export const DEFAULT_CARD_FEE_PAYER: FeePayer = 'homeowner'

/**
 * States where the card fee is forced onto the association. Seeded from the
 * design doc's list of states with historic surcharge bans or conditions
 * (Connecticut, Massachusetts; Colorado, Maine, Oklahoma have caps or
 * conditions). Forcing the association to pay is always safe, so this errs
 * wide; narrow it only on counsel's sign-off (OA-48). Two-letter codes.
 */
export const SURCHARGE_BLOCKED_STATES: readonly string[] = ['CT', 'MA', 'CO', 'ME', 'OK']

/** Stripe's published pricing, used only for the estimate. */
export const STRIPE_CARD_PERCENT_BPS = 290
export const STRIPE_CARD_FIXED_CENTS = 30
export const STRIPE_ACH_PERCENT_BPS = 80
export const STRIPE_ACH_CAP_CENTS = 500

/** Largest dues accepted by the engine ($1,000,000). */
export const MAX_DUES_CENTS = 100_000_000

// ── engine ──────────────────────────────────────────────────────────────

export interface FeePolicy {
  achFeePayer: FeePayer
  cardFeePayer: FeePayer
  /** The board ticked the card-fee acknowledgement (design 2.4). Card fee is off until then. */
  cardFeeAcknowledged: boolean
  /** The association's two-letter state, for the blocked-state list. */
  state?: string | null
}

export const DEFAULT_FEE_POLICY: FeePolicy = {
  achFeePayer: DEFAULT_ACH_FEE_PAYER,
  cardFeePayer: DEFAULT_CARD_FEE_PAYER,
  cardFeeAcknowledged: false,
  state: null,
}

export type PayerReason =
  | 'configured'
  | 'blocked_state'
  | 'not_acknowledged'
  | 'debit_exempt'

export interface OnlinePaymentFees {
  method: PaymentMethodKind
  feePayer: FeePayer
  payerReason: PayerReason
  duesCents: number
  /** Price of paying online. 0 for a debit card the homeowner would pay for. */
  feeCents: number
  /** The part of feeCents added to the charge (feeCents if homeowner pays, else 0). */
  feeChargedToPayerCents: number
  grossCents: number
  stripeCostEstimateCents: number
  applicationFeeCents: number
  netToHoaCents: number
}

/** n / d rounded half up, for non-negative integers. */
function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d))
}

export function stripeCostEstimateCents(method: PaymentMethodKind, grossCents: number): number {
  assertCents(grossCents, 'grossCents')
  if (method === 'ach') {
    return Math.min(STRIPE_ACH_CAP_CENTS, roundDiv(grossCents * STRIPE_ACH_PERCENT_BPS, 10_000))
  }
  return roundDiv(grossCents * STRIPE_CARD_PERCENT_BPS, 10_000) + STRIPE_CARD_FIXED_CENTS
}

/** The fee price for a method and dues amount, before who-pays rules. */
export function baseFeeCents(method: PaymentMethodKind, duesCents: number): number {
  assertCents(duesCents, 'duesCents')
  if (method === 'ach') {
    if (ACH_FEE_MODEL === 'flat') return ACH_FEE_FLOOR_CENTS
    // Priced off Stripe's cost on the dues amount (not on gross) so the price
    // does not depend on itself when the homeowner pays.
    const priced = stripeCostEstimateCents('ach', duesCents) + ACH_FEE_MARGIN_CENTS
    return Math.min(ACH_FEE_CAP_CENTS, Math.max(ACH_FEE_FLOOR_CENTS, priced))
  }
  const rateBps = Math.min(CARD_FEE_PERCENT_BPS, CARD_SURCHARGE_NETWORK_CAP_BPS)
  const fee = roundDiv(duesCents * rateBps, 10_000) + CARD_FEE_FIXED_CENTS
  return Math.min(CARD_FEE_MAX_CENTS, fee)
}

export function isSurchargeBlockedState(state: string | null | undefined): boolean {
  if (!state) return false
  return SURCHARGE_BLOCKED_STATES.includes(state.trim().toUpperCase())
}

function assertCents(n: number, name: string): void {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_DUES_CENTS * 2) {
    throw new RangeError(`${name} must be a whole number of cents between 1 and ${MAX_DUES_CENTS * 2}, got ${n}`)
  }
}

/** Who actually pays, after the state, acknowledgement and debit rules. */
export function resolveFeePayer(
  method: PaymentMethodKind,
  policy: FeePolicy,
): { payer: FeePayer; reason: PayerReason } {
  if (method === 'ach') return { payer: policy.achFeePayer, reason: 'configured' }
  if (policy.cardFeePayer === 'association') return { payer: 'association', reason: 'configured' }
  // Card, configured to homeowner pays: the guards below can force the association.
  if (isSurchargeBlockedState(policy.state)) return { payer: 'association', reason: 'blocked_state' }
  if (!policy.cardFeeAcknowledged) return { payer: 'association', reason: 'not_acknowledged' }
  if (method === 'debit_card') return { payer: 'homeowner', reason: 'debit_exempt' }
  return { payer: 'homeowner', reason: 'configured' }
}

export function computeOnlinePaymentFees(
  method: PaymentMethodKind,
  duesCents: number,
  policy: FeePolicy = DEFAULT_FEE_POLICY,
): OnlinePaymentFees {
  if (duesCents > MAX_DUES_CENTS) {
    throw new RangeError(`duesCents must be at most ${MAX_DUES_CENTS}, got ${duesCents}`)
  }
  assertCents(duesCents, 'duesCents')
  const { payer, reason } = resolveFeePayer(method, policy)

  // Debit cards carry no surcharge: when the homeowner would pay, the fee is 0
  // and the association bears Stripe's cost. When the association pays, a debit
  // card is priced like any card.
  const exempt = method === 'debit_card' && payer === 'homeowner'
  const feeCents = exempt ? 0 : baseFeeCents(method, duesCents)
  const charged = payer === 'homeowner' ? feeCents : 0
  const grossCents = duesCents + charged
  const stripe = stripeCostEstimateCents(method, grossCents)
  // Never negative, and never more than the charge can carry after Stripe's cut
  // (Stripe rejects an application fee above the amount).
  const applicationFeeCents = Math.min(Math.max(0, feeCents - stripe), Math.max(0, grossCents - stripe))
  const netToHoaCents = grossCents - stripe - applicationFeeCents

  return {
    method,
    feePayer: payer,
    payerReason: exempt ? 'debit_exempt' : reason,
    duesCents,
    feeCents,
    feeChargedToPayerCents: charged,
    grossCents,
    stripeCostEstimateCents: stripe,
    applicationFeeCents,
    netToHoaCents,
  }
}
