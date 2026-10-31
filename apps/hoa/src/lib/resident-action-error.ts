import { reportError } from '@homeowner-portal/observability/report'

/** Fixed, friendly text for a failed resident write. Never a database message. */
export const RESIDENT_SEND_FAILED = 'Couldn’t send. Try again, or message the board.'

/**
 * A resident action hit a database error. Log the real error server-side
 * (code and action name only, no row values or ids of people) and hand back
 * text that is safe to show a homeowner.
 */
export function residentActionFailed(
  action: string,
  error: { code?: string; message?: string } | null | undefined,
): { ok: false; error: string } {
  reportError(new Error(`Resident action failed: ${action} (${error?.code ?? 'no code'})`), 'resident-action', {
    action,
    code: error?.code ?? null,
  })
  return { ok: false, error: RESIDENT_SEND_FAILED }
}
