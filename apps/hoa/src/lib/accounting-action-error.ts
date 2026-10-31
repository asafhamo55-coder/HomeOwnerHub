import { reportError } from '@homeowner-portal/observability/report'

/** Fixed, friendly text for a failed board accounting write. Never a database message. */
export const ACCOUNTING_SAVE_FAILED = 'Couldn’t save that. Try again.'

/**
 * A board accounting action hit a database error. Log the real error
 * server-side (action name and error code only) and hand back text that is
 * safe to show on screen.
 */
export function accountingActionFailed(
  action: string,
  error: { code?: string; message?: string } | null | undefined,
  text: string = ACCOUNTING_SAVE_FAILED,
): { ok: false; error: string } {
  reportError(new Error(`Accounting action failed: ${action} (${error?.code ?? 'no code'})`), 'accounting-action', {
    action,
    code: error?.code ?? null,
  })
  return { ok: false, error: text }
}
