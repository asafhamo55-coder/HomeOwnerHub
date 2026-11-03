/**
 * BL-036 autopay: the daily run. ONE function does the three jobs (cancel
 * enrollments whose owner moved out, send the 3-day notices, take the money)
 * and fans out inside itself, so the Inngest Hobby budget sees one execution
 * a day (design doc section 7).
 *
 * Orchestration only. Everything that touches the database is behind
 * AutopayStore and everything that touches Stripe behind AutopayChargePort, so
 * the tests run with in-memory fakes and nothing here can reach a live service.
 *
 * Logs: ids and counts only. Never an address, name or amount tied to a person.
 */

import {
  addDays,
  afterFailure,
  chargesToTake,
  decideRun,
  noticeCandidates,
  type AutopayCharge,
} from './decide'
import {
  buildBoardAlert,
  buildCanceledMoved,
  buildFailed,
  buildNeedsAction,
  buildNotice,
  buildOverMax,
  methodLabel,
  type AutopayEmail,
} from './emails'

export interface AutopayMethod {
  id: string
  type: 'ach' | 'card'
  brand: string | null
  last4: string | null
  stripePaymentMethodId: string
  stripeCustomerId: string
  stripeAccountId: string
  isActive: boolean
}

export interface AutopayEnrollment {
  id: string
  orgId: string
  orgName: string
  associationId: string
  unitId: string
  unitLabel: string
  userId: string
  ownerEmail: string | null
  maxCents: number
  includeOtherCharges: boolean
  consecutiveFailures: number
  /** False when the owner no longer holds a current ownership of the unit. */
  stillOwner: boolean
  /** The association's connected account can take charges and online payments are on. */
  paymentsReady: boolean
  /** The association's own calendar day. */
  today: string
  /** A buyer's sale window: charges due before this day are the seller's and are never autopaid. Null = whole history. */
  chargesFrom?: string | null
  method: AutopayMethod
}

export interface AutopayFeeQuote {
  feeCents: number
  /** Whether the fee is added to the charge (homeowner pays) or taken from the association. */
  feeChargedCents: number
  applicationFeeCents: number
  allocationMode: 'ga_statutory' | 'oldest_first'
}

export interface AttemptInput {
  enrollmentId: string
  period: string
  duesCents: number
  feeCents: number
  feePayer: 'association' | 'homeowner'
  totalCents: number
  applicationFeeCents: number
  allocation: Array<{ assessment_id: string; cents: number }>
  allocationMode: 'ga_statutory' | 'oldest_first'
  idempotencyKey: string
}

export interface AutopayStore {
  listActive(): Promise<AutopayEnrollment[]>
  openCharges(e: AutopayEnrollment): Promise<AutopayCharge[]>
  /** charge id -> cents named in earlier notices for this enrollment. */
  noticedCharges(e: AutopayEnrollment): Promise<Map<string, number>>
  /** Record that a notice named these charges. False when the write failed (then nothing is sent). */
  recordNotice(e: AutopayEnrollment, period: string, charges: Array<{ id: string; cents: number }>): Promise<boolean>
  /** First caller for (kind, enrollment, period) gets true. */
  claim(kind: 'over_max' | 'orphan', e: AutopayEnrollment, period: string): Promise<boolean>
  hasLiveAttempt(enrollmentId: string, period: string): Promise<boolean>
  /**
   * Attempts of ANY recent day for this enrollment that are still `created` with no
   * PaymentIntent: the charge call never returned a verdict (timeout). They are reconciled
   * against Stripe before this enrollment is charged again.
   */
  findOrphanAttempts(
    enrollmentId: string,
    today: string,
  ): Promise<Array<{ id: string; period: string; totalCents: number; applicationFeeCents: number; idempotencyKey: string }>>
  /** null when the unique index already holds a live attempt (a double run). */
  createAttempt(e: AutopayEnrollment, input: AttemptInput): Promise<{ id: string } | null>
  /**
   * With `expectStatus`, the write applies only while the row still has that status.
   * Returns false when it did not apply (another run got there first): the caller then
   * does nothing further, so a strike or email is never doubled.
   */
  updateAttempt(
    id: string,
    patch: { status: string; paymentIntentId?: string | null; failureCode?: string | null },
    expectStatus?: string,
  ): Promise<boolean>
  setFailures(enrollmentId: string, consecutiveFailures: number, paused: boolean): Promise<void>
  cancel(enrollmentId: string, reason: 'owner_moved'): Promise<void>
  boardEmails(orgId: string): Promise<string[]>
  orgSandbox(orgId: string): Promise<boolean>
  audit(action: string, e: AutopayEnrollment, metadata: Record<string, unknown>): Promise<void>
}

