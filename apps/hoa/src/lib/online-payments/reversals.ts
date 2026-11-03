/**
 * BL-035 PR 6 (M8_APPLIED): Stripe Connect event handlers for failed bank
 * payments, refunds and disputes. NOT a 'use server' file and no Next imports:
 * the webhook route (owned elsewhere) calls `handleReversalEvent` after it has
 * verified the signature and deduped the event id. The route needs exactly one
 * line: `if (isReversalEvent(event.type)) return handleReversalEvent(event, reversalDeps())`.
 *
 * Everything outside this file is behind two small interfaces (ReversalStore,
 * ReversalNotifier) so tests run with fakes and nothing here calls Stripe.
 *
 * Safety rules, all from the design doc section 3.6 and 3.7:
 *  - The money safety is the database: reverse_online_payment is idempotent per
 *    (attempt, kind, stripe ref), so a replayed event returns already_applied.
 *  - An event whose connected account differs from the attempt's is rejected.
 *  - A failure event that is older than the posting is stale and is ignored,
 *    so a late "failed" from an earlier try can never undo a good payment.
 *  - Returned fee: only the board's own setting, capped at $30 (decision 5).
 *  - Notices are best effort and never make the webhook fail; they go through
 *    the guarded sender in the real notifier.
 */

import { effectiveReturnedFeeCents, isFullRefund, ledgerCentsForStripeRefund } from './reversal-rules'
import {
  boardBankPaymentReturned,
  boardDisputeLost,
  boardDisputeOpened,
  boardDisputeWon,
  boardRefundDone,
  residentBankPaymentFailed,
  residentRefund,
  type Notice,
} from './reversal-notices'

