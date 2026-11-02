/**
 * Migration batch M10 (migrations/0075_online_voting.sql) switch.
 *
 * false: 0075 is a draft the owner has not applied in production yet
 * (docs/specs/2026-11-02-online-voting.md). Every code path that reads or
 * writes a ballot table or function checks this first; with it false the app
 * behaves exactly as before and keeps working when the objects already exist
 * (CI replays 0075, "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   BL-156 online voting and elections
 *          ballots, ballot_options, ballot_voters, ballot_box,
 *          open_ballot(), cast_ballot(), close_ballot(), ballot_results():
 *          apps/hoa/src/lib/online-voting/
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M10_APPLIED: boolean = false
