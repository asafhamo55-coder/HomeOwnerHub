/**
 * Migration batch M4 (migrations/0068_m4_batch.sql) switch.
 *
 * false until the owner confirms 0068 is applied in production (runbook
 * Section K, K3). Every code path that reads or writes an M4 table or
 * function checks this first, and with it false the app behaves exactly
 * as before M4 — and keeps working when the tables already exist (CI
 * replays 0068, so the integration suite runs "tables present, flag
 * false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-132 insurance_policies
 *          apps/hoa/src/lib/insurance/ (model.ts, queries.ts, actions.ts),
 *          app/(dashboard)/insurance, app/(dashboard)/page.tsx (expiry card),
 *          packages/jobs/src/daily-digest.ts (expiry lines)
 *   BL-133 violation_hearings + request_violation_hearing()
 *          apps/hoa/src/lib/violation-hearings/ (rules.ts, queries.ts,
 *          actions.ts), app/(dashboard)/violations/[id] (hearing card, and
 *          the BL-130 fine check reading the hearing), lib/violations.ts
 *          (the same check on the move to Fined),
 *          app/resident/violations/[id] (request a hearing)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M4_APPLIED: boolean = false
