// Resident payment receipt (round 11): one payment, shown to the owner it was
// credited to. It reads the same rows the ledger does (loadLedgerRows through
// the actor's client), so the receipt and the ledger cannot disagree. The
// board's emailed receipt shares receiptMethodLabel and balanceLabel with it.
//
// Scoping, in three layers:
//   1. RLS (0064 payments_select): the client only returns payments on the
//      resident's own unit(s) in their association.
//   2. loadLedgerRows filters by the resident's unit ids, as the ledger does.
//   3. Here, the payment must still sit on one of those units. A payment
//      outside them, a malformed id, or a failed read never yields data.
//
// Pure apart from the injected client: no Next imports, so tests drive it
// with a fake.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { receiptMethodLabel } from '@/lib/resident-notify/receipt-render'
import { chargeTypeLabel } from '@/lib/assessment-labels'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import {
  buildLedger,
  loadLedgerRows,
  loadUnappliedCredits,
  paymentDay,
  type LedgerAssessment,
  type LedgerPayment,
} from '@/lib/resident-ledger'
import { chargeWindow, scopeLedgerRows } from '@/lib/resident-sale-window'
import type { ResidentUnit } from '@/lib/resident'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isReceiptId(id: string): boolean {
  return UUID.test(id)
}

/** "A1B2C3D4": the first eight characters of the payment id. */
export function receiptNumber(paymentId: string): string {
  return paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

export interface ReceiptAllocation {
  label: string
  /** yyyy-mm-dd the charge was due. */
  dueDate: string
  /** The part of this payment applied to the charge. */
  applied: number
}

export interface ResidentReceipt {
  receiptNumber: string
  associationName: string | null
  /** yyyy-mm-dd, in the association's zone. */
  paidDay: string
  amount: number
  methodLabel: string
  propertyLabel: string | null
  allocations: ReceiptAllocation[]
  /** The part not applied to a charge: credit on the owner's account. */
  credit: number
  /** Account balance after this payment; null unless the ledger proves it. */
  balanceAfter: number | null
}

export type ResidentReceiptResult =
  | { status: 'ok'; receipt: ResidentReceipt }
  | { status: 'not_found' }
  | { status: 'failed' }

const cents = (n: number) => Math.round(Number(n) * 100)
const dollars = (c: number) => c / 100

function unitLabel(u: ResidentUnit | undefined): string | null {
  if (!u) return null
  return [u.unit_number, u.address].filter(Boolean).join(' · ') || null
}

export async function loadResidentReceipt(
  db: SupabaseClient<Database>,
  units: ResidentUnit[],
  paymentId: string,
  /** Impersonation org (service-role client, no RLS); null for an RLS-bound client. */
  orgId: string | null = null,
): Promise<ResidentReceiptResult> {
  if (!isReceiptId(paymentId) || units.length === 0) return { status: 'not_found' }
  const id = paymentId.toLowerCase()
  const unitIds = units.map((u) => u.unit_id)

  const rows = await loadLedgerRows(db, unitIds, orgId)
  if (!rows.ok) return { status: 'failed' }
  const zone = units.find((u) => u.association_time_zone)?.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const windowed = scopeLedgerRows(rows.assessments, rows.payments, chargeWindow(units), zone)

  // Layer 3: drop anything not on the resident's units, whatever the client returned.
  const unitSet = new Set(unitIds)
  const scoped = {
    assessments: windowed.assessments.filter((a) => unitSet.has(a.unit_id)),
    payments: [] as LedgerPayment[],
  }
  const assessmentById = new Map<string, LedgerAssessment>(scoped.assessments.map((a) => [a.id, a]))
  const unitOfPayment = (p: LedgerPayment): string | null =>
    p.unit_id ?? (p.assessment_id ? assessmentById.get(p.assessment_id)?.unit_id ?? null : null)
  scoped.payments = windowed.payments.filter((p) => {
    const u = unitOfPayment(p)
    return u != null && unitSet.has(u)
  })

  const payment = scoped.payments.find((p) => p.id.toLowerCase() === id)
  const unitId = payment ? unitOfPayment(payment) : null
  if (!payment || !unitId) return { status: 'not_found' }

  // Allocation: a payment carries one charge. Earlier payments on the same
  // charge (oldest first) use up its amount before this one does.
  const amountC = cents(payment.amount)
  const allocations: ReceiptAllocation[] = []
  let appliedC = 0
  const charge = payment.assessment_id ? assessmentById.get(payment.assessment_id) : undefined
  if (charge) {
    const order = (p: LedgerPayment) => `${p.paid_at}|${p.id}`
    const before = scoped.payments
      .filter((p) => p.assessment_id === charge.id && p.id !== payment.id && order(p) < order(payment))
      .reduce((t, p) => t + cents(p.amount), 0)
    appliedC = Math.max(0, Math.min(amountC, cents(charge.amount) - before))
    allocations.push({
      label: chargeTypeLabel(charge.assessment_type),
      dueDate: charge.due_date.slice(0, 10),
      applied: dollars(appliedC),
    })
  }

  // Balance after: only for a single home, a complete read and a ledger
  // entry for this very payment. Anything else is left out, not guessed.
  let balanceAfter: number | null = null
  if (units.length === 1 && !rows.truncated) {
    const credits = await loadUnappliedCredits(db, unitIds, orgId)
    if (credits.ok) {
      const ledger = buildLedger(scoped.assessments, scoped.payments, zone, credits.credits)
      balanceAfter = ledger.entries.find((e) => e.kind === 'payment' && e.id === payment.id)?.balance ?? null
    }
  }

  const unit = units.find((u) => u.unit_id === unitId)
  return {
    status: 'ok',
    receipt: {
      receiptNumber: receiptNumber(payment.id),
      associationName: unit?.association_name ?? units.find((u) => u.association_name)?.association_name ?? null,
      paidDay: paymentDay(payment.paid_at, zone),
      amount: payment.amount,
      methodLabel: receiptMethodLabel(payment.payment_method),
      propertyLabel: unitLabel(unit),
      allocations,
      credit: dollars(amountC - appliedC),
      balanceAfter,
    },
  }
}
