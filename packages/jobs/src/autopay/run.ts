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
  claim(kind: 'over_max', e: AutopayEnrollment, period: string): Promise<boolean>
  hasLiveAttempt(enrollmentId: string, period: string): Promise<boolean>
  /**
   * An attempt for (enrollment, period) that is still `created` with no PaymentIntent:
   * the charge call never returned a verdict (timeout). It is retried with its own stored
   * idempotency key, so Stripe hands back the original intent instead of charging twice.
   */
  findOrphanAttempt(
    enrollmentId: string,
    period: string,
  ): Promise<{ id: string; totalCents: number; applicationFeeCents: number; idempotencyKey: string } | null>
  /** null when the unique index already holds a live attempt (a double run). */
  createAttempt(e: AutopayEnrollment, input: AttemptInput): Promise<{ id: string } | null>
  updateAttempt(id: string, patch: { status: string; paymentIntentId?: string | null; failureCode?: string | null }): Promise<void>
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

const INDETERMINATE_TYPES = new Set(['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError', 'StripeIdempotencyError'])

/** True when the error says nothing about whether Stripe took the money. */
function isIndeterminate(err: unknown): boolean {
  const e = err as { code?: unknown; type?: unknown } | null
  if (typeof e?.type === 'string' && INDETERMINATE_TYPES.has(e.type)) return true
  // Node network errors (ECONNRESET, ETIMEDOUT) carry an upper-case E code; no code at all is a timeout too.
  return typeof e?.code !== 'string' || /^E[A-Z]+$/.test(e.code)
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
      const mailBoard = async (kind: 'failed' | 'paused' | 'over_max') => {
        const email = buildBoardAlert({ kind, unitLabel: e.unitLabel, link: deps.appUrl('/dues') })
        for (const to of await store.boardEmails(e.orgId)) await mail(to, email)
      }

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
          // No verdict from Stripe (timeout, dropped connection, 5xx): the charge may or may not exist.
          // Leave the attempt `created`; the next run retries it with the same idempotency key.
          if (isIndeterminate(err)) throw err
          const code = (err as { code?: unknown } | null)?.code
          outcome = { status: 'failed', failureCode: typeof code === 'string' ? code : 'charge_error' }
        }

        if (outcome.status === 'succeeded' || outcome.status === 'processing') {
          await store.updateAttempt(attemptId, { status: outcome.status, paymentIntentId: outcome.paymentIntentId })
          // Posting to the ledger belongs to the webhook (PR 4/5), not to this job.
          if (outcome.status === 'succeeded') await store.setFailures(e.id, 0, false)
          r.charged += 1
        } else if (outcome.status === 'requires_action') {
          await store.updateAttempt(attemptId, { status: 'requires_action', paymentIntentId: outcome.paymentIntentId })
          await mail(e.ownerEmail, buildNeedsAction({ link: deps.appUrl('/resident/dues/autopay') }))
        } else {
          const bad = outcome as Extract<ChargeOutcome, { status: 'failed' }>
          await store.updateAttempt(attemptId, {
            status: 'failed',
            failureCode: bad.failureCode,
            paymentIntentId: bad.paymentIntentId ?? null,
          })
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

      // 3. The run takes only charges noticed BEFORE this run: the owner gets a day to react.
      const todays = chargesToTake({
        charges,
        today: e.today,
        includeOther: e.includeOtherCharges,
        noticed: noticedBefore,
      })
      const duesCents = todays.reduce((s, c) => s + c.cents, 0)
      if (duesCents <= 0) continue
      if (await store.hasLiveAttempt(e.id, e.today)) {
        // A live attempt with no intent is a charge whose answer was lost: finish it, never start a second.
        const orphan = port ? await store.findOrphanAttempt(e.id, e.today) : null
        if (orphan && port) await settle(orphan.id, orphan.totalCents, orphan.applicationFeeCents, orphan.idempotencyKey, port)
        continue
      }

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
