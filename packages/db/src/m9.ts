/**
 * Migration batch M9 (migrations/0074_polls.sql) switch.
 *
 * true: 0074 was applied in production on 2026-11-05. Every
 * code path that reads or writes an M9 table or function checks this first,
 * and with it false the app behaves as it did before M9.
 *
 * Flipped to true after the owner confirmed the apply. Covers:
 *   B1 / BL-023 informal polls and surveys (not a legal vote)
 *      polls, poll_options, poll_responses, poll_response_choices,
 *      submit_poll_response(), poll_results():
 *      apps/hoa/src/lib/polls/ (rules.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M9_APPLIED: boolean = true
