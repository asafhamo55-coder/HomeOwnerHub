/**
 * One money and date vocabulary for the money pages (/dues, /accounting/**,
 * /settings/billing). Before this, 24 files each declared their own
 * `currency()` — some with cents, some without, on the same screen — and
 * formatted date-only columns with `format(new Date('2026-01-01'))`.
 *
 * That last one is a real bug, not style: `new Date('2026-01-01')` is
 * midnight UTC, which is still Dec 31 in every US time zone, so the
 * accounting overview labelled the 2026 fiscal year "Dec 2025 – Dec 2026"
 * for anyone west of Greenwich (and on any client-rendered component).
 * Date-only values are calendar dates, not instants: they are formatted
 * here from their Y-M-D parts, in UTC, so no zone can shift them.
 *
 * Timestamps (posted_at, approved_at) are instants and go through
 * `formatShortDate` in the association's zone instead.
 */
import { formatShortDate } from '@/lib/format-datetime'

const USD_CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * `$1,234.50`. Tables and ledgers always show cents (an accountant ties out
 * to the cent); `whole` is for headline KPIs and budgets, which are planned
 * in dollars. Negative amounts render as `-$1,234.50`.
 */
export function usd(n: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  // Avoid "-$0.00" from float dust like -0.0000001.
  const v = Math.abs(n) < 0.005 ? 0 : n
  return (opts.whole ? USD_WHOLE : USD_CENTS).format(v)
}

/** "+$12.00" / "-$12.00" / "$0.00" — for variances and net changes. */
export function usdSigned(n: number, opts: { whole?: boolean } = {}): string {
  const v = Math.abs(n) < 0.005 ? 0 : n
  if (v === 0) return usd(0, opts)
  return `${v > 0 ? '+' : '-'}${usd(Math.abs(v), opts)}`
}

/** Text tone for a signed amount where positive is good (variance, net). */
export function signTone(n: number): 'text-success' | 'text-danger' | 'text-foreground' {
  if (Math.abs(n) < 0.005) return 'text-foreground'
  return n > 0 ? 'text-success' : 'text-danger'
}

type DayStyle = 'medium' | 'short' | 'month' | 'monthShort' | 'year'

const DAY_FORMATS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  short: { month: 'short', day: 'numeric' },
  month: { month: 'long', year: 'numeric' },
  monthShort: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
}

/** Parse 'YYYY-MM-DD' (or the date part of a timestamp) into a UTC date. */
function dayToUtc(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

/** A calendar date ('2026-10-01') → "Oct 1, 2026". Zone-proof. */
export function formatDay(value: string | null | undefined, style: DayStyle = 'medium'): string {
  if (!value) return '—'
  const d = dayToUtc(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { ...DAY_FORMATS[style], timeZone: 'UTC' }).format(d)
}

/** "Jan 1 – Dec 31, 2026", or with both years when they differ. */
export function formatDayRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—'
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDay(start, sameYear ? 'short' : 'medium')} – ${formatDay(end)}`
}

/** A fiscal period's short name: "FY 2026" for a calendar year, else the range. */
export function periodLabel(p: { start_date: string; end_date: string }): string {
  if (p.start_date.endsWith('-01-01') && p.end_date.endsWith('-12-31') && p.start_date.slice(0, 4) === p.end_date.slice(0, 4)) {
    return `FY ${p.start_date.slice(0, 4)}`
  }
  return formatDayRange(p.start_date, p.end_date)
}

/** An instant (timestamptz) → "Oct 1, 2026" in the association's zone. */
export function formatStamp(value: string | null | undefined): string {
  return formatShortDate(value) || '—'
}

/** Today as 'YYYY-MM-DD' (UTC), for date-string comparisons. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Whole days from a calendar date to today (positive = in the past). */
export function daysSince(day: string, today: string = todayIso()): number {
  const a = dayToUtc(day)
  const b = dayToUtc(today)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** "1 entry" / "3 entries". */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : (many ?? `${one}s`)}`
}
