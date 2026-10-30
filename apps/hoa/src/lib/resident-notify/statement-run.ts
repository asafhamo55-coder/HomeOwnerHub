/**
 * Round 16 — "Email this statement": a board member emails one home's
 * account statement to its owner(s). Same shape as receipt-run.ts (BL-114):
 * pure apart from what is injected, never throws.
 *
 *   1. load     the home's association, unit, owners and the statement
 *               figures for the period, all read server-side. The client
 *               sends a property id and two dates; never an address.
 *   2. people   every current owner with an email, minus anyone who turned
 *               off email in resident_communication_preferences. Email only.
 *   3. dedupe   one statement per unit per 24 hours (STATEMENT_DEDUPE_HOURS).
 *               A read of recent statement communications, plus a claim id
 *               that is deterministic per unit and 24-hour bucket so two
 *               simultaneous clicks cannot both claim.
 *   4. send     through the injected GUARDED sender (outbound-guard, BL-004)
 *               with the org's sandbox flag; a guard hold is recorded
 *               `suppressed` and the result is `held`, not `failed`.
 *
 * Read-only against the ledger: nothing is posted. Logs carry ids and
 * counts only, never an address, a name or an amount.
 */

import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { deterministicUuid } from '@homeowner-portal/jobs/deterministic-id'
import { buildSenderName } from '@/lib/email/sender-name'
import { renderStatementEmail, type StatementEmailLine } from './statement-render'
import type { ReceiptOwner } from './receipt-run'
import type { NotifyLogger, ResidentNotifyDeps, ResidentRecipientOutcome } from './run'

export const STATEMENT_DEDUPE_HOURS = 24
export const STATEMENT_RESOURCE_TYPE = 'account_statement'
/** The resident portal page the email links to. */
export const STATEMENT_PORTAL_PATH = '/resident/dues/statement'
export const STATEMENT_AUDIT_ACTION = 'statement.emailed'

export interface StatementEmailEvent {
  /** hoa_properties.id, already a UUID. */
  propertyId: string
  /** yyyy-mm-dd, validated by the caller. */
  from: string
  to: string
  /** Who clicked. */
  actorUserId: string | null
  actorRole: 'admin' | 'board'
  /** The org the caller acts for; a property outside it is not found. */
  organizationId: string
}

export type StatementEmailStatus =
  | 'sent'
  | 'held'
  | 'opted_out'
  | 'duplicate'
  | 'no_email'
  | 'not_found'
  | 'email_not_configured'
  | 'failed'

export interface StatementEmailResult {
  status: StatementEmailStatus
  communicationId: string | null
  sent: number
  failed: number
  held: number
  optedOut: number
}

export interface StatementContext {
  association: { id: string; name: string; type: string | null; organizationId: string }
  unitId: string | null
  /** "Unit · address", as the statement page prints it. */
  home: string
  /** The association's today, yyyy-mm-dd. */
  statementDate: string
  /** Display text for the period. */
  period: string
  openingBalance: number
  charges: number
  paymentsAndCredits: number
  closingBalance: number
  lines: StatementEmailLine[]
  owners: ReceiptOwner[]
}

export interface StatementClaim {
  id: string
  organizationId: string
  associationId: string
  subject: string
  html: string
  text: string
  propertyId: string
  unitId: string | null
  from: string
  to: string
  recipientCount: number
}

/** Reads and writes THROW on error; the runner turns that into 'failed'. */
export interface StatementEmailStore {
  /** null when the property is not in the caller's org. */
  loadContext(event: StatementEmailEvent): Promise<StatementContext | null>
  emailOptIn(organizationId: string, userId: string): Promise<boolean>
  orgSandbox(organizationId: string): Promise<boolean>
  /** True when a statement for this unit was claimed (and did not fail) at or after `sinceIso`. */
  recentStatement(unitId: string, sinceIso: string): Promise<boolean>
  claim(input: StatementClaim): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipient(
    communicationId: string,
    organizationId: string,
    r: { userId: string | null; unitId: string | null; name: string | null; email: string },
  ): Promise<{ id: string }>
  markRecipient(id: string, outcome: ResidentRecipientOutcome, renderedSubject: string): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed' | 'cancelled'): Promise<void>
  /** Best effort: a failure here never undoes a send. */
  audit(entry: {
    organizationId: string
    actorUserId: string | null
    actorRole: 'admin' | 'board'
    propertyId: string
    communicationId: string
    outcome: 'sent' | 'suppressed' | 'failed'
    recipients: number
  }): Promise<void>
}

export type StatementEmailDeps = Pick<ResidentNotifyDeps, 'sendEmail' | 'emailConfigured' | 'portalUrl'> & {
  now?: () => Date
}

const errName = (err: unknown) => (err instanceof Error ? err.name : 'unknown')

/** Same unit, same 24-hour bucket, same id: the claim itself is the lock. */
export function statementCommunicationId(unitId: string, now: Date): string {
  const bucket = Math.floor(now.getTime() / (STATEMENT_DEDUPE_HOURS * 3_600_000))
  return deterministicUuid(`account-statement:${unitId}:${bucket}`)
}

