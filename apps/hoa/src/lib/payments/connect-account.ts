/**
 * Pure rules for an association's Stripe Connect account (BL-035, PR 3):
 * where onboarding stands, whether residents may see "Pay now", and which fee
 * settings a board may save. No imports from Next or the database, so client
 * components and tests use it.
 */
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { SURCHARGE_BLOCKED_STATES, type FeePayer } from '@/lib/online-payments/fees'

/** The mirrored row (association_stripe_accounts), camelCased. */
export interface ConnectAccountRow {
  id: string
  organizationId: string
  associationId: string
  stripeAccountId: string
  detailsSubmitted: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  requirementsDue: string[]
  disabledReason: string | null
  onlinePaymentsEnabled: boolean
  achFeePayer: FeePayer
  cardFeePayer: FeePayer
  cardFeeAcknowledgedAt: string | null
  returnedPaymentFeeCents: number | null
}

export type OnboardingStatus =
  | 'not_started' // no Stripe account yet
  | 'needs_details' // started, the treasurer has not finished Stripe's form
  | 'needs_attention' // Stripe asked for more information
  | 'in_review' // submitted, Stripe is still checking
  | 'payouts_pending' // can take payments, no bank account for payouts yet
  | 'ready'

export function onboardingStatus(
  row: Pick<
    ConnectAccountRow,
    'detailsSubmitted' | 'chargesEnabled' | 'payoutsEnabled' | 'requirementsDue'
  > | null,
): OnboardingStatus {
  if (!row) return 'not_started'
  if (row.chargesEnabled && row.payoutsEnabled) return 'ready'
  if (!row.detailsSubmitted) return 'needs_details'
  if (row.requirementsDue.length > 0) return 'needs_attention'
  if (row.chargesEnabled) return 'payouts_pending'
  return 'in_review'
}

/**
 * Residents see "Pay now" only when the board switched online payments on AND
 * Stripe says the account can take charges AND pay out. Dark until M8 is applied.
 */
export function canPayNow(
  row: Pick<ConnectAccountRow, 'onlinePaymentsEnabled' | 'chargesEnabled' | 'payoutsEnabled'> | null,
  m8: boolean = M8_APPLIED,
): boolean {
  return Boolean(m8 && row && row.onlinePaymentsEnabled && row.chargesEnabled && row.payoutsEnabled)
}

export const STATUS_COPY: Record<OnboardingStatus, { title: string; body: string; action: string | null }> = {
  not_started: {
    title: 'Not set up yet',
    body: 'Set up a free Stripe account for your association. Stripe collects the money and pays it straight into your association’s bank account.',
    action: 'Set up online payments',
  },
  needs_details: {
    title: 'Finish setting up with Stripe',
    body: 'You started, but Stripe still needs a few details about your association and its bank account.',
    action: 'Continue with Stripe',
  },
  needs_attention: {
    title: 'Stripe needs more information',
    body: 'Stripe asked for something more before it can turn payments on. Open Stripe to see what is missing.',
    action: 'Continue with Stripe',
  },
  in_review: {
    title: 'Stripe is checking your details',
    body: 'This usually takes a short while. You do not need to do anything. This page updates on its own when Stripe finishes.',
    action: null,
  },
  payouts_pending: {
    title: 'Add a bank account for payouts',
    body: 'Stripe can take payments, but it has no bank account to send the money to yet.',
    action: 'Continue with Stripe',
  },
  ready: {
    title: 'Stripe is ready',
    body: 'Your account can take payments and pay out to your bank.',
    action: null,
  },
}

// ── fee settings ────────────────────────────────────────────────────────

/** Largest returned-payment fee a board may set, pending counsel (decision 5). */
export const RETURNED_FEE_MAX_CENTS = 3000

/** States where the card fee may be passed to residents in v1 (decision 6). */
export const CARD_FEE_ALLOWED_STATES: readonly string[] = ['GA']

export function cardFeeAllowedInState(state: string | null | undefined): boolean {
  const s = (state ?? '').trim().toUpperCase()
  if (!s || SURCHARGE_BLOCKED_STATES.includes(s)) return false
  return CARD_FEE_ALLOWED_STATES.includes(s)
}

export interface FeeSettingsInput {
  achFeePayer: unknown
  cardFeePayer: unknown
  returnedPaymentFeeCents: unknown
  /** The board member ticked the card fee acknowledgement on this save. */
  acknowledgeCardFee: unknown
}

export interface FeeSettingsValid {
  achFeePayer: FeePayer
  cardFeePayer: FeePayer
  returnedPaymentFeeCents: number | null
  /** True when this save newly records the acknowledgement. */
  recordAcknowledgement: boolean
}

export type FeeSettingsResult = { ok: true; value: FeeSettingsValid } | { ok: false; error: string }

const isPayer = (v: unknown): v is FeePayer => v === 'association' || v === 'homeowner'

export function validateFeeSettings(
  input: FeeSettingsInput,
  ctx: { associationState: string | null; alreadyAcknowledged: boolean },
): FeeSettingsResult {
  if (!isPayer(input.achFeePayer) || !isPayer(input.cardFeePayer)) {
    return { ok: false, error: 'Choose who pays the fee for each way of paying.' }
  }
  let returned: number | null = null
  const raw = input.returnedPaymentFeeCents
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'The returned payment fee must be a whole number of cents.' }
    if (n > RETURNED_FEE_MAX_CENTS) {
      return { ok: false, error: 'The returned payment fee can be at most $30.00.' }
    }
    returned = n === 0 ? null : n
  }
  const ack = input.acknowledgeCardFee === true || input.acknowledgeCardFee === 'on'
  let recordAcknowledgement = false
  if (input.cardFeePayer === 'homeowner') {
    if (!cardFeeAllowedInState(ctx.associationState)) {
      return {
        ok: false,
        error:
          'Charging residents the card fee is not available in your state yet. The association pays the card fee for now.',
      }
    }
    if (!ctx.alreadyAcknowledged) {
      if (!ack) {
        return { ok: false, error: 'Please confirm you have read your state’s rules before residents pay the card fee.' }
      }
      recordAcknowledgement = true
    }
  }
  return {
    ok: true,
    value: {
      achFeePayer: input.achFeePayer,
      cardFeePayer: input.cardFeePayer,
      returnedPaymentFeeCents: returned,
      recordAcknowledgement,
    },
  }
}
