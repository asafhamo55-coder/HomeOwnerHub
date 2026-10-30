import { calendarDaysBetween } from '@/lib/association-time'

/**
 * The status pill for one row of the dues table. Pure, so the pill choice is
 * tested without rendering the page.
 *
 *   paid     success  settled
 *   credit   info     paid more than the charge (a credit sits on the account)
 *   late     danger   past its due date and still owed
 *   due      warning  owed, not yet late (including partly paid)
 *   waived   neutral  the board waived it
 *
 * `today` is the association's today, 'YYYY-MM-DD'. Days are whole calendar
 * days, so a DST weekend never shifts a charge across the late boundary.
 */
export type DuesRowKind = 'paid' | 'credit' | 'late' | 'due' | 'waived'
export type DuesRowTone = 'success' | 'info' | 'danger' | 'warning' | 'neutral'

export interface DuesRowInput {
  status: string
  amount: number
  paid: number
  dueDate: string
}

export interface DuesRowStatus {
  kind: DuesRowKind
  tone: DuesRowTone
  label: string
}

export function duesRowStatus(row: DuesRowInput, today: string): DuesRowStatus {
  if (row.status === 'waived') return { kind: 'waived', tone: 'neutral', label: 'Waived' }
  const partly = row.paid > 0 && row.paid < row.amount
  if (row.paid > row.amount) return { kind: 'credit', tone: 'info', label: 'Credit' }
  if (row.status === 'paid' || (row.amount > 0 && row.paid >= row.amount)) return { kind: 'paid', tone: 'success', label: 'Paid' }
  const late = calendarDaysBetween(row.dueDate, today)
  if (late > 0) {
    return { kind: 'late', tone: 'danger', label: `Late · ${late} ${late === 1 ? 'day' : 'days'}${partly ? ' · part paid' : ''}` }
  }
  return { kind: 'due', tone: 'warning', label: partly ? 'Due · part paid' : 'Due' }
}
