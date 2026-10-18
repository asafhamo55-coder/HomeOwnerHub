// What a buyer may see of a home's money (Properties P3, "record a sale").
//
// The balance stays with the lot: assessments and payments are keyed by
// unit and a sale does not touch them. But the seller's charges and
// payments are the seller's history, and the buyer must not see them in
// the portal (PayHOA: "the new owner cannot see the previous owner's
// history"; Buildium scopes the ledger to the ownership account).
//
// The boundary is the buyer's ownership valid_from — but ONLY for an
// ownership that began with a recorded sale (source 'sale'). Every other
// ownership (an import, a member invite, a manual entry) is dated by the
// day it was typed in, not the day the person bought the home, so using
// it would hide an existing owner's own open balance. Those keep the whole
// unit history, exactly as before.
//
// This is app-level narrowing. RLS (0061 auth_resident_unit_ids) still
// lets the buyer's JWT read every row on the unit; real enforcement needs
// a policy change (see docs/research/2026-10-properties-plan.md, P3).
//
// Pure: no Supabase, no Next. resident.ts sets `charges_from`, the
// dashboard / ledger readers apply it.

import { paymentDay } from './resident-ledger'

/** The first day a resident sees on each unit; units without one see everything. */
export type ChargeWindow = ReadonlyMap<string, string>

/** The window for an ownership row as read: its valid_from when it began with a sale. */
export function chargesFromForOwnership(o: { valid_from: string; source?: string | null }): string | null {
  return o.source === 'sale' ? o.valid_from.slice(0, 10) : null
}

export function chargeWindow(units: ReadonlyArray<{ unit_id: string; charges_from?: string | null }>): ChargeWindow {
  const out = new Map<string, string>()
  for (const u of units) if (u.charges_from) out.set(u.unit_id, u.charges_from)
  return out
}

/** Charges due on or after the unit's window start (or all, when it has none). */
export function scopeAssessments<T extends { unit_id: string; due_date: string }>(rows: readonly T[], window: ChargeWindow): T[] {
  if (window.size === 0) return [...rows]
  return rows.filter((a) => {
    const from = window.get(a.unit_id)
    return !from || a.due_date.slice(0, 10) >= from
  })
}

/**
 * Narrow ledger rows to the window. A payment against a charge follows
 * that charge (a buyer paying a pre-sale charge would see it, but such a
 * charge is never shown to them to pay); an unapplied payment is kept when
 * it was made on or after the window start, in the association's zone.
 */
export function scopeLedgerRows<
  A extends { id: string; unit_id: string; due_date: string },
  P extends { unit_id: string | null; assessment_id: string | null; paid_at: string },
>(assessments: readonly A[], payments: readonly P[], window: ChargeWindow, timeZone: string): { assessments: A[]; payments: P[] } {
  if (window.size === 0) return { assessments: [...assessments], payments: [...payments] }
  const kept = scopeAssessments(assessments, window)
  const keptIds = new Set(kept.map((a) => a.id))
  const unitOf = new Map(assessments.map((a) => [a.id, a.unit_id]))
  const visible = payments.filter((p) => {
    if (p.assessment_id && unitOf.has(p.assessment_id)) return keptIds.has(p.assessment_id)
    const unit = p.unit_id ?? null
    const from = unit ? window.get(unit) : undefined
    if (!unit) return false // can't place it on a unit: not shown inside a window
    return !from || paymentDay(p.paid_at, timeZone) >= from
  })
  return { assessments: kept, payments: visible }
}
