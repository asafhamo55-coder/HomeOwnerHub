// Resident ledger (backlog BL-010): every charge and payment on the units a
// resident is linked to, with a running balance.
//
// No 'use server' and no Next imports: the page calls it with the actor's
// client, and tests/integration/security/resident-ledger-rls.test.ts calls
// it with a real resident JWT client to prove RLS (migration 0061,
// auth_resident_unit_ids) — not the unit filter here — is what keeps a
// neighbour's rows out. The unit filter is a narrowing, never the boundary.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { chargeTypeLabel } from './assessment-labels'
import { DEFAULT_ASSOCIATION_TIME_ZONE, dayOf } from './association-time'

export interface LedgerAssessment {
  id: string
  unit_id: string
  amount: number
  due_date: string
  status: string
  assessment_type: string
  memo_code: string | null
}

export interface LedgerPayment {
  id: string
  unit_id: string | null
  assessment_id: string | null
  amount: number
  paid_at: string
  payment_method: string
}

export interface LedgerEntry {
  id: string
  /** yyyy-mm-dd: the due date for a charge, the paid date for a payment. */
  date: string
  kind: 'charge' | 'payment' | 'credit'
  description: string
  unitId: string | null
  /** Amount added to the balance. */
  charge: number | null
  /** Amount taken off the balance (payment or credit). */
  payment: number | null
  /** Balance after this entry. Negative is a credit in the owner's favour. */
  balance: number
}

export interface LedgerTotals {
  charges: number
  payments: number
  credits: number
  balance: number
}

export interface Ledger {
  entries: LedgerEntry[]
  totals: LedgerTotals
}

const METHOD_LABELS: Record<string, string> = {
  zelle_assisted: 'Zelle',
  ach: 'Bank transfer',
  card: 'Card',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  check: 'Check',
  cash: 'Cash',
}

/** A charge that is closed but was never paid in full gets this credit for the rest. */
const CLOSED_LABELS: Record<string, string> = {
  waived: 'Waived',
  written_off: 'Written off',
  paid: 'Adjustment',
}

const cents = (n: number) => Math.round(Number(n) * 100)
const dollars = (c: number) => c / 100

/**
 * Bank-matched payments (bank-rec, W18) stored their date-only posted_date
 * as UTC midnight until BL-043 (now noon UTC). That value is a calendar
 * date, not an instant — read in Eastern it would be the evening before —
 * so exact UTC midnight is taken at its face date. Anything else is an
 * instant, dated in the association's zone.
 */
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?(?:Z|[+-]00(?::?00)?)$/

export function paymentDay(paidAt: string, timeZone: string): string {
  const legacy = UTC_MIDNIGHT.exec(paidAt)
  if (legacy) return legacy[1]!
  return dayOf(paidAt, timeZone) ?? paidAt.slice(0, 10)
}

const KIND_ORDER: Record<LedgerEntry['kind'], number> = { charge: 0, credit: 1, payment: 2 }

/**
 * `timeZone` is the association's (BL-043): a payment is dated by the day
 * it was made THERE. `paid_at.slice(0, 10)` was the UTC day, so a 10pm
 * Eastern payment posted to the next day.
 */
export function buildLedger(
  assessments: LedgerAssessment[],
  payments: LedgerPayment[],
  timeZone: string = DEFAULT_ASSOCIATION_TIME_ZONE,
): Ledger {
  const unitByAssessment = new Map(assessments.map((a) => [a.id, a.unit_id]))
  const paidCents = new Map<string, number>()
  for (const p of payments) {
    if (!p.assessment_id) continue
    paidCents.set(p.assessment_id, (paidCents.get(p.assessment_id) ?? 0) + cents(p.amount))
  }

  type Draft = Omit<LedgerEntry, 'balance' | 'charge' | 'payment'> & { chargeC: number; paymentC: number }
  const drafts: Draft[] = []

  for (const a of assessments) {
    const label = chargeTypeLabel(a.assessment_type)
    const amountC = cents(a.amount)
    drafts.push({
      id: a.id,
      date: a.due_date,
      kind: 'charge',
      description: label,
      unitId: a.unit_id,
      chargeC: amountC,
      paymentC: 0,
    })
    const closedLabel = CLOSED_LABELS[a.status]
    const remainingC = amountC - (paidCents.get(a.id) ?? 0)
    if (closedLabel && remainingC > 0) {
      drafts.push({
        id: `${a.id}:${a.status}`,
        date: a.due_date,
        kind: 'credit',
        description: `${closedLabel} · ${label}`,
        unitId: a.unit_id,
        chargeC: 0,
        paymentC: remainingC,
      })
    }
  }

  for (const p of payments) {
    const method = METHOD_LABELS[p.payment_method]
    drafts.push({
      id: p.id,
      date: paymentDay(p.paid_at, timeZone),
      kind: 'payment',
      description: method ? `Payment · ${method}` : 'Payment',
      unitId: p.unit_id ?? (p.assessment_id ? unitByAssessment.get(p.assessment_id) ?? null : null),
      chargeC: 0,
      paymentC: cents(p.amount),
    })
  }

  drafts.sort(
    (x, y) =>
      (x.date < y.date ? -1 : x.date > y.date ? 1 : 0) ||
      KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  )

  let balanceC = 0
  const totalsC = { charges: 0, payments: 0, credits: 0 }
  const entries: LedgerEntry[] = drafts.map(({ chargeC, paymentC, ...d }) => {
    balanceC += chargeC - paymentC
    totalsC.charges += chargeC
    if (d.kind === 'payment') totalsC.payments += paymentC
    if (d.kind === 'credit') totalsC.credits += paymentC
    return {
      ...d,
      charge: d.kind === 'charge' ? dollars(chargeC) : null,
      payment: d.kind === 'charge' ? null : dollars(paymentC),
      balance: dollars(balanceC),
    }
  })

  return {
    entries,
    totals: {
      charges: dollars(totalsC.charges),
      payments: dollars(totalsC.payments),
      credits: dollars(totalsC.credits),
      balance: dollars(balanceC),
    },
  }
}

