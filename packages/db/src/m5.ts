/**
 * Migration batch M5 (migrations/0069_m5_batch.sql) switch.
 *
 * false until the owner confirms 0069 is applied in production (runbook
 * Section L, L4). Every code path that reads or writes an M5 table or
 * function checks this first, and with it false the app behaves exactly
 * as before M5 — and keeps working when the tables already exist (CI
 * replays 0069, so the integration suite runs "tables present, flag
 * false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-137 dues_rates
 *          apps/hoa/src/lib/dues-rates/ (model.ts, law.ts, queries.ts,
 *          actions.ts, billing.ts), app/(dashboard)/dues/rates (the
 *          schedule and the increase notice), app/(dashboard)/dues
 *          (Generate dues pre-fill), app/(dashboard)/dues/new (Add a due
 *          pre-fill), lib/assessments.ts (the audited override),
 *          lib/budget-adoption/model.ts (the kit's "set the new dues rate"
 *          step links to a pre-filled rate)
 *   BL-143 owner_join_codes, owner_join_requests, owner_join_attempts and
 *          owner_join_claim / owner_join_my_status / owner_join_decide
 *          apps/hoa/src/lib/owner-join/ (model.ts, board.ts, actions.ts,
 *          status.ts), app/join ("Ask to join"), the "Ask to join" button
 *          on every resident "No home linked yet" (AskToJoinLink),
 *          /onboarding's link, /settings/members "Join codes", and the
 *          /approvals "Requests to join" section (lib/approvals-inbox)
 *   BL-145 compliance_deadlines_done.document_id (the evidence document)
 *          apps/hoa/src/lib/compliance/evidence.ts (selects it),
 *          lib/compliance/actions.ts (Mark as done with evidence, attach
 *          evidence), app/(dashboard)/compliance (the picker; with the flag
 *          off the page is read-only and shows no evidence)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M5_APPLIED: boolean = false
