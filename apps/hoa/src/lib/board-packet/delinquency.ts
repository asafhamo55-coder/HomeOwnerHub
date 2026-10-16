/**
 * Delinquency summary for the board packet: every unpaid charge past its
 * due date, grouped by unit, with aging buckets.
 *
 * Pure — the rows come from `loadDelinquency` (queries.ts), which reads
 * EVERY overdue charge rather than a page of them (UX decision 11: a
 * headline summed from a truncated list undercounts with no sign it has).
 */
import { daysSince } from '@/lib/money/format'

export interface OverdueChargeRow {
  amount: number | string
  due_date: string
  unit_id: string | null
  payments: { amount: number | string }[] | null
  unit: { unit_number: string | null; address_line1: string | null } | null
}

export interface DelinquentUnit {
  /** unit id, or `charge:<n>` for a charge with no unit. */
  key: string
  label: string
  amount: number
  charges: number
  oldestDue: string
  daysOverdue: number
}

export interface AgingBuckets {
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
}

export interface DelinquencySummary {
  asOf: string
  totalOverdue: number
  unitCount: number
  chargeCount: number
  aging: AgingBuckets
  /** Largest balance first. */
  units: DelinquentUnit[]
}

/** Unit label for the board: "Unit 4B · 12 Demo Way", or a fallback. */
function unitLabel(u: OverdueChargeRow['unit']): string {
  const parts = [u?.unit_number, u?.address_line1].filter((p): p is string => Boolean(p && p.trim()))
  return parts.length > 0 ? parts.join(' · ') : 'Unit not recorded'
}

/**
 * `asOf` is 'YYYY-MM-DD'. A charge due ON `asOf` is not late (same
 * boundary as /dues). Fully paid rows (remaining ≤ 0) are dropped.
 */
export function summarizeDelinquency(rows: OverdueChargeRow[], asOf: string): DelinquencySummary {
  const aging: AgingBuckets = { d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  const byUnit = new Map<string, DelinquentUnit>()
  let totalOverdue = 0
  let chargeCount = 0

  rows.forEach((r, i) => {
    if (!(r.due_date < asOf)) return
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(r.amount) - paid
    if (!(remaining > 0.004)) return

    const days = daysSince(r.due_date, asOf)
    if (days <= 30) aging.d1_30 += remaining
    else if (days <= 60) aging.d31_60 += remaining
    else if (days <= 90) aging.d61_90 += remaining
    else aging.d90_plus += remaining

    totalOverdue += remaining
    chargeCount += 1

    const key = r.unit_id ?? `charge:${i}`
    const existing = byUnit.get(key)
    if (existing) {
      existing.amount += remaining
      existing.charges += 1
      if (r.due_date < existing.oldestDue) {
        existing.oldestDue = r.due_date
        existing.daysOverdue = days
      }
    } else {
      byUnit.set(key, { key, label: unitLabel(r.unit), amount: remaining, charges: 1, oldestDue: r.due_date, daysOverdue: days })
    }
  })

  const units = [...byUnit.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
  return { asOf, totalOverdue, unitCount: units.length, chargeCount, aging, units }
}
