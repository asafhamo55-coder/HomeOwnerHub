/**
 * Migration batch M13 (migrations/0078_community_board.sql) switch.
 *
 * true: 0078 was applied in production on 2026-11-05. Every
 * code path that reads or writes an M13 table or function checks this first,
 * and with it false the app behaves as it did before M13.
 *
 * Flipped to true after the owner confirmed the apply. Covers:
 *   B5 community message board, private to one association
 *      board_threads, board_posts, board_post_reports,
 *      community_board_association_ids():
 *      apps/hoa/src/lib/community-board/ (rules.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M13_APPLIED: boolean = true
