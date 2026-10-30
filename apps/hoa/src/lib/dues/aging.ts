import { calendarDaysBetween } from '@/lib/association-time'

/**
 * Dues aging: how long an owner's oldest unpaid charge has been past due.
 *
 * Days are whole calendar days between 'YYYY-MM-DD' strings, so a DST
 * weekend (a 23 or 25 hour day) never shifts a charge into the wrong
 * bucket. `today` must already be the association's today.
 */
export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
}

/** Bucket for a number of days past due. 0 or less is current. */
export function bucketForDaysPastDue(days: number): AgingBucket {
  if (!(days > 0)) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export interface AgingCharge {
  /** 'YYYY-MM-DD' */
  dueDate: string
  /** What is still owed on the charge. Zero or negative (credit) is ignored. */
  balance: number
}

/**
 * Bucket for a set of charges, by the oldest one still unpaid. Returns null
 * when nothing is owed (no charges, or only paid/credit), so a credit-only
 * unit is never listed as "Current".
 */
export function agingForCharges(
  charges: readonly AgingCharge[],
  today: string,
): { bucket: AgingBucket; daysPastDue: number } | null {
  let oldest: string | null = null
  for (const c of charges) {
    if (!(c.balance > 0)) continue
    if (oldest === null || c.dueDate < oldest) oldest = c.dueDate
  }
  if (oldest === null) return null
  const days = calendarDaysBetween(oldest, today)
  if (Number.isNaN(days)) return null
  return { bucket: bucketForDaysPastDue(days), daysPastDue: Math.max(days, 0) }
}

export interface AgingSummaryRow {
  count: number
  total: number
}

/** Count and dollar total per bucket; every bucket is present, even at zero. */
export function summarizeAging(
  items: readonly { bucket: AgingBucket; amount: number }[],
): Record<AgingBucket, AgingSummaryRow> {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b, { count: 0, total: 0 }])) as Record<
    AgingBucket,
    AgingSummaryRow
  >
  for (const i of items) {
    out[i.bucket].count += 1
    out[i.bucket].total = Math.round((out[i.bucket].total + i.amount) * 100) / 100
  }
  return out
}

/** The `?aging=` value, or null for "all" and anything unrecognised. */
export function parseAgingParam(raw: string | string[] | undefined): AgingBucket | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (AGING_BUCKETS as readonly string[]).includes(v ?? '') ? (v as AgingBucket) : null
}
