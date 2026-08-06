/**
 * Pure arithmetic for the dashboard's mail-triage card.
 *
 * Split out from triage.ts deliberately: the root vitest harness is
 * pure-modules-only (see vitest.config.ts), so keeping the date maths free
 * of Supabase is what makes it directly testable — the same reason
 * packages/workflows exports processReplyDrafterResponse separately from
 * its workflow wrapper.
 *
 * `now` is always injected rather than read from the clock inside these
 * functions, so tests pin a fixed instant instead of computing expectations
 * relative to a moving Date.now().
 */

const MS_PER_DAY = 86_400_000

/** The subset of an inbox_threads row this module needs. */
export interface ThreadRow {
  id: string
  subject: string | null
  last_message_at: string | null
}

export interface TriageThread {
  id: string
  subject: string | null
  lastMessageAt: string | null
  waitingDays: number
}

/**
 * Whole days a thread has been waiting, floored.
 *
 * Floored, not rounded: a thread sitting for 6 days 23 hours is "6 days" to
 * a board member, and rounding it to 7 would overstate every figure on the
 * card by up to a day. Clamped at 0 so a clock-skewed future timestamp
 * cannot render as a negative wait.
 */
export function waitingDays(lastMessageAt: string | null, now: Date): number {
  if (lastMessageAt === null) return 0
  const sent = new Date(lastMessageAt).getTime()
  if (Number.isNaN(sent)) return 0
  return Math.max(0, Math.floor((now.getTime() - sent) / MS_PER_DAY))
}

export function toTriageThreads(rows: ThreadRow[], now: Date): TriageThread[] {
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    lastMessageAt: row.last_message_at,
    waitingDays: waitingDays(row.last_message_at, now),
  }))
}

/** Threads waiting STRICTLY longer than `days`. */
export function countWaitingOver(rows: ThreadRow[], now: Date, days: number): number {
  return rows.filter((row) => waitingDays(row.last_message_at, now) > days).length
}
