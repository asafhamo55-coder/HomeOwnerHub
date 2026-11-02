/**
 * Migration batch M14 (migrations/0079_mailed_letters.sql) switch.
 *
 * false: 0079 is a draft the owner has not applied in production yet. Every
 * code path that reads or writes mailed_letters checks this first, and with it
 * false the app behaves exactly as before. Flipping it to true is the one-line
 * follow-up after the owner confirms the apply. The provider keys are a
 * separate owner step: with no keys the app refuses to send even when this is
 * true. Covers:
 *   BL-032 print-and-mail letters (mailed_letters):
 *          apps/hoa/src/lib/mailed-letters/
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M14_APPLIED: boolean = false
