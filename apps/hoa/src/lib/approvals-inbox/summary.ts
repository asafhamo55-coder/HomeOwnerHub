// The summary strip above the approvals tabs. Pure: it reads only what the
// page already loaded (the per-source sections), so it adds no query.

import { calendarDaysBetween, dayOf, todayIn } from '../association-time'
import type { ApprovalSource, InboxSection, SourceCounts } from './model'

/**
 * Sources whose proposals an AI drafted: the bank matcher (w18), the bill
 * reader (bill), Covenant Brain's violation letters (w3) and the ARC review
 * (arc). Collections letters are built in code, the opening-balance wizard
 * and the residents' requests are typed by people, so none of those count.
 */
export const AI_SOURCES: readonly ApprovalSource[] = ['w18', 'bill', 'w3', 'arc']

/**
 * Whole calendar days the oldest waiting item has waited, in the
 * association's timezone. Days are compared as dates, not hours, so a DST
 * weekend (a 23 or 25 hour day) never turns 3 days into 2 or 4. Vendors are
 * left out: their date is the last compliance review, not when they started
 * waiting. Null when no loaded item has a usable date.
 */
export function oldestWaitDays(sections: readonly InboxSection[], timeZone: string, now: Date = new Date()): number | null {
  const today = todayIn(timeZone, now)
  let oldest: string | null = null
  for (const s of sections) {
    if (!s.ok || s.source === 'vendor') continue
    for (const item of s.items) {
      const day = dayOf(item.createdAt, timeZone)
      if (day && (oldest === null || day < oldest)) oldest = day
    }
  }
  if (oldest === null) return null
  const days = calendarDaysBetween(oldest, today)
  return Number.isNaN(days) ? null : Math.max(days, 0)
}

/** Waiting items an AI drafted, out of all waiting. Null when any source failed to load. */
export function aiShare(counts: SourceCounts): { ai: number; total: number; percent: number } | null {
  let total = 0
  let ai = 0
  for (const [source, n] of Object.entries(counts) as [ApprovalSource, number | null][]) {
    if (n === null) return null
    total += n
    if (AI_SOURCES.includes(source)) ai += n
  }
  return { ai, total, percent: total === 0 ? 0 : Math.round((ai / total) * 100) }
}
