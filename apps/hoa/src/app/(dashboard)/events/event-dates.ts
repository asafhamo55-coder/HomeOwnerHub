import type { RecurringEvent } from '@/lib/events'

// Date helpers for the events pages. Event dates are calendar dates
// (YYYY-MM-DD) and the alert cron runs in UTC, so everything here is UTC.

export function todayIsoUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function daysUntilDate(yyyyMmDd: string): number {
  const target = new Date(`${yyyyMmDd}T00:00:00Z`).getTime()
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - todayUtc) / (24 * 60 * 60 * 1000))
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

function addDays(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
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
 */
export function alertState(event: RecurringEvent, today = todayIsoUtc()): AlertState {
  if (!event.is_active) return { kind: 'paused' }
  if (event.last_alert_sent_for === event.event_date) {
    return { kind: 'sent', on: event.last_alert_sent_at ? event.last_alert_sent_at.slice(0, 10) : null }
  }
  if (event.event_date < today) return { kind: 'none' }
  const on = addDays(event.event_date, -event.alert_days_before)
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
