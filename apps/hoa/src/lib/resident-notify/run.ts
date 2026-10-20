/**
 * BL-082 — tell the resident when the board decides their ARC application
 * or replies to their ticket. The runner: pure apart from what is injected.
 *
 *   1. load     the application / ticket, its association and resident
 *   2. gate     the association's signed "Notify residents of decisions and
 *               replies" setting (settings.ts) — OFF unless a board saved ON
 *   3. channels email unless the resident opted out
 *               (resident_communication_preferences.email_opt_in); SMS only
 *               when they opted IN (sms_opt_in) and SMS is configured
 *   4. claim    a communications row whose id is deterministic per event
 *               (notificationCommunicationId); a primary-key conflict means
 *               this event was already handled and nothing is sent
 *               (at-most-once, the dues-reminder / vendor-COI pattern)
 *   5. send     through the injected GUARDED senders (apps/hoa's sendEmail /
 *               sendSms → outbound-guard, BL-004) with the org's sandbox flag
 *               and the communication id as the guard's ref
 *
 * Never throws: every failure comes back as `status: 'failed'` so the
 * board's action — already saved — is never undone or blocked by it.
 * Logs carry ids and counts only — never an address, a name, a subject or
 * a body.
 */

import { createHash } from 'node:crypto'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { deterministicUuid } from '@homeowner-portal/jobs/deterministic-id'
import { buildSenderName } from '@/lib/email/sender-name'
import { phoneIsConsented } from '@/lib/sms-consent-ledger'
import { renderArcDecisionEmail, renderTicketReplyEmail, type ArcNoticeKind, type RenderedNotice } from './render'
import { residentNotificationsOn } from './settings'

// ─── events ─────────────────────────────────────────────────────────

export type ResidentNotifyEvent =
  | {
      kind: 'arc_decision'
      arcId: string
      decision: Exclude<ArcNoticeKind, 'more_info'>
      /** The board-edited decision letter (arc_requests.board_response). */
      letter: string | null
    }
  | { kind: 'arc_info_request'; arcId: string; messageId: string; message: string }
  | { kind: 'ticket_reply'; ticketId: string; messageId: string; reply: string }

/** What the board is told. Only 'failed' is a problem. */
export type ResidentNotifyStatus = 'off' | 'sent' | 'already_sent' | 'failed' | 'opted_out' | 'no_contact'

export interface ResidentNotifyResult {
  status: ResidentNotifyStatus
  communicationId: string | null
  sent: number
  failed: number
}

/** communications.related_resource.type for these rows. */
export const RESIDENT_NOTICE_RESOURCE_TYPE = 'resident_notice'

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32)
}

/**
 * The event's identity. A decision is identified by what the resident would
 * receive — the same decision with the same letter saved twice is one
 * event; an edited letter is a new one. A message is identified by its row.
 */
export function notificationEventKey(e: ResidentNotifyEvent): string {
  if (e.kind === 'arc_decision') return `arc-decision:${e.arcId}:${e.decision}:${sha((e.letter ?? '').trim())}`
  if (e.kind === 'arc_info_request') return `arc-info:${e.arcId}:${e.messageId}`
  return `ticket-reply:${e.ticketId}:${e.messageId}`
}

export function notificationCommunicationId(e: ResidentNotifyEvent): string {
  return deterministicUuid(`resident-notify:${notificationEventKey(e)}`)
}

function subjectRowId(e: ResidentNotifyEvent): string {
  return e.kind === 'ticket_reply' ? e.ticketId : e.arcId
}

// ─── deps & store ───────────────────────────────────────────────────

type SendOpts = { orgSandbox?: boolean; ref?: string }

export interface ResidentNotifyDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (
    input: { to: string; subject: string; html: string; text: string; senderName?: string | null; recipientRef?: string | null },
    opts: SendOpts,
  ) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>
  /** A guarded sender — in production, apps/hoa's `sendSms`. */
  sendSms: (
    input: { to: string; body: string },
    opts: SendOpts,
  ) => Promise<{ ok: true; messageSid: string | null } | { ok: false; error: string }>
  /** False when the transport would no-op and report success. */
  emailConfigured: () => boolean
  smsConfigured: () => boolean
  /** The server-only secret the setting is signed with. */
  settingsSecret: () => string | null
  /** Absolute URL for an app path. */
  portalUrl: (path: string) => string
}

