/**
 * BL-063 retry cap for recurring-event alerts that write no communications
 * row (no association, no recipients, a failed audit insert, a send that
 * threw). Migration 0064 adds hoa_recurring_events.alert_failed_attempts +
 * alert_failed_for; the cron counts a nothing-delivered day there, keyed to
 * the occurrence (event_date) it was for, so a rolled or edited date starts
 * from zero without anyone resetting it.
 *
 * Inert until M1_APPLIED: with the flag false the cron selects and writes
 * none of these columns, and the cap is the BL-056 communications-row count
 * alone. Pure: no Supabase, no Next.
 */
import { M1_APPLIED } from '@homeowner-portal/db/m1'

export interface AlertAttemptState {
  event_date: string
  alert_failed_attempts?: number | null
  alert_failed_for?: string | null
}

const BASE_COLUMNS =
  'id, organization_id, association_id, title, description, event_date, recurrence, alert_days_before, notify_channels, notify_audience, last_alert_sent_at, last_alert_sent_for, is_active, created_at'

/** The cron's worklist columns: the BL-063 pair only once M1 is applied. */
export function recurringEventCronColumns(m1: boolean = M1_APPLIED): string {
  return m1 ? `${BASE_COLUMNS}, alert_failed_attempts, alert_failed_for` : BASE_COLUMNS
}

/** Failed days recorded on the row for THIS occurrence (0 when it counts another date). */
export function recordedFailedAttempts(event: AlertAttemptState, m1: boolean = M1_APPLIED): number {
  if (!m1) return 0
  if (event.alert_failed_for !== event.event_date) return 0
  const n = event.alert_failed_attempts ?? 0
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * The count the cap is checked against: the larger of the communications
 * rows (BL-056) and the row's own counter. Max, not sum: a day that wrote a
 * failed communications row is also counted on the row, once.
 */
export function effectiveFailedAttempts(
  event: AlertAttemptState,
  failedCommunications: number,
  m1: boolean = M1_APPLIED,
): number {
  return Math.max(failedCommunications, recordedFailedAttempts(event, m1))
}

/**
 * Extra columns for the "nothing went out, give the lease back" write: one
 * more failed day for this occurrence. Empty with the flag off.
 */
export function failedAttemptPatch(
  event: AlertAttemptState,
  m1: boolean = M1_APPLIED,
): { alert_failed_attempts: number; alert_failed_for: string } | Record<string, never> {
  if (!m1) return {}
  return { alert_failed_attempts: recordedFailedAttempts(event, m1) + 1, alert_failed_for: event.event_date }
}
