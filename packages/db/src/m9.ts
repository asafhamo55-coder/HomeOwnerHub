/**
 * Migration batch M9 (migrations/0074_polls.sql) switch.
 *
 * false: 0074 is a draft the owner has not applied in production yet. Every
 * code path that reads or writes an M9 table or function checks this first,
 * and with it false the app behaves exactly as before M9 and keeps working
 * when the objects already exist (CI replays 0074, so the integration suite
 * runs "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   B1 / BL-023 informal polls and surveys (not a legal vote)
 *      polls, poll_options, poll_responses, poll_response_choices,
 *      submit_poll_response(), poll_results():
 *      apps/hoa/src/lib/polls/ (rules.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M9_APPLIED: boolean = false
