/**
 * Poll emails: "a poll is open" and "the poll has closed, here are the
 * results". The runner is pure apart from what is injected, in the same
 * shape as the payment receipt runner (resident-notify/receipt-run.ts):
 *
 *   1. load     the poll, its answers and its association; a poll outside
 *               the association the caller acts for is "not found"
 *   2. gate     opened:  the poll must be open now.
 *               results: the poll must be finished AND residents must be
 *               allowed to see the results (canSeeResults, 'resident').
 *               trigger 'auto' (the daily job) also needs the board's
 *               earlier "Email residents about this poll" yes, shown by
 *               the opened email's communications row. The board pressing
 *               Close with the box ticked is its own yes.
 *   3. people   every home's owner or tenant of THIS association with an
 *               email, minus anyone who turned email off, one per address.
 *   4. claim    a communications row whose id is deterministic per poll and
 *               kind (pollEmailCommunicationId): one opened email and one
 *               results email per poll, ever, whoever triggers it. A
 *               primary-key conflict means it was handled; nothing is sent.
 *               That row is also the record "results emailed": no column,
 *               no migration.
 *   5. send     ONE guarded batch (apps/hoa's sendEmailBatch, which applies
 *               the outbound guard and respects the org's sandbox flag).
 *               Rendering is done here with escaping, so an answer label
 *               can never be read as a merge field or as HTML.
 *
 * Never throws: every failure comes back as a status. English only: the
 * workflow emails are not translated.
 *
 * Logs carry ids and counts only: never an address, a name, a question, an
 * answer or a body.
 */

import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { deterministicUuid } from '@homeowner-portal/jobs/deterministic-id'
import { buildSenderName } from '@/lib/email/sender-name'
import type { PollResultRow } from '@homeowner-portal/db/polls-types'
import { buildTally, canSeeResults, effectiveStatus, type PollStatus, type ResultsVisibility } from '../rules'
import { renderPollOpenedEmail, renderPollResultsEmail, type RenderedPollEmail } from './render'

export type PollEmailKind = 'opened' | 'results'
export type PollEmailTrigger = 'board' | 'auto'

export interface PollEmailEvent {
  kind: PollEmailKind
  trigger: PollEmailTrigger
  pollId: string
  /** The association the caller acts for; a poll outside it is not found. */
  associationId: string
}

export type PollEmailStatus =
  | 'sent'
  | 'held'
  | 'already_sent'
  | 'failed'
  | 'no_recipients'
  | 'not_found'
  | 'not_open'
  | 'not_closed'
  | 'results_hidden'
  | 'not_opted_in'
  | 'email_not_configured'

export interface PollEmailResult {
  status: PollEmailStatus
  communicationId: string | null
  /** Homes emailed (one recipient per home). */
  sent: number
  failed: number
  /** Recipients the outbound guard held back (recorded `suppressed`, not failed). */
  held: number
  /** Homes skipped because they turned off email. */
  optedOut: number
}

/** communications.related_resource.type for these rows. */
export const POLL_EMAIL_RESOURCE_TYPE = 'poll_email'

export function pollEmailCommunicationId(pollId: string, kind: PollEmailKind): string {
  return deterministicUuid(`poll-email:${kind}:${pollId}`)
}

export interface PollEmailContext {
  association: { id: string; name: string; type: string | null; organizationId: string; timeZone: string; managedBy?: string | null }
  poll: {
    id: string
    associationId: string
    title: string
    description: string | null
    allowMultiple: boolean
    resultsVisibility: ResultsVisibility
    status: PollStatus
    closesAt: string | null
  }
  /** In answer order. */
  options: string[]
}

export interface PollRecipient {
  unitId: string
  userId: string | null
  name: string | null
  email: string
}

export interface PollEmailClaim {
  id: string
  organizationId: string
  associationId: string
  pollId: string
  kind: PollEmailKind
  trigger: PollEmailTrigger
  subject: string
  html: string
  text: string
  recipientCount: number
}

export type PollRecipientOutcome =
  | { status: 'sent'; externalId: string | null }
  | { status: 'suppressed' | 'failed'; error: string }