export const REVERSAL_EVENT_TYPES = [
  'payment_intent.payment_failed',
  'charge.refunded',
  // A refund that was waiting on Stripe (requires_action, or a pending bank refund) finishes later.
  'refund.updated',
  'charge.refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const
export type ReversalEventType = (typeof REVERSAL_EVENT_TYPES)[number]

export function isReversalEvent(type: string): type is ReversalEventType {
  return (REVERSAL_EVENT_TYPES as readonly string[]).includes(type)
}

/** The few fields of a Stripe Connect event this file reads. */
export interface ConnectEventLike {
  id: string
  type: string
  /** The connected account the event happened on. */
  account?: string | null
  /** Unix seconds. */
  created: number
  data: { object: Record<string, unknown> }
}

export type AttemptStatus =
  | 'created' | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  | 'partially_refunded' | 'refunded' | 'disputed' | 'dispute_lost'

export interface AttemptView {
  id: string
  organizationId: string
  associationId: string
  unitId: string
  /** The person who paid; null if unknown. */
  payerUserId: string | null
  methodType: 'ach' | 'card'
  status: AttemptStatus
  stripeAccountId: string
  totalCents: number
  duesCents: number
  feeCents: number
  feePayer: 'association' | 'homeowner'
  /** ISO time the payment posted to the ledger, null if it never did. */
  postedAt: string | null
  /** Dues posted by this attempt. */
  postedCents: number
  /** Dues already reversed (failed, refund, dispute_lost adjustments). */
  reversedCents: number
}

export type ReverseKind = 'failed' | 'refund' | 'dispute_lost' | 'dispute_won'

export interface ReverseOutcome {
  alreadyApplied: boolean
  status: string
  reversedCents: number
  shortCents: number
  returnedFeeCents: number
}

/** reverse_online_payment refused. `code` is the SQLSTATE: 55000 nothing left to reverse, 23514 too much. */
export class ReverseRefused extends Error {
  constructor(public readonly code: string) {
    super(`reverse_online_payment refused (${code})`)
    this.name = 'ReverseRefused'
  }
}

export interface ReversalStore {
  findAttempt(key: { paymentIntentId?: string; chargeId?: string }): Promise<AttemptView | null>
  /** association_stripe_accounts.returned_payment_fee_cents, null when unset. */
  returnedFeeSetting(associationId: string): Promise<number | null>
  /** Calls reverse_online_payment as the service role. Throws ReverseRefused on a database refusal. */
  reverse(args: {
    attemptId: string
    kind: ReverseKind
    ref: string
    cents?: number
    reason?: string
    returnedFeeCents?: number
    by?: string | null
  }): Promise<ReverseOutcome>
  /** Optional: flag a refund that Stripe has not finished (requires_action) so the board can see it is waiting. No ledger change. */
  noteRefundPending?(args: { attemptId: string; ref: string; cents: number; by: string }): Promise<void>
  /** succeeded or partially_refunded -> disputed. False when the status did not allow it. */
  markDisputed(attemptId: string): Promise<boolean>
}

export interface NoticeContext {
  associationName: string
  /** Where the resident pays. */
  payUrl: string
  /** Where the board reviews the home's account. */
  reviewUrl: string
}

export interface ReversalNotifier {
  /** Email the home's owners. Best effort; never throws. */
  resident(attempt: AttemptView, build: (ctx: NoticeContext) => Notice): Promise<void>
  /** Email and alert the board. Best effort; never throws. `kind` dedupes the in-app alert. */
  board(attempt: AttemptView, kind: string, build: (ctx: NoticeContext) => Notice): Promise<void>
}

export interface ReversalDeps {
  store: ReversalStore
  notifier: ReversalNotifier
  /**
   * Every refund on a charge, read from Stripe. Stripe's Charge object only
   * carries `refunds` when expanded and the charge.refunded event does not
   * expand it, so the handler asks. Required for production wiring; when
   * absent the handler uses the event's own list and FAILS (throws, so the
   * webhook answers 500 and Stripe redelivers) if the event has none.
   */
  listRefunds?: (stripeAccountId: string, chargeId: string) => Promise<Array<{ id: string; amountCents: number; status: string | null }>>
  log?: (msg: string, meta: Record<string, unknown>) => void
}

export type ReversalResult =
  | { outcome: 'applied' | 'already_applied' | 'ignored' | 'ignored_stale' | 'unhandled' }
  /** Attempt not found yet (race with creation). The route should answer 500 so Stripe retries. */
  | { outcome: 'retry' }
  /** The event's connected account is not the attempt's. The route should answer 400 and log the event id. */
  | { outcome: 'rejected_account' }

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** An id field that Stripe sends either as a string or as an expanded object. */
function idOf(v: unknown): string | null {
  return str(v) ?? str(rec(v).id)
}

function accountMatches(event: ConnectEventLike, attempt: AttemptView): boolean {
  return Boolean(event.account) && event.account === attempt.stripeAccountId
}

export async function handleReversalEvent(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  switch (event.type) {
    case 'payment_intent.payment_failed':
      return onPaymentFailed(event, deps)
    case 'charge.refunded':
      return onChargeRefunded(event, deps)
    case 'refund.updated':
    case 'charge.refund.updated':
      return onRefundUpdated(event, deps)
    case 'charge.dispute.created':
      return onDisputeCreated(event, deps)
    case 'charge.dispute.closed':
      return onDisputeClosed(event, deps)
    default:
      return { outcome: 'unhandled' }
  }
}

// ── failed bank payment ────────────────────────────────────────────────

async function onPaymentFailed(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  const pi = rec(event.data.object)
  const piId = str(pi.id)
  if (!piId) return { outcome: 'ignored' }
  const attempt = await deps.store.findAttempt({ paymentIntentId: piId })
  if (!attempt) return { outcome: 'retry' }
  if (!accountMatches(event, attempt)) return { outcome: 'rejected_account' }

  // A terminal state is never undone by a failure event.
  if (['failed', 'canceled', 'refunded', 'dispute_lost'].includes(attempt.status)) return { outcome: 'ignored' }

  const posted = attempt.postedAt !== null
  if (posted) {
    // Posted: only a bank debit coming back counts, and only if the event is
    // newer than the posting. A late "failed" from an earlier try (before the
    // payment succeeded) must not reverse good money.
    if (attempt.methodType !== 'ach') return { outcome: 'ignored' }
    if (event.created * 1000 < Date.parse(attempt.postedAt as string)) return { outcome: 'ignored_stale' }
  } else if (attempt.status === 'succeeded') {
    return { outcome: 'ignored' }
  }

  const feeSetting = posted ? await deps.store.returnedFeeSetting(attempt.associationId) : null
  const returnedFeeCents = effectiveReturnedFeeCents(feeSetting)
  const code = str(rec(pi.last_payment_error).code) ?? 'failed'

  const out = await reverseOrIgnore(deps, {
    attemptId: attempt.id,
    kind: 'failed',
    ref: `failed:${piId}`,
    reason: `Bank payment failed (${code})`,
    returnedFeeCents,
  })
  if (out.kind !== 'done') return { outcome: out.kind }
  if (out.result.alreadyApplied) return { outcome: 'already_applied' }

  const feeApplied = out.result.returnedFeeCents
  await deps.notifier.resident(attempt, (ctx) =>
    residentBankPaymentFailed({
      associationName: ctx.associationName,
      totalCents: attempt.totalCents,
      returnedFeeCents: feeApplied,
      afterPosting: posted,
      payUrl: ctx.payUrl,
    }),
  )
  if (posted) {
    await deps.notifier.board(attempt, 'online_payment_returned', (ctx) =>
      boardBankPaymentReturned({
        totalCents: attempt.totalCents,
        returnedFeeCents: feeApplied,
        shortCents: out.result.shortCents,
        reviewUrl: ctx.reviewUrl,
      }),
    )
  }
  return { outcome: 'applied' }
}

// ── refunds ────────────────────────────────────────────────────────────

async function onChargeRefunded(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  const charge = rec(event.data.object)
  const chargeId = str(charge.id)
  const piId = idOf(charge.payment_intent)
  if (!chargeId && !piId) return { outcome: 'ignored' }
  const attempt = await deps.store.findAttempt({ paymentIntentId: piId ?? undefined, chargeId: chargeId ?? undefined })
  if (!attempt) return { outcome: 'retry' }
  if (!accountMatches(event, attempt)) return { outcome: 'rejected_account' }
  if (attempt.postedAt === null) return { outcome: 'ignored' }

  // The refunds are NOT in the event (Stripe returns Charge.refunds only when
  // expanded), so read them from Stripe. A silent skip here would leave the
  // books showing money that went back to the payer, so fail loudly instead.
  let listed: Array<{ id: string | null; amount: number | null; status: string | null }>
  if (deps.listRefunds && chargeId && event.account) {
    listed = (await deps.listRefunds(event.account, chargeId)).map((r) => ({ id: r.id, amount: r.amountCents, status: r.status }))
  } else if (Array.isArray(rec(charge.refunds).data)) {
    listed = (rec(charge.refunds).data as unknown[]).map((r) => ({ id: str(rec(r).id), amount: int(rec(r).amount), status: str(rec(r).status) }))
  } else {
    throw new Error('charge.refunded: no way to read the refunds (event has none and no Stripe reader is wired)')
  }
  // Money came back on Stripe's side but no refund is listed: do not guess, retry.
  if (listed.length === 0 && (int(charge.amount_refunded) ?? 0) > 0) {
    throw new Error('charge.refunded: amount_refunded is positive but Stripe lists no refunds')
  }
  const refunds = listed
    .filter((r): r is { id: string; amount: number; status: string | null } => r.id !== null && r.amount !== null && r.amount > 0)
    .filter((r) => r.status === null || r.status === 'succeeded' || r.status === 'pending')
  if (refunds.length === 0) return { outcome: 'ignored' }

  let applied = false
  let current = attempt
  for (const refund of refunds) {
    const cents = ledgerCentsForStripeRefund(refund.amount, current.postedCents, current.reversedCents)
    if (cents <= 0) continue // already fully reversed, or only a homeowner-paid fee was refunded
    const out = await reverseOrIgnore(deps, {
      attemptId: attempt.id,
      kind: 'refund',
      ref: refund.id,
      cents,
      reason: 'Refund',
    })
    if (out.kind !== 'done') continue
    if (out.result.alreadyApplied) {
      // The board's own refund recorded this one already; carry on with fresh totals.
      current = { ...current, reversedCents: current.reversedCents + cents }
      continue
    }
    applied = true
    const full = isFullRefund({ refundCents: cents, postedCents: current.postedCents, reversedCents: current.reversedCents })
    current = { ...current, reversedCents: current.reversedCents + out.result.reversedCents }
    await notifyRefund(deps, attempt, out.result.reversedCents, full, out.result.shortCents)
  }
  return { outcome: applied ? 'applied' : 'already_applied' }
}

/**
 * One refund object changed state. Only a move to `succeeded` reaches the books, through the same
 * reverse call (and so the same per-refund-id idempotency) as charge.refunded and the board's own
 * refund. TODO(migration): a `failed` transition after the books took a pending refund needs a
 * refund_failed kind in reverse_online_payment; until then it is only ignored here.
 */
async function onRefundUpdated(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  const refund = rec(event.data.object)
  const refundId = str(refund.id)
  const amount = int(refund.amount)
  const piId = idOf(refund.payment_intent)
  const chargeId = idOf(refund.charge)
  if (!refundId || amount === null || amount <= 0 || (!piId && !chargeId)) return { outcome: 'ignored' }
  if (str(refund.status) !== 'succeeded') return { outcome: 'ignored' }
  const attempt = await deps.store.findAttempt({ paymentIntentId: piId ?? undefined, chargeId: chargeId ?? undefined })
  if (!attempt) return { outcome: 'retry' }
  if (!accountMatches(event, attempt)) return { outcome: 'rejected_account' }
  if (attempt.postedAt === null) return { outcome: 'ignored' }

  const cents = ledgerCentsForStripeRefund(amount, attempt.postedCents, attempt.reversedCents)
  if (cents <= 0) return { outcome: 'already_applied' }
  const out = await reverseOrIgnore(deps, { attemptId: attempt.id, kind: 'refund', ref: refundId, cents, reason: 'Refund' })
  if (out.kind !== 'done') return { outcome: out.kind }
  if (out.result.alreadyApplied) return { outcome: 'already_applied' }
  const full = isFullRefund({ refundCents: cents, postedCents: attempt.postedCents, reversedCents: attempt.reversedCents })
  await notifyRefund(deps, attempt, out.result.reversedCents, full, out.result.shortCents)
  return { outcome: 'applied' }
}

/** Both notices for a refund that just reached the books. Shared with the board's own refund action. */
export async function notifyRefund(deps: ReversalDeps, attempt: AttemptView, refundedCents: number, full: boolean, shortCents: number): Promise<void> {
  await deps.notifier.resident(attempt, (ctx) => residentRefund({ associationName: ctx.associationName, refundedCents, full }))
  await deps.notifier.board(attempt, 'online_payment_refund', (ctx) =>
    boardRefundDone({ refundedCents, full, shortCents, reviewUrl: ctx.reviewUrl }),
  )
}

// ── disputes ───────────────────────────────────────────────────────────

async function disputeAttempt(event: ConnectEventLike, deps: ReversalDeps) {
  const d = rec(event.data.object)
  const piId = idOf(d.payment_intent)
  const chargeId = idOf(d.charge)
  const disputeId = str(d.id)
  if (!disputeId || (!piId && !chargeId)) return { kind: 'ignored' as const }
  const attempt = await deps.store.findAttempt({ paymentIntentId: piId ?? undefined, chargeId: chargeId ?? undefined })
  if (!attempt) return { kind: 'retry' as const }
  if (!accountMatches(event, attempt)) return { kind: 'rejected_account' as const }
  if (attempt.postedAt === null) return { kind: 'ignored' as const }
  return { kind: 'ok' as const, attempt, d, disputeId }
}

async function onDisputeCreated(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  const found = await disputeAttempt(event, deps)
  if (found.kind !== 'ok') return { outcome: found.kind }
  const { attempt, d } = found
  // Nothing is reversed yet. Replays are harmless: the status guard in the
  // store only moves succeeded or partially_refunded to disputed.
  const moved = await deps.store.markDisputed(attempt.id)
  if (!moved) return { outcome: 'already_applied' }

  const dueBy = int(rec(d.evidence_details).due_by)
  const dueByIso = dueBy ? new Date(dueBy * 1000).toISOString().slice(0, 10) : null
  const amount = int(d.amount) ?? attempt.totalCents
  const dashboard = 'https://dashboard.stripe.com/disputes'
  await deps.notifier.board(attempt, 'online_payment_dispute', () => boardDisputeOpened({ amountCents: amount, dueByIso, stripeUrl: dashboard }))
  return { outcome: 'applied' }
}

async function onDisputeClosed(event: ConnectEventLike, deps: ReversalDeps): Promise<ReversalResult> {
  const found = await disputeAttempt(event, deps)
  if (found.kind !== 'ok') return { outcome: found.kind }
  const { attempt, d, disputeId } = found
  const status = str(d.status)
  const amount = int(d.amount) ?? attempt.totalCents

  if (status === 'lost') {
    const out = await reverseOrIgnore(deps, { attemptId: attempt.id, kind: 'dispute_lost', ref: disputeId, reason: 'Dispute lost' })
    if (out.kind !== 'done') return { outcome: out.kind }
    if (out.result.alreadyApplied) return { outcome: 'already_applied' }
    await deps.notifier.board(attempt, 'online_payment_dispute_lost', (ctx) =>
      boardDisputeLost({ amountCents: amount, shortCents: out.result.shortCents, reviewUrl: ctx.reviewUrl }),
    )
    return { outcome: 'applied' }
  }
  if (status === 'won' || status === 'warning_closed') {
    const out = await reverseOrIgnore(deps, { attemptId: attempt.id, kind: 'dispute_won', ref: disputeId, reason: 'Dispute won' })
    if (out.kind !== 'done') return { outcome: out.kind }
    if (out.result.alreadyApplied) return { outcome: 'already_applied' }
    await deps.notifier.board(attempt, 'online_payment_dispute_won', () => boardDisputeWon({ amountCents: amount }))
    return { outcome: 'applied' }
  }
  return { outcome: 'ignored' }
}

// ── shared ─────────────────────────────────────────────────────────────

type ReverseArgs = Parameters<ReversalStore['reverse']>[0]

/**
 * 55000 (nothing left to reverse, or wrong state) and 23514 (more than is
 * left) mean the books already reflect this event or cannot take it: log the
 * ids and move on instead of failing the webhook forever. Any other error
 * throws so Stripe redelivers.
 */
async function reverseOrIgnore(
  deps: ReversalDeps,
  args: ReverseArgs,
): Promise<{ kind: 'done'; result: ReverseOutcome } | { kind: 'ignored' }> {
  try {
    return { kind: 'done', result: await deps.store.reverse(args) }
  } catch (err) {
    if (err instanceof ReverseRefused && (err.code === '55000' || err.code === '23514')) {
      deps.log?.('[online-payments] reversal not applied', { attemptId: args.attemptId, kind: args.kind, code: err.code })
      return { kind: 'ignored' }
    }
    throw err
  }
}
