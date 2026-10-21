/**
 * BL-114 — email the unit's owners a receipt when the board records their
 * payment. The runner: pure apart from what is injected. Same shape as
 * run.ts (BL-082):
 *
 *   1. load     the payment, its association, property, current owners and
 *               the property's remaining balance
 *   2. gate     trigger 'auto' (the board just recorded the payment): the
 *               association's signed "Email owners a receipt" setting
 *               (receipt-settings.ts) — OFF unless a board saved ON.
 *               trigger 'manual' (the board clicked "Send receipt"): that
 *               click IS the opt-in, so the setting is not read.
 *   3. people   every current owner with an email, minus anyone who turned
 *               off email in resident_communication_preferences. Email
 *               only — a receipt never goes by text.
 *   4. claim    a communications row whose id is deterministic per payment
 *               and trigger (receiptCommunicationId): one automatic receipt
 *               per payment, ever, and one board-clicked receipt per
 *               payment. A primary-key conflict means it was already
 *               handled and nothing is sent.
 *   5. send     through the injected GUARDED sender (apps/hoa's sendEmail →
 *               outbound-guard, BL-004) with the org's sandbox flag and the
 *               communication id as the guard's ref; the row finishes with
 *               finalSendStatus, so a guard hold reads as held, not failed.
 *
 * Never throws: every failure comes back as `status: 'failed'`, so the
 * recorded payment is never undone or blocked by it. Logs carry ids and
 * counts only — never an address, a name, an amount or a body.
 */

import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { deterministicUuid } from '@homeowner-portal/jobs/deterministic-id'
import { buildSenderName } from '@/lib/email/sender-name'
import { renderPaymentReceiptEmail } from './receipt-render'
import { paymentReceiptsOn } from './receipt-settings'
import type { NotifyLogger, ResidentNotifyDeps, ResidentRecipientOutcome } from './run'

export type ReceiptTrigger = 'auto' | 'manual'

export interface PaymentReceiptEvent {
  paymentId: string
  trigger: ReceiptTrigger
  /** The association the caller acts for; a payment outside it is not found. */
  associationId: string
}

export type PaymentReceiptStatus =
  | 'off'
  | 'sent'
  | 'already_sent'
  | 'failed'
  | 'held'
  | 'opted_out'
  | 'no_contact'
  | 'not_found'
  | 'email_not_configured'

export interface PaymentReceiptResult {
  status: PaymentReceiptStatus
  communicationId: string | null
  sent: number
  failed: number
  /** Recipients the outbound guard held back — recorded `suppressed`, not failed. */
  held: number
  /** Owners skipped because they turned off email. */
  optedOut: number
}

/** communications.related_resource.type for these rows. */
export const PAYMENT_RECEIPT_RESOURCE_TYPE = 'payment_receipt'

export function receiptCommunicationId(paymentId: string, trigger: ReceiptTrigger): string {
  return deterministicUuid(`payment-receipt:${trigger}:${paymentId}`)
}

export interface ReceiptOwner {
  userId: string | null
  name: string | null
  email: string | null
}

export interface ReceiptContext {
  association: {
    id: string
    name: string
    type: string | null
    organizationId: string
    complianceSettings: unknown
  }
  payment: {
    id: string
    amount: number
    /** yyyy-mm-dd in the association's zone. */
    paidDay: string
    method: string | null
    unitId: string | null
  }
  propertyLabel: string | null
  /** Remaining balance on the property; null when the ledger couldn't be read in full. */
  balance: number | null
  /** The property's current owners (ownerships with no valid_to). */
  owners: ReceiptOwner[]
}

export interface ReceiptClaim {
  id: string
  organizationId: string
  associationId: string
  subject: string
  html: string
  text: string
  paymentId: string
  unitId: string | null
  trigger: ReceiptTrigger
  recipientCount: number
}

/** Reads and writes THROW on error; the runner turns that into 'failed'. */
export interface PaymentReceiptStore {
  /** null when the payment is gone or not readable. */
  loadContext(paymentId: string): Promise<ReceiptContext | null>
  /** resident_communication_preferences.email_opt_in; true when the owner has no row (the table's default). */
  emailOptIn(organizationId: string, userId: string): Promise<boolean>
  orgSandbox(organizationId: string): Promise<boolean>
  claim(input: ReceiptClaim): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipient(
    communicationId: string,
    organizationId: string,
    r: { userId: string | null; unitId: string | null; name: string | null; email: string },
  ): Promise<{ id: string }>
  markRecipient(id: string, outcome: ResidentRecipientOutcome, renderedSubject: string): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed' | 'cancelled'): Promise<void>
}

