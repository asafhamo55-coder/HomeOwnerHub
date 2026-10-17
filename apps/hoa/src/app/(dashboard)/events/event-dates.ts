import type { RecurringEvent } from '@/lib/events'
import { DEFAULT_ASSOCIATION_TIME_ZONE, addCalendarDays, calendarDaysBetween, dayOf } from '@/lib/association-time'

// Date helpers for the events pages. Event dates are calendar dates
// (YYYY-MM-DD). "Today" is the event's association day (BL-065) — the
// caller resolves it through association-zone-index.ts, the same rule the
// recurring-events cron uses — and is always passed in, never read here.

/** Whole calendar days from `today` to the date (negative when past). */
export function daysUntilDate(yyyyMmDd: string, today: string): number {
  return calendarDaysBetween(today, yyyyMmDd)
}

export function relativeDays(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 0) return `In ${days} days`
  return `${Math.abs(days)} days ago`
}

export function formatDate(yyyyMmDd: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return d.toLocaleDateString(
    'en-US',
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  )
}

export type AlertState =
  | { kind: 'paused' }
  | { kind: 'sent'; on: string | null }
  | { kind: 'scheduled'; on: string }
  | { kind: 'due' }
  | { kind: 'none' }

/**
 * Where this occurrence's reminder stands. Mirrors the cron's rules
 * (lib/events.ts header): it fires on event_date − alert_days_before, once
 * per occurrence, with last_alert_sent_for as the idempotency anchor.
 * `today` is the event's association day and `timeZone` its zone (for the
 * day the reminder went out).
 */
export function alertState(
  event: RecurringEvent,
  today: string,
  timeZone: string = DEFAULT_ASSOCIATION_TIME_ZONE,
): AlertState {
  if (!event.is_active) return { kind: 'paused' }
  if (event.last_alert_sent_for === event.event_date) {
    return { kind: 'sent', on: dayOf(event.last_alert_sent_at, timeZone) }
  }
  if (event.event_date < today) return { kind: 'none' }
  const on = addCalendarDays(event.event_date, -event.alert_days_before)
  if (on <= today) return { kind: 'due' }
  return { kind: 'scheduled', on }
}

export function leadTimeLabel(days: number): string {
  return days === 0 ? 'On the day' : `${days} day${days === 1 ? '' : 's'} before`
}

export const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'SMS', portal: 'Portal' }

export function audienceLabel(event: RecurringEvent): string {
  const a = event.notify_audience as { kind?: string; boardUserIds?: string[]; residentIds?: string[] }
  switch (a?.kind) {
    case 'everyone':
      return 'All community'
    case 'specific_residents':
      return `${a.residentIds?.length ?? 0} resident${(a.residentIds?.length ?? 0) === 1 ? '' : 's'}`
    case 'board':
    default:
      return a?.boardUserIds ? `${a.boardUserIds.length} board member${a.boardUserIds.length === 1 ? '' : 's'}` : 'Whole board'
  }
}
