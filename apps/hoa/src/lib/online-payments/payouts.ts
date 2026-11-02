/**
 * PR 8 of the online dues design (docs/decisions/2026-10-31-online-dues-payments-design.md,
 * sections 1.4 and 3.8): Stripe payouts and the clearing-account reconciliation.
 *
 * Dark behind M8_APPLIED. Nothing here talks to Stripe or the database
 * directly: everything goes through the small `PayoutPorts` interface, so the
 * webhook route (owned elsewhere) registers one line and the unit tests use an
 * in-memory fake. The real adapter is payouts-store.ts.
 *
 * Books, per matched payout (all integer cents):
 *   debit  cash (bank deposit)                payout.amount
 *   debit  6150 merchant processing fees      fees the ASSOCIATION bore
 *   credit 1015 online payments clearing      payout.amount + those fees
 * Fees a homeowner paid ride inside the gross and are never expensed.
 * Cash is never recorded on the day of the payment, only when the deposit is
 * in the bank feed.
 */
import { M8_APPLIED } from '@homeowner-portal/db/m8'

export const PAYOUT_EVENT_TYPES = ['payout.paid', 'payout.failed'] as const

/** Bank line date window around Stripe's arrival_date (design 3.8 step 4). */
export const PAYOUT_MATCH_WINDOW_DAYS = 3
/** A paid payout with no bank line after this many business days is flagged. */
export const PAYOUT_UNMATCHED_BUSINESS_DAYS = 5
/** A non-zero clearing balance older than this many days is an alert. */
export const CLEARING_STALE_DAYS = 10

export interface StripePayoutObject {
  id: string
  /** Cents. */
  amount: number
  /** Unix seconds. */
  arrival_date: number
  status: string
}

export interface PayoutEventLike {
  type: string
  /** Connected account id (event.account). */
  account?: string | null
  data: { object: StripePayoutObject }
}

/** One balance transaction inside a payout, as the Stripe adapter reports it. */
export interface PayoutBalanceLine {
  type: string
  /** Charge id the line belongs to, null for payouts, adjustments and so on. */
  chargeId: string | null
  /** Stripe fee plus our application fee taken out of this line, cents. */
  feeCents: number
}

export interface PayoutRow {
  id: string
  organizationId: string
  associationId: string
  stripeAccountId: string
  stripePayoutId: string
  amountCents: number
  feeCents: number
  /** YYYY-MM-DD */
  arrivalDate: string
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'
  bankTransactionId: string | null
}

export interface BankLine {
  id: string
  /** Cents, positive for a deposit. */
  amountCents: number
  /** YYYY-MM-DD */
  postedDate: string
}

export interface PayoutPorts {
  resolveAssociation(stripeAccountId: string): Promise<{ associationId: string; organizationId: string } | null>
  /** Balance transactions of one payout, read from Stripe (faked in tests). */
  listPayoutBalanceLines(stripeAccountId: string, stripePayoutId: string): Promise<PayoutBalanceLine[]>
  /** fee_payer per charge id from online_payments. Unknown charges are absent. */
  feePayersByCharge(stripeAccountId: string, chargeIds: string[]): Promise<Map<string, 'association' | 'homeowner'>>
  /** Insert or update by (stripe_account_id, stripe_payout_id). Never clears a match. */
  upsertPayout(row: Omit<PayoutRow, 'id' | 'bankTransactionId'>): Promise<PayoutRow>
  /** Unmatched deposits on the association's bank accounts in [from, to]. */
  findBankCandidates(associationId: string, amountCents: number, from: string, to: string): Promise<BankLine[]>
  /** Atomic claim: true only for the caller that set bank_transaction_id from null. */
  claimPayout(payoutId: string, bankTransactionId: string): Promise<boolean>
  releasePayout(payoutId: string): Promise<void>
  /** Post the clearing entry and stamp the bank line, the payout and matched_at. */
  postMatch(args: {
    payout: PayoutRow
    bankTransactionId: string
    bankPostedDate: string
    clearingCents: number
    feeCents: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  listUnmatchedPaid(associationId: string): Promise<PayoutRow[]>
}

// ── pure helpers ───────────────────────────────────────────────────────

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)
}

export function dayDistance(a: string, b: string): number {
  return Math.abs(dayNumber(a) - dayNumber(b))
}

export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * 86_400_000).toISOString().slice(0, 10)
}

