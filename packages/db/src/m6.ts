/**
 * Migration batch M6 (migrations/0070_m6_roles.sql) switch.
 *
 * false until the owner confirms 0070 is applied in production (runbook
 * Section M, M4). Every code path that reads or writes an M6 column, table
 * or function checks this first, and with it false the app behaves exactly
 * as before M6 and keeps working when the objects already exist (CI
 * replays 0070, so the integration suite runs "objects present, flag
 * false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-168 professional and officer roles
 *          apps/hoa/src/lib/professionals/ (model.ts, guard.ts, actions.ts,
 *          proposal.ts, load.ts), lib/auth.ts (Role gains cpa and
 *          attorney, requireRole helpers), lib/orgs.ts (reads
 *          access_expires_at and officer_title), the (pro) route group
 *          (/pro/accounting for a CPA, /pro/matters for an attorney),
 *          /settings/professionals (Invite a professional, officer
 *          titles, matter assignments, the dual-control amount), and the
 *          "From your professionals" section of /approvals plus the
 *          Treasurer routing of money approvals (lib/approvals-inbox)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M6_APPLIED: boolean = false
