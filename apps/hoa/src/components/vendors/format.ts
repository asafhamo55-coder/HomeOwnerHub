// Shared formatting for the vendor + RFP pages.

const USD0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** "$38,500"; null for a missing amount. */
export function usd(v: number | null | undefined): string | null {
  return v == null ? null : USD0.format(v)
}

/** "$30,000–$45,000", "up to $45,000", "from $30,000", or null. */
export function formatBudget(min: number | null, max: number | null): string | null {
  if (min && max) return `${USD0.format(min)}–${USD0.format(max)}`
  if (max) return `up to ${USD0.format(max)}`
  if (min) return `from ${USD0.format(min)}`
  return null
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const DAY_UTC = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A timestamp as "Oct 15, 2026". */
export function shortDate(iso: string | null | undefined): string | null {
  return iso ? DAY.format(new Date(iso)) : null
}

/** A DATE column ("2026-10-27") as "Oct 27, 2026" without a timezone shift. */
export function dateOnly(d: string | null | undefined): string | null {
  return d ? DAY_UTC.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : null
}

/** Whole days from today to a DATE column (negative = past). */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const target = Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}

/** Humanise a trade slug: "pest_control" → "Pest control". */
export function tradeLabel(t: string): string {
  const s = t.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function tradesLabel(trades: string[] | null | undefined): string | null {
  return trades && trades.length > 0 ? trades.map(tradeLabel).join(', ') : null
}