export function arrivalDateOf(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/** Business days (Mon to Fri) after `from`, up to and including `to`. */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0
  for (let d = dayNumber(from) + 1; d <= dayNumber(to); d++) {
    const dow = new Date(d * 86_400_000).getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/**
 * Fees the association bore inside a payout. A line with no known attempt is
 * counted as association-paid: the money really left the balance, and
 * expensing it is the honest default. Refund and payout lines carry no fee.
 */
export function associationBorneFeeCents(
  lines: PayoutBalanceLine[],
  payers: Map<string, 'association' | 'homeowner'>,
): number {
  let total = 0
  for (const l of lines) {
    if (l.type !== 'charge' && l.type !== 'payment') continue
    if (!Number.isInteger(l.feeCents) || l.feeCents <= 0) continue
    const payer = l.chargeId ? payers.get(l.chargeId) : undefined
    if (payer === 'homeowner') continue
    total += l.feeCents
  }
  return total
}

/**
 * The bank line for a payout: same amount to the cent, posted within the
 * window of the arrival date. Nearest date wins, then the earlier posting,
 * then the lower id, so the result never depends on read order.
 */
export function matchPayoutToBankLine(
  payout: Pick<PayoutRow, 'amountCents' | 'arrivalDate'>,
  candidates: BankLine[],
  windowDays: number = PAYOUT_MATCH_WINDOW_DAYS,
): BankLine | null {
  const fits = candidates.filter(
    (c) => c.amountCents === payout.amountCents && dayDistance(c.postedDate, payout.arrivalDate) <= windowDays,
  )
  if (fits.length === 0) return null
  fits.sort(
    (a, b) =>
      dayDistance(a.postedDate, payout.arrivalDate) - dayDistance(b.postedDate, payout.arrivalDate) ||
      a.postedDate.localeCompare(b.postedDate) ||
      a.id.localeCompare(b.id),
  )
  return fits[0]
}

/** Paid payouts with no bank line after 5 business days: "not found in your bank feed". */
export function payoutsMissingFromBank(payouts: PayoutRow[], today: string): PayoutRow[] {
  return payouts.filter(
    (p) =>
      p.status === 'paid' &&
      p.bankTransactionId === null &&
      businessDaysBetween(p.arrivalDate, today) > PAYOUT_UNMATCHED_BUSINESS_DAYS,
  )
}

/**
 * Clearing should drift to zero between payouts. Alert when a balance that is
 * not zero has been non-zero since more than 10 days before `today`.
 */
export function clearingIsStale(clearingBalanceCents: number, nonZeroSince: string | null, today: string): boolean {
  return clearingBalanceCents !== 0 && nonZeroSince !== null && dayDistance(nonZeroSince, today) > CLEARING_STALE_DAYS
}

// ── handlers ───────────────────────────────────────────────────────────

export type PayoutOutcome =
  | 'ignored_flag_off'
  | 'ignored_unknown_account'
  | 'ignored_event'
  | 'failed_recorded'
  | 'recorded_unmatched'
  | 'matched'
  | 'already_matched'

const STATUS: Record<string, PayoutRow['status']> = {
  pending: 'pending',
  in_transit: 'in_transit',
  paid: 'paid',
  failed: 'failed',
  canceled: 'canceled',
}

/**
 * Entry point for the Connect webhook: `payout.paid` and `payout.failed`.
 * Idempotent: a replay upserts the same row and, once matched, does nothing.
 * Throws on infrastructure errors so Stripe redelivers.
 */
export async function handlePayoutEvent(event: PayoutEventLike, ports: PayoutPorts): Promise<PayoutOutcome> {
  if (!M8_APPLIED) return 'ignored_flag_off'
  if (!(PAYOUT_EVENT_TYPES as readonly string[]).includes(event.type)) return 'ignored_event'
  if (!event.account) return 'ignored_unknown_account'
  const assoc = await ports.resolveAssociation(event.account)
  if (!assoc) return 'ignored_unknown_account'

  const obj = event.data.object
  const paid = event.type === 'payout.paid'
  const status = paid ? 'paid' : (STATUS[obj.status] ?? 'failed')
  if (!Number.isInteger(obj.amount) || obj.amount <= 0) return 'ignored_event'

  let feeCents = 0
  if (paid) {
    const lines = await ports.listPayoutBalanceLines(event.account, obj.id)
    const chargeIds = [...new Set(lines.map((l) => l.chargeId).filter((c): c is string => !!c))]
    const payers = chargeIds.length
      ? await ports.feePayersByCharge(event.account, chargeIds)
      : new Map<string, 'association' | 'homeowner'>()
    feeCents = associationBorneFeeCents(lines, payers)
  }

  const row = await ports.upsertPayout({
    organizationId: assoc.organizationId,
    associationId: assoc.associationId,
    stripeAccountId: event.account,
    stripePayoutId: obj.id,
    amountCents: obj.amount,
    feeCents,
    arrivalDate: arrivalDateOf(obj.arrival_date),
    status,
  })

  if (!paid) return 'failed_recorded'
  if (row.bankTransactionId) return 'already_matched'
  return matchOnePayout(row, ports)
}

/** Try to match one paid, unmatched payout to a bank line and post it. */
export async function matchOnePayout(payout: PayoutRow, ports: PayoutPorts): Promise<PayoutOutcome> {
  if (payout.status !== 'paid') return 'recorded_unmatched'
  if (payout.bankTransactionId) return 'already_matched'
  const candidates = await ports.findBankCandidates(
    payout.associationId,
    payout.amountCents,
    addDays(payout.arrivalDate, -PAYOUT_MATCH_WINDOW_DAYS),
    addDays(payout.arrivalDate, PAYOUT_MATCH_WINDOW_DAYS),
  )
  const line = matchPayoutToBankLine(payout, candidates)
  if (!line) return 'recorded_unmatched'

  if (!(await ports.claimPayout(payout.id, line.id))) return 'already_matched'
  const posted = await ports.postMatch({
    payout,
    bankTransactionId: line.id,
    bankPostedDate: line.postedDate,
    clearingCents: payout.amountCents + payout.feeCents,
    feeCents: payout.feeCents,
  })
  if (!posted.ok) {
    await ports.releasePayout(payout.id)
    throw new Error(`payout ${payout.id}: ${posted.error}`)
  }
  return 'matched'
}

/**
 * Retry every paid, unmatched payout of one association (a deposit that
 * posts later than the payout event). For the daily sweep or a board
 * "check again" button. Returns counts only.
 */
export async function matchPendingPayouts(
  associationId: string,
  ports: PayoutPorts,
): Promise<{ checked: number; matched: number }> {
  if (!M8_APPLIED) return { checked: 0, matched: 0 }
  const rows = await ports.listUnmatchedPaid(associationId)
  let matched = 0
  for (const row of rows) if ((await matchOnePayout(row, ports)) === 'matched') matched++
  return { checked: rows.length, matched }
}