export type PaymentReceiptDeps = Pick<ResidentNotifyDeps, 'sendEmail' | 'emailConfigured' | 'settingsSecret' | 'portalUrl'>

/** The resident portal page the receipt links to: the owner's own ledger. */
export const RECEIPT_PORTAL_PATH = '/resident/dues/ledger'

const errName = (err: unknown) => (err instanceof Error ? err.name : 'unknown')

function result(
  status: PaymentReceiptStatus,
  communicationId: string | null = null,
  counts: { sent?: number; failed?: number; held?: number; optedOut?: number } = {},
): PaymentReceiptResult {
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

export async function runPaymentReceipt(
  store: PaymentReceiptStore,
  deps: PaymentReceiptDeps,
  event: PaymentReceiptEvent,
  logger: NotifyLogger,
): Promise<PaymentReceiptResult> {
  const communicationId = receiptCommunicationId(event.paymentId, event.trigger)
  const tag = `[payment-receipt] ${event.trigger} ${event.paymentId}`
  try {
    const ctx = await store.loadContext(event.paymentId)
    if (!ctx || ctx.association.id !== event.associationId) {
      logger.warn(`${tag}: payment not found in this association; nothing sent`)
      return result('not_found')
    }
    const { association, payment } = ctx
    if (
      event.trigger === 'auto' &&
      !paymentReceiptsOn(association.id, association.complianceSettings, deps.settingsSecret())
    ) {
      return result('off')
    }

    // One email per address: co-owners on one row, or one person on two
    // ownership rows, get one receipt each.
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
    if (recipients.length === 0) {
      return result(optedOut > 0 ? 'opted_out' : 'no_contact', null, { optedOut })
    }
    // The transport no-ops and reports success without its key: don't
    // claim, so the payment isn't marked receipted with nothing sent.
    if (!deps.emailConfigured()) {
      logger.warn(`${tag}: email delivery is not configured`)
      return result('email_not_configured', null, { optedOut })
    }

    const receipt = renderPaymentReceiptEmail({
      associationName: association.name,
      amount: payment.amount,
      paidDay: payment.paidDay,
      method: payment.method,
      propertyLabel: ctx.propertyLabel,
      balance: ctx.balance,
      portalUrl: deps.portalUrl(RECEIPT_PORTAL_PATH),
    })
    const claim = await store.claim({
      id: communicationId,
      organizationId: association.organizationId,
      associationId: association.id,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      paymentId: payment.id,
      unitId: payment.unitId,
      trigger: event.trigger,
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
      const orgSandbox = await store.orgSandbox(association.organizationId)
      const opts = { orgSandbox, ref: communicationId }
      const senderName = buildSenderName(association.name, association.type) || null
      for (const r of recipients) {
        let outcome: ResidentRecipientOutcome = { status: 'failed', error: 'not attempted' }
        const row = await store.insertRecipient(communicationId, association.organizationId, {
          userId: r.userId,
          unitId: payment.unitId,
          name: r.name,
          email: r.email,
        })
        try {
          const res = await deps.sendEmail(
            {
              to: r.email,
              subject: receipt.subject,
              html: receipt.html,
              text: receipt.text,
              senderName,
              recipientRef: row.id,
            },
            opts,
          )
          outcome = res.ok ? { status: 'sent', externalId: res.messageId } : failure(res.error)
        } catch (err) {
          outcome = { status: 'failed', error: errName(err) }
        }
        if (outcome.status === 'sent') sent += 1
        else if (outcome.status === 'suppressed') held += 1
        else failed += 1
        await store.markRecipient(row.id, outcome, receipt.subject)
      }
    } finally {
      // All held → `cancelled`, which the communications screens read as
      // "Held by safety guard (N)" — not a failure (BL-109).
      await store.finish(communicationId, finalSendStatus({ sent, failed, held })).catch((err) => {
        logger.error(`${tag}: ${communicationId} status update failed`, { error: errName(err) })
      })
    }

    logger.info(`${tag}: ${communicationId} ${sent} sent, ${held} held, ${failed} failed`, { optedOut })
    const status: PaymentReceiptStatus = failed > 0 ? 'failed' : sent > 0 ? 'sent' : held > 0 ? 'held' : 'failed'
    return result(status, communicationId, { sent, failed, held, optedOut })
  } catch (err) {
    logger.error(`${tag}: ${communicationId} failed`, { error: errName(err) })
    return result('failed', communicationId)
  }
}
