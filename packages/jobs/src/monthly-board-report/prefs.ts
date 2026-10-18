/**
 * The per-user "Monthly board report" opt-out (BL-073). Pure.
 *
 * Stored in the user's Supabase auth `user_metadata` — the one per-user
 * JSON that already exists — under `notification_prefs.monthly_board_report`.
 * profiles and org_members have no preferences column, and adding one is a
 * migration. Consequence: the choice is per person, not per association; a
 * board member of two associations opts out of both at once.
 *
 * Default ON: only an explicit `false` turns it off.
 */

export const NOTIFICATION_PREFS_KEY = 'notification_prefs'
export const MONTHLY_BOARD_REPORT_PREF = 'monthly_board_report'

function prefsOf(userMetadata: unknown): Record<string, unknown> {
  if (!userMetadata || typeof userMetadata !== 'object') return {}
  const prefs = (userMetadata as Record<string, unknown>)[NOTIFICATION_PREFS_KEY]
  return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : {}
}

export function wantsMonthlyBoardReport(userMetadata: unknown): boolean {
  return prefsOf(userMetadata)[MONTHLY_BOARD_REPORT_PREF] !== false
}

/**
 * The `user_metadata` patch for `auth.updateUser({ data })`. Supabase merges
 * `data` into user_metadata one level deep only, so the whole
 * `notification_prefs` object is sent, with any other prefs kept.
 */
export function withMonthlyBoardReportPref(userMetadata: unknown, on: boolean): Record<string, unknown> {
  return { [NOTIFICATION_PREFS_KEY]: { ...prefsOf(userMetadata), [MONTHLY_BOARD_REPORT_PREF]: on } }
}