/** Reads and writes THROW on error; the runner turns that into 'failed'. */
export interface PollEmailStore {
  /** null when the poll is gone or not readable. */
  loadContext(pollId: string): Promise<PollEmailContext | null>
  /** Tally rows (homes, never names). Only called for a results email. */
  loadTally(pollId: string): Promise<PollResultRow[]>
  /**
   * The association's homes with an email on file, one per address, minus
   * homes whose resident turned email off (counted in optedOut).
   */
  loadRecipients(association: { id: string; organizationId: string }): Promise<{ recipients: PollRecipient[]; optedOut: number }>
  /** communications.status of a row by id, or null when there is none. */
  communicationStatus(id: string): Promise<string | null>
  orgSandbox(organizationId: string): Promise<boolean>
  claim(input: PollEmailClaim): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  /** One row per recipient, in order. */
  insertRecipients(
    communicationId: string,
    organizationId: string,
    rows: PollRecipient[],
  ): Promise<Array<{ id: string; email: string }>>
  markRecipient(id: string, outcome: PollRecipientOutcome, renderedSubject: string): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed' | 'cancelled'): Promise<void>
}

export type BatchEmailResult = { ok: true; messageId: string | null } | { ok: false; error: string }

export interface PollEmailDeps {
  /** A guarded batch sender: in production, apps/hoa's `sendEmailBatch`. Positional results. */
  sendEmailBatch: (
    inputs: Array<{ to: string; subject: string; html: string; text: string; senderName?: string | null; recipientRef?: string | null }>,
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<BatchEmailResult[]>
  /** False when the transport would no-op and report success. */
  emailConfigured: () => boolean
  portalUrl: (path: string) => string
  now: () => Date
}

export interface PollEmailLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void
  warn: (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
}

/** The resident page the emails link to. */
export const pollPortalPath = (pollId: string) => `/resident/polls/${pollId}`

const errName = (err: unknown) => (err instanceof Error ? err.name : 'unknown')

function result(
  status: PollEmailStatus,
  communicationId: string | null = null,
  counts: { sent?: number; failed?: number; held?: number; optedOut?: number } = {},
): PollEmailResult {
  return {
    status,
    communicationId,
    sent: counts.sent ?? 0,
    failed: counts.failed ?? 0,
    held: counts.held ?? 0,
    optedOut: counts.optedOut ?? 0,
  }
}

/**
 * The last day residents can answer, as words. closes_at is the START of the
 * day after the last day (createPollAction), so one second earlier is the
 * last day in the association's zone.
 */
export function lastAnswerDayLabel(closesAt: string, timeZone: string): string {
  const t = new Date(closesAt).getTime()
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(t - 1000),
  )
}

function render(event: PollEmailEvent, ctx: PollEmailContext, tally: PollResultRow[], deps: PollEmailDeps): RenderedPollEmail {
  const url = deps.portalUrl(pollPortalPath(ctx.poll.id))
  if (event.kind === 'opened') {
    return renderPollOpenedEmail({
      associationName: ctx.association.name,
      managedBy: ctx.association.managedBy,
      title: ctx.poll.title,
      description: ctx.poll.description,
      options: ctx.options,
      allowMultiple: ctx.poll.allowMultiple,
      closesOnLabel: ctx.poll.closesAt ? lastAnswerDayLabel(ctx.poll.closesAt, ctx.association.timeZone) || null : null,
      pollUrl: url,
    })
  }
  const t = buildTally(tally)
  return renderPollResultsEmail({
    associationName: ctx.association.name,
    managedBy: ctx.association.managedBy,
    title: ctx.poll.title,
    rows: t.rows,
    homesAnswered: t.homesAnswered,
    allowMultiple: ctx.poll.allowMultiple,
    resultsUrl: url,
  })
}

function failure(error: string): PollRecipientOutcome {
  return error === OUTBOUND_BLOCKED_ERROR ? { status: 'suppressed', error } : { status: 'failed', error: error.slice(0, 500) }
}

const MARK_CHUNK = 25

