/**
 * Delinquency summary for the board packet: every charge that was unpaid
 * past its due date at a point in time, grouped by unit, with aging
 * buckets.
 *
 * The point in time is the START of `asOf` — for the packet, the morning
 * after the packet month closes (BL-051), not today. So a charge due on or
 * after `asOf` is left out, and a payment the association received on or
 * after `asOf` (its calendar day, BL-043) had not happened yet and does not
 * reduce the balance. A charge marked paid since then still shows what it
 * owed at the time.
 *
 * Pure — the rows come from `loadDelinquency` (queries.ts), which reads
 * EVERY candidate charge rather than a page of them (UX decision 11: a
 * headline summed from a truncated list undercounts with no sign it has).
 */
import { calendarDaysBetween, dayOf } from '@/lib/association-time'

export interface OverdueChargeRow {
  amount: number | string
  due_date: string
  unit_id: string | null
  /** 'open' | 'partial' | 'paid' (waived and written-off charges are not read). */
  status: string
  /** `paid_at` is an instant; which day it falls on is the association's. */
  payments: { amount: number | string; paid_at: string | null }[] | null
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
 * What `r` still owed at the start of `asOf`.
 *
 * Open/partial: the amount less every payment made before `asOf`.
 * Paid: exactly what was paid on or after `asOf` (capped at the amount).
 * A charge marked paid with no payment recorded (imported books settle old
 * charges that way) has no date to measure against, so it counts as
 * settled rather than as owing its full amount forever.
 */
function owedAt(r: OverdueChargeRow, asOf: string, timeZone: string): number {
  let before = 0
  let after = 0
  for (const p of r.payments ?? []) {
    const day = dayOf(p.paid_at, timeZone)
    // payments.paid_at is NOT NULL; an unparseable one counts as already paid.
    if (day !== null && day >= asOf) after += Number(p.amount)
    else before += Number(p.amount)
  }
  const amount = Number(r.amount)
  return r.status === 'paid' ? Math.min(amount, after) : amount - before
}

/**
 * `asOf` is 'YYYY-MM-DD', measured at the start of that day in `timeZone`.
 * A charge due ON `asOf` is not late (same boundary as /dues). Rows that
 * owed nothing then (remaining ≤ 0) are dropped.
 */
export function summarizeDelinquency(rows: OverdueChargeRow[], asOf: string, timeZone: string): DelinquencySummary {
  const aging: AgingBuckets = { d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  const byUnit = new Map<string, DelinquentUnit>()
  let totalOverdue = 0
  let chargeCount = 0

  rows.forEach((r, i) => {
    if (!(r.due_date < asOf)) return
    const remaining = owedAt(r, asOf, timeZone)
    if (!(remaining > 0.004)) return

    const days = calendarDaysBetween(r.due_date, asOf)
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