export type ChargeOutcome =
  | { status: 'succeeded' | 'processing'; paymentIntentId: string }
  | { status: 'requires_action'; paymentIntentId: string }
  | { status: 'failed'; failureCode: string | null; paymentIntentId?: string | null }

export interface AutopayChargePort {
  chargeOffSession(input: {
    stripeAccountId: string
    customerId: string
    paymentMethodId: string
    amountCents: number
    applicationFeeCents: number
    idempotencyKey: string
    metadata: { attempt_id: string; enrollment_id: string }
  }): Promise<ChargeOutcome>
  /**
   * Looks the attempt's charge up on Stripe by the attempt id carried in the intent's metadata
   * (not by idempotency key, which expires after 24 hours). null = Stripe has no such charge.
   * Throws when Stripe cannot answer.
   */
  findCharge(input: { stripeAccountId: string; attemptId: string }): Promise<ChargeOutcome | null>
}

export interface AutopayDeps {
  /** null when Stripe is not configured: the run takes no money (notices still go). */
  charger: () => AutopayChargePort | null
  quote: (e: AutopayEnrollment, duesCents: number) => Promise<AutopayFeeQuote>
  /** The guarded sender (apps/hoa's sendEmail). */
  sendEmail: (
    input: { to: string; subject: string; html: string; text: string },
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: boolean }>
  appUrl: (path: string) => string
}

export interface AutopayResult {
  skipped?: 'm8_off'
  enrollments: number
  canceled: number
  notices: number
  charged: number
  overMax: number
  failed: number
  paused: number
  errors: number
}

const INDETERMINATE_TYPES = new Set(['StripeConnectionError', 'StripeRateLimitError', 'StripeIdempotencyError'])
const NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKETTIMEDOUT'])

/**
 * True only for the known cases where Stripe may or may not have taken the money: connection
 * errors and timeouts, rate limits, Stripe 5xx, and an idempotency clash (needs reconciling,
 * must not loop). Anything else (auth, permission, invalid request, a TypeError) is a definite failure.
 */
function isIndeterminate(err: unknown): boolean {
  const e = err as { code?: unknown; type?: unknown; name?: unknown; statusCode?: unknown } | null
  if (typeof e?.type === 'string') {
    if (INDETERMINATE_TYPES.has(e.type)) return true
    if (e.type === 'StripeAPIError') return typeof e.statusCode === 'number' && e.statusCode >= 500
    return false
  }
  if (typeof e?.code === 'string' && NETWORK_CODES.has(e.code)) return true
  return e?.name === 'TimeoutError' || e?.name === 'AbortError'
}

type Logger = Pick<Console, 'info' | 'error'>

