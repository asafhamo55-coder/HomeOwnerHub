/**
 * Migration batch M8 (migrations/0073_online_payments.sql) switch.
 *
 * false: 0073 is a draft the owner has not applied in production yet
 * (docs/decisions/2026-10-31-online-dues-payments-design.md). Every code path
 * that reads or writes an M8 table or function checks this first, and with it
 * false the app behaves exactly as before M8 and keeps working when the
 * objects already exist (CI replays 0073, so the integration suite runs
 * "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   BL-035 online dues by card and ACH (Stripe Connect Standard, direct charges)
 *          association_stripe_accounts, online_payment_methods, online_payments,
 *          online_payment_adjustments, stripe_payouts,
 *          record_online_payment_success() and reverse_online_payment():
 *          apps/hoa/src/lib/online-payments/ (fees.ts is pure and flag-free)
 *   BL-036 autopay
 *          autopay_enrollments
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M8_APPLIED: boolean = false