export interface NotifyContext {
  association: { id: string; name: string; type: string | null; organizationId: string; complianceSettings: unknown }
  /** `phone` may be left null here; the runner asks loadPhone only when a text could go out. */
  resident: { userId: string; unitId: string | null; name: string | null; email: string | null; phone: string | null }
  /** The application summary or the ticket subject. */
  title: string
}

export interface ResidentNotifyClaim {
  id: string
  organizationId: string
  associationId: string
  category: 'arc' | 'custom'
  subject: string
  html: string
  text: string
  channels: Array<'email' | 'sms'>
  residentUserId: string
  audienceSummary: string
  relatedResource: Record<string, unknown>
}

export type ResidentRecipientOutcome =
  | { status: 'sent'; externalId: string | null }
  | { status: 'suppressed' | 'failed'; error: string }

/** Reads and writes THROW on error; the runner turns that into 'failed'. */
export interface ResidentNotifyStore {
  /** null when the application / ticket is gone. */
  loadContext(event: ResidentNotifyEvent): Promise<NotifyContext | null>
  /** Defaults when the resident has no row: email on, SMS off. */
  loadPreferences(
    organizationId: string,
    userId: string,
  ): Promise<{
    email: boolean
    sms: boolean
    /** BL-111: SHA-256s of the numbers the latest consent covers; absent = none. */
    smsPhones?: ReadonlySet<string>
  }>
  /** The resident's phone from their current ownership or tenancy, or null. */
  loadPhone(userId: string, unitId: string | null): Promise<string | null>
  orgSandbox(organizationId: string): Promise<boolean>
  claim(input: ResidentNotifyClaim): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipient(
    communicationId: string,
    organizationId: string,
    r: {
      channel: 'email' | 'sms'
      userId: string
      unitId: string | null
      name: string | null
      email: string | null
      phone: string | null
    },
  ): Promise<{ id: string }>
  markRecipient(id: string, outcome: ResidentRecipientOutcome, renderedSubject: string): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed'): Promise<void>
}

export interface NotifyLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void
  warn: (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
}

// ─── running ────────────────────────────────────────────────────────

function render(event: ResidentNotifyEvent, ctx: NotifyContext, deps: ResidentNotifyDeps): RenderedNotice {
  const common = { associationName: ctx.association.name, residentName: ctx.resident.name }
  if (event.kind === 'ticket_reply') {
    return renderTicketReplyEmail({
      ...common,
      ticketSubject: ctx.title,
      reply: event.reply,
      portalUrl: deps.portalUrl(`/resident/tickets/${event.ticketId}`),
    })
  }
  return renderArcDecisionEmail({
    ...common,
    applicationSummary: ctx.title,
    kind: event.kind === 'arc_info_request' ? 'more_info' : event.decision,
    letter: event.kind === 'arc_info_request' ? event.message : event.letter,
    portalUrl: deps.portalUrl(`/resident/arc/${event.arcId}`),
  })
}

const errName = (err: unknown) => (err instanceof Error ? err.name : 'unknown')

function result(status: ResidentNotifyStatus, communicationId: string | null = null, sent = 0, failed = 0): ResidentNotifyResult {
  return { status, communicationId, sent, failed }
}