export async function runPollEmail(
  store: PollEmailStore,
  deps: PollEmailDeps,
  event: PollEmailEvent,
  logger: PollEmailLogger,
): Promise<PollEmailResult> {
  const communicationId = pollEmailCommunicationId(event.pollId, event.kind)
  const tag = `[poll-email] ${event.kind} ${event.trigger} ${event.pollId}`
  try {
    const ctx = await store.loadContext(event.pollId)
    if (!ctx || ctx.poll.associationId !== event.associationId || ctx.association.id !== event.associationId) {
      logger.warn(`${tag}: poll not found in this association; nothing sent`)
      return result('not_found')
    }
    const now = deps.now()
    const eff = effectiveStatus({ status: ctx.poll.status, closes_at: ctx.poll.closesAt }, now)

    if (event.kind === 'opened') {
      if (eff !== 'open') return result('not_open')
    } else {
      if (eff !== 'closed') return result('not_closed')
      // A resident's own view decides: if they cannot see the results in
      // the portal, they do not get them by email.
      const visible = canSeeResults(
        { status: ctx.poll.status, closes_at: ctx.poll.closesAt, results_visibility: ctx.poll.resultsVisibility },
        'resident',
        now,
      )
      if (!visible) return result('results_hidden')
      if (event.trigger === 'auto') {
        const openStatus = await store.communicationStatus(pollEmailCommunicationId(event.pollId, 'opened'))
        if (openStatus === null || openStatus === 'cancelled') return result('not_opted_in')
      }
    }

    // Cheap exit before reading anyone's address.
    if ((await store.communicationStatus(communicationId)) !== null) {
      logger.info(`${tag}: ${communicationId} already handled`)
      return result('already_sent', communicationId)
    }

    const { recipients, optedOut } = await store.loadRecipients({
      id: ctx.association.id,
      organizationId: ctx.association.organizationId,
    })
    if (recipients.length === 0) return result('no_recipients', null, { optedOut })
    // The transport no-ops and reports success without its key: don't
    // claim, so the poll isn't marked as emailed with nothing sent.
    if (!deps.emailConfigured()) {
      logger.warn(`${tag}: email delivery is not configured`)
      return result('email_not_configured', null, { optedOut })
    }

    const tally = event.kind === 'results' ? await store.loadTally(event.pollId) : []
    const email = render(event, ctx, tally, deps)
    const claim = await store.claim({
      id: communicationId,
      organizationId: ctx.association.organizationId,
      associationId: ctx.association.id,
      pollId: ctx.poll.id,
      kind: event.kind,
      trigger: event.trigger,
      subject: email.subject,
      html: email.html,
      text: email.text,
      recipientCount: recipients.length,
    })
    if (!claim.ok) {
      logger.info(`${tag}: ${communicationId} already handled`)
      return result('already_sent', communicationId, { optedOut })
    }

    let sent = 0
    let failed = 0
    let held = 0
    try {
      const orgSandbox = await store.orgSandbox(ctx.association.organizationId)
      const senderName = buildSenderName(ctx.association.name, ctx.association.type) || null
      const rows = await store.insertRecipients(communicationId, ctx.association.organizationId, recipients)
      const idByEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]))
      const toSend = recipients.map((r) => ({ r, rowId: idByEmail.get(r.email.toLowerCase()) ?? null }))

      let results: BatchEmailResult[]
      try {
        results = await deps.sendEmailBatch(
          toSend.map(({ r, rowId }) => ({
            to: r.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            senderName,
            recipientRef: rowId,
          })),
          { orgSandbox, ref: communicationId },
        )
      } catch (err) {
        results = toSend.map(() => ({ ok: false as const, error: errName(err) }))
      }

      const outcomes: Array<{ rowId: string | null; outcome: PollRecipientOutcome }> = toSend.map(({ rowId }, i) => {
        const res = results[i] ?? { ok: false as const, error: 'no batch result returned' }
        return { rowId, outcome: res.ok ? { status: 'sent' as const, externalId: res.messageId } : failure(res.error) }
      })
      for (const { outcome } of outcomes) {
        if (outcome.status === 'sent') sent += 1
        else if (outcome.status === 'suppressed') held += 1
        else failed += 1
      }
      // The batch has already gone out. A bookkeeping failure here must not
      // turn a delivered email into a reported failure: the counts above are
      // the truth, and the communications row still finishes below.
      try {
        for (let i = 0; i < outcomes.length; i += MARK_CHUNK) {
          await Promise.all(
            outcomes
              .slice(i, i + MARK_CHUNK)
              .filter((o) => o.rowId)
              .map((o) => store.markRecipient(o.rowId as string, o.outcome, email.subject)),
          )
        }
      } catch (err) {
        logger.error(`${tag}: ${communicationId} recipient bookkeeping failed after send`, { error: errName(err) })
      }
    } finally {
      // All held becomes `cancelled`, which the communications screens read
      // as "Held by safety guard", not as a failure (BL-109).
      await store.finish(communicationId, finalSendStatus({ sent, failed, held })).catch((err) => {
        logger.error(`${tag}: ${communicationId} status update failed`, { error: errName(err) })
      })
    }

    logger.info(`${tag}: ${communicationId} ${sent} sent, ${held} held, ${failed} failed`, { optedOut })
    const status: PollEmailStatus = sent > 0 ? 'sent' : held > 0 && failed === 0 ? 'held' : 'failed'
    return result(status, communicationId, { sent, failed, held, optedOut })
  } catch (err) {
    logger.error(`${tag}: ${communicationId} failed`, { error: errName(err) })
    return result('failed', communicationId)
  }
}
