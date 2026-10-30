// Pure helpers for the board's tickets list: age, the summary strip and the
// search term. No server imports, so a 'use client' file may use it too.
// (tickets.ts is a 'use server' file and can export only async functions.)

import { calendarDaysBetween, dayOf, todayIn } from './association-time'

/** Whole calendar days since `iso`, in the association's timezone. Null when the date is unusable. */
export function ticketAgeDays(iso: string, timeZone: string, now: Date = new Date()): number | null {
  const day = dayOf(iso, timeZone)
  if (!day) return null
  const days = calendarDaysBetween(day, todayIn(timeZone, now))
  return Number.isNaN(days) ? null : Math.max(days, 0)
}

/** "Today", "1 day", "3 days". */
export function formatTicketAge(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

/** Days the oldest still-open ticket has waited. Null when none are open. */
export function oldestOpenDays(createdAts: readonly string[], timeZone: string, now: Date = new Date()): number | null {
  let oldest: number | null = null
  for (const iso of createdAts) {
    const d = ticketAgeDays(iso, timeZone, now)
    if (d !== null && (oldest === null || d > oldest)) oldest = d
  }
  return oldest
}

export interface TicketSummary {
  needsAttention: number
  oldestOpenDays: number | null
  /** Open tickets with no action item that names an assignee. */
  unassigned: number
}

/**
 * The three strip counts from the open tickets (open and in progress) and the
 * ids of tickets that already have an assigned action item.
 */
export function summarizeTickets(
  open: readonly { id: string; created_at: string }[],
  assignedTicketIds: Iterable<string>,
  timeZone: string,
  now: Date = new Date(),
): TicketSummary {
  const assigned = new Set(assignedTicketIds)
  return {
    needsAttention: open.length,
    oldestOpenDays: oldestOpenDays(
      open.map((t) => t.created_at),
      timeZone,
      now,
    ),
    unassigned: open.filter((t) => !assigned.has(t.id)).length,
  }
}

/**
 * Cleans a typed search term for a PostgREST `.or()` ILIKE: escapes the LIKE
 * wildcards and drops the characters that would break the filter syntax.
 * Returns null for an empty term.
 */
export function ticketSearchPattern(raw: string | undefined): string | null {
  const term = (raw ?? '')
    .replace(/[,()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (!term) return null
  return `%${term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}