// ─── statement period ───────────────────────────────────────────────

export interface StatementWindow {
  /** Balance carried forward from everything dated before `from`. */
  openingBalance: number
  /** Entries dated on or after `from`, oldest first, running balance intact. */
  entries: LedgerEntry[]
  closingBalance: number
  totals: Omit<LedgerTotals, 'balance'>
}

/** Narrow a ledger to a statement period without losing the true balance. */
export function statementWindow(ledger: Ledger, from: string): StatementWindow {
  const entries = ledger.entries.filter((e) => e.date >= from)
  const before = ledger.entries.filter((e) => e.date < from)
  const openingBalance = before.length > 0 ? before[before.length - 1]!.balance : 0
  const sum = (kind: LedgerEntry['kind'], field: 'charge' | 'payment') =>
    dollars(entries.filter((e) => e.kind === kind).reduce((t, e) => t + cents(e[field] ?? 0), 0))
  return {
    openingBalance,
    entries,
    closingBalance: ledger.totals.balance,
    totals: { charges: sum('charge', 'charge'), payments: sum('payment', 'payment'), credits: sum('credit', 'payment') },
  }
}

// ─── read ───────────────────────────────────────────────────────────

/**
 * A resident's whole history is a few hundred rows at most. This MUST NOT
 * exceed PostgREST's max_rows (1000): the server returns at most that many
 * whatever `.limit()` asks for, so at 2000 the `truncated` check below could
 * never fire and a capped ledger read as complete (BL-047).
 */
const MAX_ROWS = 1000

export type LedgerRowsResult =
  | { ok: true; assessments: LedgerAssessment[]; payments: LedgerPayment[]; truncated: boolean }
  | { ok: false }

/**
 * Every non-deleted assessment on `unitIds` and every payment on those units
 * or against those assessments, read through `db` — so RLS decides what the
 * caller may see. A failed read is `{ ok: false }`, never an empty ledger.
 */
export async function loadLedgerRows(
  db: SupabaseClient<Database>,
  unitIds: string[],
  /** Impersonation org: the service-role client has no RLS, so confine
   *  every read to it. Null/omitted for an RLS-bound client. */
  orgId: string | null = null,
): Promise<LedgerRowsResult> {
  if (unitIds.length === 0) return { ok: true, assessments: [], payments: [], truncated: false }

  let aQuery = db
    .from('assessments')
    .select('id, unit_id, amount, due_date, status, assessment_type, memo_code')
    .in('unit_id', unitIds)
    .is('deleted_at', null)
  if (orgId) aQuery = aQuery.eq('organization_id', orgId)
  const { data: aRows, error: aErr } = await aQuery
    .order('due_date', { ascending: true })
    .limit(MAX_ROWS)
  if (aErr) return { ok: false }
  const assessments = (aRows ?? []).map((a) => ({ ...a, amount: Number(a.amount) }))

  const ids = assessments.map((a) => a.id)
  const filters = [`unit_id.in.(${unitIds.join(',')})`]
  if (ids.length > 0) filters.push(`assessment_id.in.(${ids.join(',')})`)
  let pQuery = db
    .from('payments')
    .select('id, unit_id, assessment_id, amount, paid_at, payment_method')
    .or(filters.join(','))
  if (orgId) pQuery = pQuery.eq('organization_id', orgId)
  const { data: pRows, error: pErr } = await pQuery
    .order('paid_at', { ascending: true })
    .limit(MAX_ROWS)
  if (pErr) return { ok: false }
  const payments = (pRows ?? []).map((p) => ({ ...p, amount: Number(p.amount) }))

  return {
    ok: true,
    assessments,
    payments,
    truncated: assessments.length >= MAX_ROWS || payments.length >= MAX_ROWS,
  }
}
