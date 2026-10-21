/**
 * Migration batch M1 (migrations/0064_m1_batch.sql) switch.
 *
 * false until the owner confirms 0064 is applied in production. Every code
 * path that reads or writes an M1 column, table or function checks this
 * first, and with it false the app behaves exactly as before M1 — and keeps
 * working when the columns already exist (CI replays 0064, so the
 * integration suite runs "columns present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-020 member_email_consent_events        (apps/hoa/src/lib/email-consent.ts)
 *          + CA official notices email only consenting members
 *            (apps/hoa/src/lib/communications/official-notice.ts, send.ts)
 *   BL-050 hoa_meeting_minutes.notice_posted_at (apps/hoa/src/lib/fl-compliance)
 *   BL-052 *.visible_to_owners                 (apps/hoa/src/lib/resident-documents)
 *   BL-063 hoa_recurring_events.alert_failed_* (api/cron/recurring-events)
 *   Stripe stripe_webhook_* functions          (packages/billing/src/webhook.ts)
 * (BL-058 storage and the P3 sale floor are database-only: nothing to flip.)
 *
 * No imports: pure modules and the integration suite import this.
 */
export const M1_APPLIED: boolean = true
