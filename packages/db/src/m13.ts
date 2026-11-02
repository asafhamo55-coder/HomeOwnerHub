/**
 * Migration batch M13 (migrations/0078_community_board.sql) switch.
 *
 * false: 0078 is a draft the owner has not applied in production yet. Every
 * code path that reads or writes an M13 table or function checks this first,
 * and with it false the app behaves exactly as before M13 and keeps working
 * when the objects already exist (CI replays 0078, so the integration suite
 * runs "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   B5 community message board, private to one association
 *      board_threads, board_posts, board_post_reports,
 *      community_board_association_ids():
 *      apps/hoa/src/lib/community-board/ (rules.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M13_APPLIED: boolean = false