export async function runAutopay(
  store: AutopayStore,
  deps: AutopayDeps,
  opts: { m8Applied: boolean; logger?: Logger },
): Promise<AutopayResult> {
  const r: AutopayResult = { enrollments: 0, canceled: 0, notices: 0, charged: 0, overMax: 0, failed: 0, paused: 0, errors: 0 }
  if (!opts.m8Applied) return { ...r, skipped: 'm8_off' }
  const log = opts.logger ?? console
  const port = deps.charger()

  const enrollments = await store.listActive()
  r.enrollments = enrollments.length

  for (const e of enrollments) {
    try {
      const mail = async (to: string | null, email: AutopayEmail) => {
        if (!to) return
        await deps.sendEmail({ to, ...email }, { orgSandbox: await store.orgSandbox(e.orgId), ref: `autopay:${e.id}` })
      }
      const mailBoard = async (kind: 'failed' | 'paused' | 'over_max' | 'orphan') => {
        const email = buildBoardAlert({ kind, unitLabel: e.unitLabel, link: deps.appUrl('/dues') })
        for (const to of await store.boardEmails(e.orgId)) await mail(to, email)
      }

      /** Applies one verdict to an attempt that is still `created`. A lost race does nothing at all. */
      const applyOutcome = async (attemptId: string, outcome: ChargeOutcome) => {
        if (outcome.status === 'succeeded' || outcome.status === 'processing') {
          if (!(await store.updateAttempt(attemptId, { status: outcome.status, paymentIntentId: outcome.paymentIntentId }, 'created'))) return
          // Posting to the ledger belongs to the webhook (PR 4/5), not to this job.
          if (outcome.status === 'succeeded') await store.setFailures(e.id, 0, false)
          r.charged += 1
        } else if (outcome.status === 'requires_action') {
          if (!(await store.updateAttempt(attemptId, { status: 'requires_action', paymentIntentId: outcome.paymentIntentId }, 'created'))) return
          await mail(e.ownerEmail, buildNeedsAction({ link: deps.appUrl('/resident/dues/autopay') }))
        } else {
          const bad = outcome as Extract<ChargeOutcome, { status: 'failed' }>
          const applied = await store.updateAttempt(
            attemptId,
            { status: 'failed', failureCode: bad.failureCode, paymentIntentId: bad.paymentIntentId ?? null },
            'created',
          )
          if (!applied) return
          const next = afterFailure(e.consecutiveFailures)
          await store.setFailures(e.id, next.consecutiveFailures, next.paused)
          // So a later webhook for this same attempt does not count it a second time.
          await store.audit('autopay.failure_counted', e, { attempt_id: attemptId, consecutive_failures: next.consecutiveFailures })
          await store.audit(next.paused ? 'autopay.paused' : 'online_payment.failed', e, { period: e.today, code: bad.failureCode })
          await mail(e.ownerEmail, buildFailed({ paused: next.paused, manageUrl: deps.appUrl('/resident/dues/autopay') }))
          await mailBoard(next.paused ? 'paused' : 'failed')
          r.failed += 1
          if (next.paused) r.paused += 1
        }
      }

      /** Charges (or retries with the stored key) and applies the verdict. Throws when Stripe gave none. */
      const settle = async (attemptId: string, totalCents: number, applicationFeeCents: number, idempotencyKey: string, port: AutopayChargePort) => {
        let outcome: ChargeOutcome
        try {
          outcome = await port.chargeOffSession({
            stripeAccountId: e.method.stripeAccountId,
            customerId: e.method.stripeCustomerId,
            paymentMethodId: e.method.stripePaymentMethodId,
            amountCents: totalCents,
            applicationFeeCents,
            idempotencyKey,
            metadata: { attempt_id: attemptId, enrollment_id: e.id },
          })
        } catch (err) {
          // No verdict from Stripe: the charge may or may not exist. Leave the attempt `created`;
          // the next run reconciles it against Stripe before anything new is charged.
          if (isIndeterminate(err)) throw err
          const code = (err as { code?: unknown } | null)?.code
          outcome = { status: 'failed', failureCode: typeof code === 'string' ? code : 'charge_error' }
        }
        await applyOutcome(attemptId, outcome)
      }

      /**
       * Resolves attempts whose charge call never answered, on ANY recent day. True when every one is
       * resolved; false while one is still unknown (this enrollment is then not charged). Reconciling
       * anything also pauses new charges for the rest of this run, because a charge that succeeded may not
       * have posted yet and its dues would look open.
       */
      const reconcileOrphans = async (port: AutopayChargePort): Promise<{ clear: boolean; touched: boolean }> => {
        const orphans = await store.findOrphanAttempts(e.id, e.today)
        let clear = true
        let touched = false
        for (const o of orphans) {
          try {
            const found = await port.findCharge({ stripeAccountId: e.method.stripeAccountId, attemptId: o.id })
            touched = true
            if (found) await applyOutcome(o.id, found)
            else if (o.period === e.today) await settle(o.id, o.totalCents, o.applicationFeeCents, o.idempotencyKey, port)
            else await store.updateAttempt(o.id, { status: 'failed', failureCode: 'no_charge_found' }, 'created')
          } catch (err) {
            clear = false
            r.errors += 1
            const code = (err as { code?: unknown } | null)?.code
            log.error('[autopay] orphan attempt unresolved', { enrollmentId: e.id, attemptId: o.id, code: typeof code === 'string' ? code : null })
          }
        }
        if (!clear && (await store.claim('orphan', e, e.today))) {
          await mailBoard('orphan')
          await store.audit('autopay.orphan_unresolved', e, { period: e.today })
        }
        return { clear, touched }
      }

      // 1. Moved out: autopay belongs to the owner, not the home.
      if (!e.stillOwner) {
        await store.cancel(e.id, 'owner_moved')
        await store.audit('autopay.canceled', e, { reason: 'owner_moved' })
        await mail(e.ownerEmail, buildCanceledMoved({ orgName: e.orgName }))
        r.canceled += 1
        continue
      }
      if (!e.paymentsReady || !e.method.isActive) continue
      // A sandbox org never moves real money (the resident Pay path refuses it the same way).
      if (await store.orgSandbox(e.orgId)) continue

      const charges = await store.openCharges(e)
      const noticed = await store.noticedCharges(e)
      const noticedBefore = new Map(noticed)

      // 2. Notices: name every newly due-soon charge once, before it can be charged.
      const fresh = noticeCandidates({
        charges,
        today: e.today,
        includeOther: e.includeOtherCharges,
        alreadyNoticed: noticed,
      })
      if (fresh.length > 0) {
        const freshCents = fresh.map((c) => ({ id: c.id, cents: c.remainingCents }))
        const dues = freshCents.reduce((s, c) => s + c.cents, 0)
        const q = await deps.quote(e, dues)
        const total = dues + q.feeChargedCents
        // No record, no email: a broken write must never become a daily email.
        if (await store.recordNotice(e, e.today, freshCents)) {
          for (const c of freshCents) noticed.set(c.id, c.cents)
          // The first (earliest) due date: that is when the first money moves. Never earlier than tomorrow.
          const tomorrow = addDays(e.today, 1)
          const earliest = fresh.reduce((d, c) => (c.dueDate < d ? c.dueDate : d), fresh[0]!.dueDate)
          const runDate = earliest > tomorrow ? earliest : tomorrow
          await mail(
            e.ownerEmail,
            buildNotice({
              orgName: e.orgName,
              runDate,
              totalCents: total,
              feeCents: q.feeChargedCents,
              maxCents: e.maxCents,
              method: methodLabel(e.method),
              manageUrl: deps.appUrl('/resident/dues/autopay'),
            }),
          )
          r.notices += 1
        }
      }

      // 2b. Never charge again while an earlier charge call is unresolved.
      if (port) {
        const rec = await reconcileOrphans(port)
        if (!rec.clear || rec.touched) continue
      }

      // 3. The run takes only charges noticed BEFORE this run: the owner gets a day to react.
      const todays = chargesToTake({
        charges,
        today: e.today,
        includeOther: e.includeOtherCharges,
        noticed: noticedBefore,
      })
      const duesCents = todays.reduce((s, c) => s + c.cents, 0)
      if (duesCents <= 0) continue
      if (await store.hasLiveAttempt(e.id, e.today)) continue
      const q = await deps.quote(e, duesCents)
      const totalCents = duesCents + q.feeChargedCents
      const decision = decideRun({ duesCents, totalCents, maxCents: e.maxCents })
      if (decision.kind === 'over_max') {
        if (await store.claim('over_max', e, e.today)) {
          await mail(
            e.ownerEmail,
            buildOverMax({
              totalCents,
              maxCents: e.maxCents,
              manageUrl: deps.appUrl('/resident/dues/autopay'),
              payUrl: deps.appUrl('/resident/dues/pay'),
            }),
          )
          await mailBoard('over_max')
          await store.audit('autopay.over_max', e, { period: e.today })
          r.overMax += 1
        }
        continue
      }
      if (decision.kind === 'nothing') continue
      if (!port) continue

      const attempt = await store.createAttempt(e, {
        enrollmentId: e.id,
        period: e.today,
        duesCents,
        feeCents: q.feeCents,
        feePayer: q.feeChargedCents > 0 ? 'homeowner' : 'association',
        totalCents,
        applicationFeeCents: q.applicationFeeCents,
        allocation: todays.map((c) => ({ assessment_id: c.chargeId, cents: c.cents })),
        allocationMode: q.allocationMode,
        idempotencyKey: `autopay:${e.id}:${e.today}`,
      })
      if (!attempt) continue // the unique index said another run already holds today

      await settle(attempt.id, totalCents, q.applicationFeeCents, `autopay:${e.id}:${e.today}`, port)
    } catch (err) {
      r.errors += 1
      const code = (err as { code?: unknown } | null)?.code
      log.error('[autopay] enrollment failed', { enrollmentId: e.id, code: typeof code === 'string' ? code : null })
    }
  }

  log.info('[autopay] done', { ...r })
  return r
}
