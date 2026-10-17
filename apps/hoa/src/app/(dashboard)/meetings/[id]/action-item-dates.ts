import { dateOnlyCompare } from '@/lib/association-time'

/**
 * An open or in-progress action item whose due date (a calendar date) is
 * before `today`, the association's today from the server (BL-065). Due
 * today is not overdue. Pure: no clock, no zone.
 */
export function isActionItemOverdue(
  item: { status: string; due_date: string | null },
  today: string,
): boolean {
  return (
    (item.status === 'open' || item.status === 'in_progress') &&
    item.due_date != null &&
    dateOnlyCompare(item.due_date, today) < 0
  )
}
