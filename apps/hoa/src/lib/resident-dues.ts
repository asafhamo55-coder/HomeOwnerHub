// The resident's outstanding-dues summary, as a pure function so its day
// boundary is testable with a fake clock (resident-dashboard.ts is a
// 'use server' module and can only export async functions).
//
// BL-043: "past due" is judged against the ASSOCIATION's today. It used to
// be `new Date().toISOString().slice(0, 10)` — the UTC day — so from ~8pm
// Eastern every charge due tomorrow already read "due today".

import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'

/** One outstanding charge on a resident's account, net of partial payments. */
export interface ResidentCharge {
  /** Assessment id. */
  id: string
  /** Owning unit id, so a multi-unit resident can tell charges apart. */
  unitId: string
  /** e.g. "regular", "special", "late_fee", "fine" — humanized in the UI. */
  assessmentType: string
  /** ISO yyyy-mm-dd. */
  dueDate: string
  /** Remaining owed on this charge, net of any partial payment. */
  amount: number
  /** Already past its due date as of today. */
  pastDue: boolean
  /** The charge's full amount before any partial payment (what W18 matches against). */
  fullAmount: number
  /** assessments.memo_code as stored; the Pay screen validates it before showing it. */
  memoCode: string | null
}

export interface ResidentDues {
  /** Total still owed across every owned unit (net of partial payments). */
  balance: number
  /** Number of unpaid/partially-paid assessments. */
  openCount: number
  /** How many of those are already past their due date. */
  pastDueCount: number
  /** Earliest upcoming/overdue due date, ISO yyyy-mm-dd, or null. */
  nextDueDate: string | null
  /** Every outstanding charge, most urgent first (past-due, oldest first). */
  charges: ResidentCharge[]
  /**
   * The association's today ('YYYY-MM-DD') that `pastDue` was judged
   * against. Due-date copy must use this same day, so the "N days late"
   * text and the past-due flag can never disagree.
   */
  today: string
}

export interface ResidentAssessmentRow {
  id: string
  unit_id: string
  amount: number
  due_date: string
  status: string
  assessment_type: string
  memo_code: string | null
}

/** The zone a resident's "today" is in: their first unit's association's. */
export function residentTimeZone(units: ReadonlyArray<{ association_time_zone?: string | null }>): string {
  return units.find((u) => u.association_time_zone)?.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE
}

export function emptyResidentDues(today: string): ResidentDues {
  return { balance: 0, openCount: 0, pastDueCount: 0, nextDueDate: null, charges: [], today }
}

/**
 * Sum open/partial assessments net of payments. A charge due on or before
 * `today` is past due (due today reads "due today").
 */
export function summarizeResidentDues(
  assessments: ResidentAssessmentRow[],
  paidByAssessment: ReadonlyMap<string, number>,
  today: string,
): ResidentDues {
  let balance = 0
  let openCount = 0
  let pastDueCount = 0
  let nextDueDate: string | null = null
  const charges: ResidentCharge[] = []

  for (const a of assessments) {
    const remaining = Number(a.amount) - (paidByAssessment.get(a.id) ?? 0)
    if (remaining <= 0) continue
    const pastDue = Boolean(a.due_date && a.due_date <= today)
    balance += remaining
    openCount++
    if (pastDue) pastDueCount++
    if (a.due_date && (nextDueDate === null || a.due_date < nextDueDate)) nextDueDate = a.due_date
    charges.push({
      id: a.id,
      unitId: a.unit_id,
      assessmentType: a.assessment_type,
      dueDate: a.due_date,
      amount: Math.round(remaining * 100) / 100,
      pastDue,
      fullAmount: Number(a.amount),
      memoCode: a.memo_code,
    })
  }

  // Most urgent first: past-due charges (oldest due date leading), then
  // upcoming charges ordered by due date.
  charges.sort((x, y) => {
    if (x.pastDue !== y.pastDue) return x.pastDue ? -1 : 1
    return x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0
  })

  return { balance: Math.round(balance * 100) / 100, openCount, pastDueCount, nextDueDate, charges, today }
}