export async function runResidentNotification(
  store: ResidentNotifyStore,
  deps: ResidentNotifyDeps,
  event: ResidentNotifyEvent,
  logger: NotifyLogger,
): Promise<ResidentNotifyResult> {
  const communicationId = notificationCommunicationId(event)
  const tag = `[resident-notify] ${event.kind} ${subjectRowId(event)}`
  try {
    const ctx = await store.loadContext(event)
    if (!ctx) {
      logger.warn(`${tag}: could not load the record; nothing sent`)
      return result('failed')
    }
    const { association, resident } = ctx
    if (!residentNotificationsOn(association.id, association.complianceSettings, deps.settingsSecret())) {
      return result('off')
    }

    const prefs = await store.loadPreferences(association.organizationId, resident.userId)
    const wantEmail = prefs.email && !!resident.email
    // The phone is looked up only when a text could actually go out.
    if (prefs.sms && deps.smsConfigured() && !resident.phone) {
      resident.phone = await store.loadPhone(resident.userId, resident.unitId)
    }
    // BL-111: only to a number the resident's latest consent covers; a
    // changed number (or a pre-consent-record opt-in) gets no text.
    const wantSms = prefs.sms && !!resident.phone && phoneIsConsented(prefs.smsPhones, resident.phone) && deps.smsConfigured()
    if (!wantEmail && !wantSms) {
      return result(resident.email && !prefs.email ? 'opted_out' : 'no_contact')
    }
    const channels: Array<'email' | 'sms'> = []
    if (wantEmail) {
      if (deps.emailConfigured()) channels.push('email')
      else logger.warn(`${tag}: email delivery is not configured`)
    }
    if (wantSms) channels.push('sms')
    // Nothing deliverable: don't claim, so the event isn't marked done
    // with nothing sent.
    if (channels.length === 0) return result('failed')

    const notice = render(event, ctx, deps)
    const claim = await store.claim({
      id: communicationId,
      organizationId: association.organizationId,
      associationId: association.id,
      category: event.kind === 'ticket_reply' ? 'custom' : 'arc',
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
      channels,
      residentUserId: resident.userId,
      audienceSummary: event.kind === 'ticket_reply' ? 'Ticket reply: 1 resident' : 'ARC decision: 1 resident',
      relatedResource: {
        type: RESIDENT_NOTICE_RESOURCE_TYPE,
        id: subjectRowId(event),
        event: event.kind,
        auto: true,
      },
    })
    if (!claim.ok) {
      logger.info(`${tag}: ${communicationId} already handled`)
      return result('already_sent', communicationId)
    }

    let sent = 0
    let failed = 0
    try {
      const orgSandbox = await store.orgSandbox(association.organizationId)
      const opts = { orgSandbox, ref: communicationId }
      for (const channel of channels) {
        let outcome: ResidentRecipientOutcome = { status: 'failed', error: 'not attempted' }
        const row = await store.insertRecipient(communicationId, association.organizationId, {
          channel,
          userId: resident.userId,
          unitId: resident.unitId,
          name: resident.name,
          email: channel === 'email' ? resident.email : null,
          phone: channel === 'sms' ? resident.phone : null,
        })
        try {
          if (channel === 'email') {
            const res = await deps.sendEmail(
              {
                to: resident.email!,
                subject: notice.subject,
                html: notice.html,
                text: notice.text,
                senderName: buildSenderName(association.name, association.type) || null,
                recipientRef: row.id,
              },
              opts,
            )
            outcome = res.ok ? { status: 'sent', externalId: res.messageId } : failure(res.error)
          } else {
            const res = await deps.sendSms({ to: resident.phone!, body: notice.sms }, opts)
            outcome = res.ok ? { status: 'sent', externalId: res.messageSid } : failure(res.error)
          }
        } catch (err) {
          outcome = { status: 'failed', error: errName(err) }
        }
        if (outcome.status === 'sent') sent += 1
        else failed += 1
        await store.markRecipient(row.id, outcome, notice.subject)
      }
    } finally {
      await store.finish(communicationId, sent > 0 ? 'sent' : 'failed').catch((err) => {
        logger.error(`${tag}: ${communicationId} status update failed`, { error: errName(err) })
      })
    }

    logger.info(`${tag}: ${communicationId} ${sent} sent, ${failed} failed`, { channels: channels.length })
    return result(failed === 0 && sent > 0 ? 'sent' : 'failed', communicationId, sent, failed)
  } catch (err) {
    logger.error(`${tag}: ${communicationId} failed`, { error: errName(err) })
    return result('failed', communicationId)
  }
}

function failure(error: string): ResidentRecipientOutcome {
  return error === OUTBOUND_BLOCKED_ERROR ? { status: 'suppressed', error } : { status: 'failed', error: error.slice(0, 500) }
}
