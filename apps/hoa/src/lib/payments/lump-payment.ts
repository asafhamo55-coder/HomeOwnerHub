/**
 * BL-163: the board's "Record a payment" split, as plain data. Pure and
 * browser-safe (the preview dialog imports the types), no I/O: the server
 * action loads the unit's open charges and the association's state, then
 * calls buildLumpPreview; the dialog shows the result before anything is
 * saved, and the action rebuilds it from fresh reads before it posts.
 */

import { chargeTypeLabel } from '@/lib/assessment-labels'
import {
  AMBIGUITY_TEXT,
  ASK_YOUR_ATTORNEY,
  GA_PAYMENT_ORDER_CITATION,
  GA_PAYMENT_ORDER_TIERS,
  allocatePayment,
  allocationMode,
  ambiguitiesIn,
  type AllocationMode,
  type AmbiguityCode,
  type OpenCharge,
  type PaymentTier,
} from '@/lib/collections/ga-payment-order'

/** audit_log.action for a recorded lump-sum payment. */
export const LUMP_PAYMENT_AUDIT_ACTION = 'payment.lump_recorded'

export interface LumpPreviewLine {
  chargeId: string
  label: string
  dueDate: string
  /** Statutory rank 1-4 (null when the split is oldest-due-first). */
  tier: PaymentTier | null
  /** The statute's words for that rank. */
  tierQuote: string | null
  ambiguity: AmbiguityCode | null
  appliedCents: number
  remainingAfterCents: number
}

export interface LumpPreview {
  mode: AllocationMode
  today: string
  totalCents: number
  appliedCents: number
  unappliedCents: number
  /** Everything due on or before today (GA) or still open (otherwise). */
  eligibleCents: number
  lines: LumpPreviewLine[]
  /** "Ask your attorney" notes, once each. */
  ambiguities: Array<{ code: AmbiguityCode; text: string; flag: typeof ASK_YOUR_ATTORNEY }>
  citation: { cite: string; quote: string } | null
}

/** What the board saw, sent back with the save so the server can tell nothing moved. */
export interface ExpectedSplit {
  chargeId: string
  cents: number
}

export function toCents(dollars: number): number {
  return Math.round(Number(dollars) * 100)
}

export function buildLumpPreview(input: {
  state: string | null | undefined
  today: string
  amountCents: number
  charges: readonly OpenCharge[]
}): LumpPreview {
  const mode = allocationMode(input.state, input.today)
  const alloc = allocatePayment({ amountCents: input.amountCents, charges: input.charges, mode, today: input.today })
  const byId = new Map(input.charges.map((c) => [c.id, c]))
  const eligibleCents = input.charges
    .filter((c) => c.remainingCents > 0 && (mode === 'oldest_first' || c.dueDate <= input.today))
    .reduce((s, c) => s + c.remainingCents, 0)
  return {
    mode,
    today: input.today,
    totalCents: alloc.totalCents,
    appliedCents: alloc.appliedCents,
    unappliedCents: alloc.unappliedCents,
    eligibleCents,
    lines: alloc.lines.map((l) => ({
      chargeId: l.chargeId,
      label: byId.get(l.chargeId)?.planInstallment ? 'Payment plan installment' : chargeTypeLabel(l.type),
      dueDate: l.dueDate,
      tier: mode === 'ga_statutory' ? l.tier : null,
      tierQuote: mode === 'ga_statutory' ? GA_PAYMENT_ORDER_TIERS[l.tier - 1]!.quote : null,
      ambiguity: mode === 'ga_statutory' ? l.ambiguity : null,
      appliedCents: l.appliedCents,
      remainingAfterCents: l.remainingAfterCents,
    })),
    ambiguities:
      mode === 'ga_statutory'
        ? ambiguitiesIn(alloc.lines).map((code) => ({ code, text: AMBIGUITY_TEXT[code], flag: ASK_YOUR_ATTORNEY }))
        : [],
    citation: mode === 'ga_statutory' ? { cite: GA_PAYMENT_ORDER_CITATION.cite, quote: GA_PAYMENT_ORDER_CITATION.quote } : null,
  }
}

export function expectedOf(preview: Pick<LumpPreview, 'lines'>): ExpectedSplit[] {
  return preview.lines.map((l) => ({ chargeId: l.chargeId, cents: l.appliedCents }))
}

/** True only when the board's split is exactly the split the server just computed. */
export function sameSplit(expected: readonly ExpectedSplit[], preview: Pick<LumpPreview, 'lines'>): boolean {
  const now = expectedOf(preview)
  return expected.length === now.length && expected.every((e, i) => e.chargeId === now[i]!.chargeId && e.cents === now[i]!.cents)
}

/** Parse a dollar amount the board typed: positive, at most two decimals, at most $1,000,000. Null when not. */
export function parseDollarsToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const cents = Math.round(Number(t) * 100)
  return cents > 0 && cents <= 100_000_000 ? cents : null
}
