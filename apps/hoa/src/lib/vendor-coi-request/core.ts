// "Request updated certificate" (BL-083) — the logic, with its IO injected
// so it is testable without a database or a mail provider.
//
// Owner rule 2026-10-20: no automatic email to anyone outside the board.
// This is the ONE way a COI email reaches a vendor, and only because a
// board member or admin reviewed the draft and clicked Send:
//
//   - the recipient is the vendor's own primary_email, read server-side
//     from the vendors row in the caller's org. It is never taken from the
//     client, so this path cannot be pointed at a resident or anyone else.
//   - the send goes through the app's guarded sendEmail (BL-004) with the
//     org's sandbox flag.
//   - a communications row + recipient row record it, and the recipient
//     row is the Message-ID, so the vendor's reply threads back (BL-086).
//   - logs carry ids and codes only — never the address, name or text.

import { z } from 'zod'
import { insuranceRequirementLines, resolveVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import { coiDaysLeft, coiExpiryState, draftCoiRequest, coiRequestHtml, type CoiExpiryState } from '@homeowner-portal/workflows/vendor-coi'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { COI_REQUEST_BODY_MAX, COI_REQUEST_SUBJECT_MAX } from './limits'

/** communications.related_resource.type for these rows. */
export const COI_REQUEST_RESOURCE_TYPE = 'vendor_coi_request'

export { COI_REQUEST_BODY_MAX, COI_REQUEST_SUBJECT_MAX }

export const CoiRequestInput = z.object({
  vendorId: z.string().uuid(),
  subject: z.string().trim().min(1, 'Add a subject.').max(COI_REQUEST_SUBJECT_MAX, 'The subject is too long.'),
  body: z.string().trim().min(1, 'Add a message.').max(COI_REQUEST_BODY_MAX, 'The message is too long.'),
})
export type CoiRequestInput = z.infer<typeof CoiRequestInput>

export interface CoiVendor {
  id: string
  legalName: string
  primaryEmail: string | null
}

export interface CoiAssociationInfo {
  id: string
  name: string
  complianceSettings: unknown
  /** The association's calendar day, YYYY-MM-DD (BL-043). */
  today: string
}

export type CoiRecipientOutcome =
  | { status: 'sent'; externalId: string | null }
  | { status: 'suppressed' | 'failed'; error: string }

/** Reads THROW on a failed query (code only); null means "not there". */
export interface CoiRequestStore {
  /** The vendor in the caller's org, not deleted; null otherwise. */
  loadVendor(vendorId: string): Promise<CoiVendor | null>
  loadAssociation(): Promise<CoiAssociationInfo | null>
  loadCoiExpiration(vendorId: string, associationId: string): Promise<string | null>
  orgSandbox(): Promise<boolean>
  /** Inserts the communications row (status 'sending') and its one recipient row. */
  record(input: {
    associationId: string
    vendorId: string
    to: string
    vendorName: string
    subject: string
    html: string
    text: string
  }): Promise<{ communicationId: string; recipientId: string }>
  markRecipient(recipientId: string, outcome: CoiRecipientOutcome): Promise<void>
  /** `cancelled` = the outbound guard held the email back (finalSendStatus):
   *  the communications screens read it as "Held by safety guard (1)". */
  finish(communicationId: string, status: 'sent' | 'failed' | 'cancelled'): Promise<void>
}

export type CoiSender = (
  input: { to: string; subject: string; html: string; text: string; senderName?: string | null; recipientRef?: string | null },
  opts: { orgSandbox?: boolean; ref?: string },
) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>

export interface CoiLog {
  error: (msg: string, ctx: Record<string, unknown>) => void
}

/** What the vendor page shows in the review dialog. */
export interface CoiRequestDraft {
  vendorId: string
  vendorName: string
  /** The vendor's address on file — shown, never editable. */
  to: string | null
  subject: string
  body: string
  expiresOn: string | null
  /** Calendar days to expiry on the association's day; negative once expired. */
  daysLeft: number | null
  state: CoiExpiryState | null
}

export type CoiDraftResult = { ok: true; data: CoiRequestDraft } | { ok: false; reason: 'not_found' | 'failed' }

export const COI_REQUEST_ERRORS = {
  notFound: 'That vendor no longer exists.',
  noEmail: 'This vendor has no email on file. Add one under More vendor actions → Edit details first.',
  noAssociation: 'No association is set up for this organization yet.',
  failed: 'Couldn’t send the request. Try again.',
  blocked: 'Sending to this address is blocked by the outbound safety guard (sandbox or test environment). Nothing was sent.',
  sendFailed: 'The email provider didn’t accept the message. Nothing was sent; try again later.',
} as const

const errName = (err: unknown) => (err instanceof Error ? err.name : 'unknown')

export async function buildCoiRequestDraft(store: CoiRequestStore, vendorId: string, log: CoiLog): Promise<CoiDraftResult> {
  try {
    const vendor = await store.loadVendor(vendorId)
    if (!vendor) return { ok: false, reason: 'not_found' }
    const association = await store.loadAssociation()
    if (!association) return { ok: false, reason: 'failed' }
    const expiresOn = await store.loadCoiExpiration(vendorId, association.id)
    const settings = resolveVendorInsuranceSettings(association.id, association.complianceSettings)
    const draft = draftCoiRequest({
      associationName: association.name,
      vendorName: vendor.legalName,
      expiresOn,
      today: association.today,
      requirementLines: insuranceRequirementLines(settings.minimums),
    })
    return {
      ok: true,
      data: {
        vendorId: vendor.id,
        vendorName: vendor.legalName,
        to: vendor.primaryEmail,
        ...draft,
        expiresOn,
        daysLeft: expiresOn ? coiDaysLeft(expiresOn, association.today) : null,
        state: coiExpiryState(expiresOn, association.today),
      },
    }
  } catch (err) {
    log.error('[vendor-coi-request] draft failed', { vendorId, error: errName(err) })
    return { ok: false, reason: 'failed' }
  }
}

export type CoiSendResult = { ok: true } | { ok: false; error: string }

export async function sendCoiRequestCore(
  store: CoiRequestStore,
  send: CoiSender,
  input: CoiRequestInput,
  log: CoiLog,
): Promise<CoiSendResult> {
  let vendor: CoiVendor | null
  let association: CoiAssociationInfo | null
  try {
    vendor = await store.loadVendor(input.vendorId)
    association = vendor ? await store.loadAssociation() : null
  } catch (err) {
    log.error('[vendor-coi-request] load failed', { vendorId: input.vendorId, error: errName(err) })
    return { ok: false, error: COI_REQUEST_ERRORS.failed }
  }
  if (!vendor) return { ok: false, error: COI_REQUEST_ERRORS.notFound }
  const to = vendor.primaryEmail?.trim()
  if (!to) return { ok: false, error: COI_REQUEST_ERRORS.noEmail }
  if (!association) return { ok: false, error: COI_REQUEST_ERRORS.noAssociation }

  const html = coiRequestHtml(input.body)
  let ids: { communicationId: string; recipientId: string }
  let orgSandbox: boolean
  try {
    orgSandbox = await store.orgSandbox()
    ids = await store.record({
      associationId: association.id,
      vendorId: vendor.id,
      to,
      vendorName: vendor.legalName,
      subject: input.subject,
      html,
      text: input.body,
    })
  } catch (err) {
    log.error('[vendor-coi-request] record failed', { vendorId: vendor.id, error: errName(err) })
    return { ok: false, error: COI_REQUEST_ERRORS.failed }
  }

  let outcome: CoiRecipientOutcome = { status: 'failed', error: 'not attempted' }
  try {
    const res = await send(
      { to, subject: input.subject, html, text: input.body, senderName: association.name, recipientRef: ids.recipientId },
      { orgSandbox, ref: ids.communicationId },
    )
    if (res.ok) outcome = { status: 'sent', externalId: res.messageId }
    else if (res.error === OUTBOUND_BLOCKED_ERROR) outcome = { status: 'suppressed', error: res.error }
    // Stored on the recipient row (board-visible), never logged: provider
    // text can carry the address.
    else outcome = { status: 'failed', error: res.error.slice(0, 500) }
  } catch (err) {
    outcome = { status: 'failed', error: errName(err) }
  }

  try {
    await store.markRecipient(ids.recipientId, outcome)
    // `suppressed` here is only ever the guard's hold. A held request is
    // not a failure (BL-109): it finishes `cancelled`, never `failed`.
    await store.finish(
      ids.communicationId,
      finalSendStatus({
        sent: outcome.status === 'sent' ? 1 : 0,
        failed: outcome.status === 'failed' ? 1 : 0,
        held: outcome.status === 'suppressed' ? 1 : 0,
      }),
    )
  } catch (err) {
    // The email's fate is already decided; a bookkeeping miss is logged,
    // not reported as a failed send (a retry would email the vendor twice).
    log.error('[vendor-coi-request] status update failed', {
      communicationId: ids.communicationId,
      error: errName(err),
    })
  }

  if (outcome.status === 'sent') return { ok: true }
  log.error('[vendor-coi-request] not sent', { communicationId: ids.communicationId, status: outcome.status })
  return { ok: false, error: outcome.status === 'suppressed' ? COI_REQUEST_ERRORS.blocked : COI_REQUEST_ERRORS.sendFailed }
}
