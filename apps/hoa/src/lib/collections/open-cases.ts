import { calendarDaysBetween } from '@/lib/association-time'
import { clockStartOf, type MailRecord } from './mail-tracking'
import type { CollectionEventType, CollectionStatus } from './statuses'

/**
 * Pure shaping for the board's open-cases overview. No Supabase, no React:
 * the loader (queries.ts listOpenCases) feeds it rows, and the tests feed it
 * literals. Days are whole calendar days between 'YYYY-MM-DD' strings, so a
 * daylight-saving change cannot add or drop a day.
 */

export interface OpenCaseRow {
  caseId: string
  unitId: string
  /** The property to link to; the unit id when the unit is not bridged (the page resolves either). */
  linkId: string
  unitLabel: string
  status: CollectionStatus
  attorneyFirm: string | null
  openedOn: string
  lastEventOn: string | null
  lastEventType: CollectionEventType | null
  /** Newest statutory delivery date (M7_APPLIED only), else null. */
  mailDeliveredOn: string | null
  /** Calendar days since the case opened. */
  daysOpen: number
  /** Calendar days since the last event, or since opening when there is none. */
  daysSinceLastEvent: number
  /** Calendar days since the statutory delivery, or null. */
  mailClockDay: number | null
}

export type OpenCaseInput = Omit<OpenCaseRow, 'daysOpen' | 'daysSinceLastEvent' | 'mailClockDay'>

const clamp = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0)

export function withDays(input: OpenCaseInput, today: string): OpenCaseRow {
  return {
    ...input,
    daysOpen: clamp(calendarDaysBetween(input.openedOn, today)),
    daysSinceLastEvent: clamp(calendarDaysBetween(input.lastEventOn ?? input.openedOn, today)),
    mailClockDay: input.mailDeliveredOn ? clamp(calendarDaysBetween(input.mailDeliveredOn, today)) : null,
  }
}

/** Longest since the last event first; ties go to the older case, then the unit label. */
export function sortOpenCases(rows: readonly OpenCaseRow[]): OpenCaseRow[] {
  return [...rows].sort(
    (a, b) =>
      b.daysSinceLastEvent - a.daysSinceLastEvent ||
      b.daysOpen - a.daysOpen ||
      a.unitLabel.localeCompare(b.unitLabel, 'en', { numeric: true }),
  )
}

/** The newest statutory delivery day among a case's events, or null. */
export function latestMailDelivery(events: ReadonlyArray<MailRecord>): string | null {
  let best: string | null = null
  for (const e of events) {
    const d = clockStartOf(e)
    if (d && (best === null || d > best)) best = d
  }
  return best
}