/** j***@example.com. Never the full local part. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

function result(
  status: StatementEmailStatus,
  communicationId: string | null = null,
  counts: { sent?: number; failed?: number; held?: number; optedOut?: number } = {},
): StatementEmailResult {
  return {
    status,
    communicationId,
    sent: counts.sent ?? 0,
    failed: counts.failed ?? 0,
    held: counts.held ?? 0,
    optedOut: counts.optedOut ?? 0,
  }
}

function failure(error: string): ResidentRecipientOutcome {
  return error === OUTBOUND_BLOCKED_ERROR ? { status: 'suppressed', error } : { status: 'failed', error: error.slice(0, 500) }
}

export async function runStatementEmail(
  store: StatementEmailStore,
  deps: StatementEmailDeps,
  event: StatementEmailEvent,
  logger: NotifyLogger,
): Promise<StatementEmailResult> {
  const tag = `[statement-email] ${event.propertyId}`
  try {
    const ctx = await store.loadContext(event)
    if (!ctx || ctx.association.organizationId !== event.organizationId) {
      logger.warn(`${tag}: home not found in this organization; nothing sent`)
      return result('not_found')
    }
    const { association } = ctx

    // One email per address; co-owners each get one.
    const seen = new Set<string>()
    const recipients: Array<ReceiptOwner & { email: string }> = []
    let optedOut = 0
    for (const o of ctx.owners) {
      const email = o.email?.trim()
      if (!email) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (o.userId && !(await store.emailOptIn(association.organizationId, o.userId))) {
        optedOut += 1
        continue
      }
      recipients.push({ ...o, email })
    }
    if (recipients.length === 0) return result(optedOut > 0 ? 'opted_out' : 'no_email', null, { optedOut })

    if (!deps.emailConfigured()) {
      logger.warn(`${tag}: email delivery is not configured`)
      return result('email_not_configured', null, { optedOut })
    }

    const now = (deps.now ?? (() => new Date()))()
    if (ctx.unitId) {
      const since = new Date(now.getTime() - STATEMENT_DEDUPE_HOURS * 3_600_000).toISOString()
      if (await store.recentStatement(ctx.unitId, since)) {
        logger.info(`${tag}: a statement went out in the last ${STATEMENT_DEDUPE_HOURS} hours`)
        return result('duplicate', null, { optedOut })
      }
    }

    const mail = renderStatementEmail({
      associationName: association.name,
      period: ctx.period,
      statementDate: ctx.statementDate,
      home: ctx.home,
      openingBalance: ctx.openingBalance,
      charges: ctx.charges,
      paymentsAndCredits: ctx.paymentsAndCredits,
      closingBalance: ctx.closingBalance,
      lines: ctx.lines,
      portalUrl: deps.portalUrl(STATEMENT_PORTAL_PATH),
    })
    // Without a unit there is nothing to key the 24-hour lock on, so the
    // property id stands in for it.
    const communicationId = statementCommunicationId(ctx.unitId ?? event.propertyId, now)
    const claim = await store.claim({
      id: communicationId,
      organizationId: association.organizationId,
      associationId: association.id,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      propertyId: event.propertyId,
      unitId: ctx.unitId,
      from: event.from,
      to: event.to,
      recipientCount: recipients.length,
    })
    if (!claim.ok) {
      logger.info(`${tag}: ${communicationId} already claimed`)
      return result('duplicate', communicationId, { optedOut })
    }

    let sent = 0
    let failed = 0
    let held = 0
    try {
      const orgSandbox = await store.orgSandbox(association.organizationId)
      const opts = { orgSandbox, ref: communicationId }
      const senderName = buildSenderName(association.name, association.type) || null
      for (const r of recipients) {
        let outcome: ResidentRecipientOutcome = { status: 'failed', error: 'not attempted' }
        const row = await store.insertRecipient(communicationId, association.organizationId, {
          userId: r.userId,
          unitId: ctx.unitId,
          name: r.name,
          email: r.email,
        })
        try {
          const res = await deps.sendEmail(
            { to: r.email, subject: mail.subject, html: mail.html, text: mail.text, senderName, recipientRef: row.id },
            opts,
          )
          outcome = res.ok ? { status: 'sent', externalId: res.messageId } : failure(res.error)
        } catch (err) {
          outcome = { status: 'failed', error: errName(err) }
        }
        if (outcome.status === 'sent') sent += 1
        else if (outcome.status === 'suppressed') held += 1
        else failed += 1
        await store.markRecipient(row.id, outcome, mail.subject)
      }
    } finally {
      await store.finish(communicationId, finalSendStatus({ sent, failed, held })).catch((err) => {
        logger.error(`${tag}: ${communicationId} status update failed`, { error: errName(err) })
      })
    }

    await store
      .audit({
        organizationId: association.organizationId,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        propertyId: event.propertyId,
        communicationId,
        outcome: failed > 0 ? 'failed' : sent > 0 ? 'sent' : 'suppressed',
        recipients: recipients.length,
      })
      .catch((err) => logger.error(`${tag}: ${communicationId} audit failed`, { error: errName(err) }))

    logger.info(`${tag}: ${communicationId} ${sent} sent, ${held} held, ${failed} failed`, { optedOut })
    const status: StatementEmailStatus = failed > 0 ? 'failed' : sent > 0 ? 'sent' : held > 0 ? 'held' : 'failed'
    return result(status, communicationId, { sent, failed, held, optedOut })
  } catch (err) {
    logger.error(`${tag}: failed`, { error: errName(err) })
    return result('failed')
  }
}
