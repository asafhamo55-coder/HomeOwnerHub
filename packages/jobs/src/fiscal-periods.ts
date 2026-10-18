import { addCalendarDays } from './association-time'

/**
 * Which fiscal period is "current", and what "open next fiscal year" adds
 * (BL-076). Shared by apps/hoa and the jobs (recurring JEs), as
 * association-time.ts is: the jobs cannot import apps/hoa.
 *
 * The rule every caller follows: a period that has not started yet — by the
 * ASSOCIATION's today, never the server's or UTC's — is never current.
 * Before BL-076 a period could only exist once its year had begun, so
 * "the latest open period" was safe. Opening next year early makes it the
 * latest, and every "latest open" read would have started posting dues,
 * bills and recurring entries into a year that hasn't begun.
 *
 * All dates are 'YYYY-MM-DD' calendar days. Pure, except
 * readCurrentOpenPeriod, which takes the caller's client.
 */

export interface PeriodDates {
  start_date: string
  end_date: string
}

/** `day` plus `n` calendar months, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonthsIso(day: string, n: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = total - year * 12 // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const date = new Date(Date.UTC(year, month, Math.min(d, lastDay)))
  return date.toISOString().slice(0, 10)
}

/**
 * The current period on `today`: the one that contains today, else the
 * latest one that has already started (books whose current year is missing
 * still show their last year). A period starting after today is never
 * returned; with only future periods there is no current one.
 */
export function pickCurrentPeriod<T extends PeriodDates>(periods: readonly T[], today: string): T | null {
  const started = periods.filter((p) => p.start_date <= today)
  const containing = started.filter((p) => today <= p.end_date)
  const pool = containing.length > 0 ? containing : started
  return [...pool].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any }

export interface OpenPeriodRow {
  id: string
  start_date: string
  end_date: string
}

/**
 * The open period that new entries post into on `today` (the association's
 * day): the latest OPEN period that has started. Same shape as the
 * `{ data, error }` the callers' inline reads returned.
 */
export async function readCurrentOpenPeriod(
  client: AnyClient,
  associationId: string,
  today: string,
): Promise<{ data: OpenPeriodRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await client
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('association_id', associationId)
    .eq('status', 'open')
    .lte('start_date', today)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data: (data as OpenPeriodRow | null) ?? null, error: error ?? null }
}

/** Whole months a period spans (start → day after end), or null when it isn't a whole number of months. */
function spanMonths(p: PeriodDates): number | null {
  const after = addCalendarDays(p.end_date, 1)
  for (let k = 1; k <= 12; k++) if (addMonthsIso(p.start_date, k) === after) return k
  return null
}

/** At most this much of the calendar is added in one go: this fiscal year's missing part plus next year. */
const MAX_NEW_MONTHS = 24

export type NextFiscalYearPlan =
  | {
      ok: true
      /** Months per period: 12 (yearly), 3 (quarterly), 1 (monthly)... */
      months: number
      /** The fiscal year after the one containing today. */
      fiscalYear: PeriodDates
      /** Periods to add, oldest first; empty when next year is already open. */
      toCreate: PeriodDates[]
    }
  | { ok: false; reason: 'no_periods' | 'irregular' | 'too_far_behind' }

/**
 * What "Open next fiscal year" adds, following the books' own structure:
 * periods the length of the latest one (which must divide a year), on the
 * same fiscal-year start month — the latest period's start for yearly books,
 * the earliest period's start for monthly or quarterly ones.
 *
 * "Next" is relative to today, not to the latest period, so a second run
 * adds nothing. Any periods missing between the latest one and the end of
 * next year are added too, so the books never have a hole.
 */
export function planNextFiscalYear(periods: readonly PeriodDates[], today: string): NextFiscalYearPlan {
  if (periods.length === 0) return { ok: false, reason: 'no_periods' }
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const latest = sorted.reduce((a, b) => (b.end_date > a.end_date ? b : a))
  const months = spanMonths(latest)
  if (months === null || 12 % months !== 0) return { ok: false, reason: 'irregular' }

  // Fiscal years run anchor + 12k months.
  const anchor = months === 12 ? latest.start_date : sorted[0].start_date
  const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1
  let k = Math.floor((monthIndex(today) - monthIndex(anchor)) / 12)
  if (addMonthsIso(anchor, 12 * k) > today) k -= 1
  const currentStart = addMonthsIso(anchor, 12 * k)
  const nextStart = addMonthsIso(currentStart, 12)
  const nextEnd = addCalendarDays(addMonthsIso(currentStart, 24), -1)
  const fiscalYear = { start_date: nextStart, end_date: nextEnd }

  const have = new Set(periods.map((p) => `${p.start_date}|${p.end_date}`))
  const toCreate: PeriodDates[] = []
  let cursor = addCalendarDays(latest.end_date, 1)
  while (cursor <= nextEnd) {
    const end = addCalendarDays(addMonthsIso(cursor, months), -1)
    if (!have.has(`${cursor}|${end}`)) toCreate.push({ start_date: cursor, end_date: end })
    if (toCreate.length * months > MAX_NEW_MONTHS) return { ok: false, reason: 'too_far_behind' }
    cursor = addCalendarDays(end, 1)
  }
  return { ok: true, months, fiscalYear, toCreate }
}
