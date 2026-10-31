/**
 * Hand-written row and RPC types for migrations/0073_online_payments.sql (M8).
 *
 * Why not database.types.ts: `pnpm gen:types` reads the LIVE database, where 0073
 * is not applied, so regenerating would not contain these (and would wipe
 * anything added there by hand; CLAUDE.md footgun 3). Same approach as M7:
 * code reaches these tables through a narrow cast and checks M8_APPLIED first.
 * After the owner applies 0073, regenerate and delete this file.
 *
 * Type-only: no imports, no runtime.
 */

export type OnlinePaymentMethodType = 'ach' | 'card'
export type OnlineFeePayer = 'association' | 'homeowner'
export type ReverseKind = 'failed' | 'refund' | 'dispute_lost' | 'dispute_won'

export type OnlinePaymentStatus =
  | 'created'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'
  | 'dispute_lost'

export interface AssociationStripeAccountRow {
  id: string
  organization_id: string
  association_id: string
  stripe_account_id: string
  details_submitted: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  requirements_due: unknown
  disabled_reason: string | null
  online_payments_enabled: boolean
  ach_fee_payer: OnlineFeePayer
  card_fee_payer: OnlineFeePayer
  card_fee_acknowledged_at: string | null
  card_fee_acknowledged_by: string | null
  returned_payment_fee_cents: number | null
  started_by: string | null
  created_at: string
  updated_at: string
}

export interface OnlinePaymentMethodRow {
  id: string
  organization_id: string
  association_id: string
  user_id: string
  stripe_account_id: string
  stripe_customer_id: string
  stripe_payment_method_id: string
  method_type: OnlinePaymentMethodType
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  verification: 'financial_connections' | 'microdeposits' | null
  stripe_mandate_id: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
}

export interface AutopayEnrollmentRow {
  id: string
  organization_id: string
  association_id: string
  unit_id: string
  user_id: string
  payment_method_id: string
  max_cents: number
  include_other_charges: boolean
  status: 'active' | 'paused' | 'canceled'
  authorization_text_version: string
  authorized_at: string
  canceled_at: string | null
  consecutive_failures: number
  last_notified_at: string | null
  created_at: string
  updated_at: string
}

/** One entry of online_payments.allocation: a charge part or the single credit part. */
export type OnlinePaymentAllocationPart =
  | { assessment_id: string; cents: number; kind?: 'charge' }
  | { kind: 'credit'; cents: number }

export interface OnlinePaymentRow {
  id: string
  organization_id: string
  association_id: string
  unit_id: string
  user_id: string | null
  source: 'resident' | 'autopay' | 'board_on_behalf'
  autopay_enrollment_id: string | null
  autopay_period: string | null
  method_type: OnlinePaymentMethodType
  online_payment_method_id: string | null
  dues_cents: number
  fee_cents: number
  fee_payer: OnlineFeePayer
  total_cents: number
  application_fee_cents: number
  stripe_fee_cents: number | null
  allocation: OnlinePaymentAllocationPart[]
  allocation_mode: 'ga_statutory' | 'oldest_first'
  posted_result: unknown
  status: OnlinePaymentStatus
  failure_code: string | null
  stripe_account_id: string
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  idempotency_key: string
  receipt_sent_at: string | null
  settled_on: string | null
  posted_at: string | null
  created_at: string
  updated_at: string
}

export interface OnlinePaymentAdjustmentRow {
  id: string
  organization_id: string
  association_id: string
  online_payment_id: string
  kind: 'failed' | 'refund' | 'dispute_lost' | 'dispute_won' | 'returned_fee'
  stripe_ref: string
  amount_cents: number
  reason: string | null
  journal_entry_ids: string[]
  created_by: string | null
  created_at: string
}

export interface StripePayoutRow {
  id: string
  organization_id: string
  association_id: string
  stripe_account_id: string
  stripe_payout_id: string
  amount_cents: number
  fee_cents: number
  arrival_date: string
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'
  bank_transaction_id: string | null
  journal_entry_id: string | null
  matched_at: string | null
  created_at: string
  updated_at: string
}

/** record_online_payment_success(p_attempt, p_paid_on, p_charge). Service role only. */
export interface RecordOnlinePaymentSuccessArgs {
  p_attempt: string
  p_paid_on: string
  p_charge?: string | null
}

export interface RecordOnlinePaymentSuccessResult {
  already_posted: boolean
  status: OnlinePaymentStatus
  posted: unknown
}

/** reverse_online_payment(...). Service role only. */
export interface ReverseOnlinePaymentArgs {
  p_attempt: string
  p_kind: ReverseKind
  p_ref: string
  p_cents?: number | null
  p_reason?: string | null
  p_on?: string | null
  p_returned_fee_cents?: number
  p_by?: string | null
}

export interface ReverseOnlinePaymentResult {
  already_applied: boolean
  status: OnlinePaymentStatus
  reversed_cents?: number
  short_cents?: number
  adjustment_id?: string
  returned_fee_id?: string | null
}
