/**
 * Migration batch M14 (migrations/0079_mailed_letters.sql) switch.
 *
 * true: 0079 was applied in production and verified on 2026-11-05. Every
 * code path that reads or writes mailed_letters checks this first. The
 * provider keys are a separate owner step: with no keys the app hides the
 * "Mail this letter for me" panel (mailingAvailable() in
 * apps/hoa/src/lib/mailed-letters/config.ts) and the board prints the letter
 * and mails it themselves, and the server actions refuse to send. Covers:
 *   BL-032 print-and-mail letters (mailed_letters):
 *          apps/hoa/src/lib/mailed-letters/
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M14_APPLIED: boolean = true
