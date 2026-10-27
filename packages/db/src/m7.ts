/**
 * Migration batch M7 (migrations/0072_m7_batch.sql) switch.
 *
 * false until the owner confirms 0072 is applied in production (runbook
 * Section O, O4). Every code path that reads or writes an M7 column, table
 * or function checks this first, and with it false the app behaves exactly
 * as before M7 and keeps working when the objects already exist (CI
 * replays 0072, so the integration suite runs "objects present, flag
 * false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-166 certified-mail tracking on collection events
 *          collection_events.mail_method / tracking_number / mailed_on /
 *          delivered_on: apps/hoa/src/lib/collections/mail-tracking.ts,
 *          queries.ts (event columns), actions.ts (recordCollectionEvent),
 *          letters/ (load.ts, actions.ts recordLetterMailing, model.ts),
 *          lib/compliance/statute-drift.ts (the 30-day fee-notice clock
 *          counts from delivered_on), the Georgia collections-letter
 *          screen and the case event list
 *   BL-177 atomic multi-charge payment recording and unapplied credit
 *          record_lump_payment() and unapplied_credits:
 *          apps/hoa/src/lib/payments/lump-payment-actions.ts, the Record
 *          payment dialog (method, date, note), the credit line on the
 *          unit ledger (lib/resident-ledger.ts)
 *   BL-176 association state / governing-law state / type: admin-only at
 *          the database (a trigger). Nothing in the app waits for this
 *          flag: the Settings > Association form was already admin-only,
 *          and the trigger makes the database agree.
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M7_APPLIED: boolean = false
