/**
 * What a guarded send reports, and how a finished communication is
 * labelled from it. Kept apart from ./outbound-guard (and import-free) so
 * code that only needs the outcome vocabulary — status writers, screens —
 * does not pull in the guard, and tests that mock the guard keep these.
 */

/** What a blocked send reports back to its caller. Contains no address. */
export const OUTBOUND_BLOCKED_ERROR =
  'Not delivered: blocked by the outbound safety guard (recipient is not on OUTBOUND_ALLOWLIST outside production).'

/**
 * The final status of a communications row once every recipient resolved.
 *
 * `failed` is for real failures only. A send the guard held back for EVERY
 * recipient (a sandboxed org, a recipient off OUTBOUND_ALLOWLIST outside
 * production) delivered nothing but failed at nothing either — reporting it
 * as `failed` sent boards looking for a broken mailbox (BL-044). Migration
 * 0018's status CHECK has no "held" value, so that case is written as
 * `cancelled`: terminal, not an error, never picked up by the scheduled
 * dispatcher. Screens name it "Held by the safety guard" from the
 * recipients' `suppressed` rows (see heldBySafetyGuard).
 *
 * Any delivery wins (`sent`, per-recipient detail carries the rest); any
 * real failure with nothing delivered stays `failed`.
 */
export function finalSendStatus(counts: { sent: number; failed: number; held: number }): 'sent' | 'failed' | 'cancelled' {
  if (counts.sent > 0) return 'sent'
  if (counts.failed === 0 && counts.held > 0) return 'cancelled'
  return 'failed'
}

/** True when a finished communication delivered nothing only because the
 *  guard held it back — the read side of finalSendStatus's `cancelled`.
 *  A board-cancelled scheduled send has no held recipients, so it never
 *  matches. */
export function heldBySafetyGuard(c: { status: string; sent: number; failed: number; held: number }): boolean {
  return c.status === 'cancelled' && c.held > 0 && c.sent === 0 && c.failed === 0
}
