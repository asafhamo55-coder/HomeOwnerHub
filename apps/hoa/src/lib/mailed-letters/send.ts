/**
 * BL-032: send one approved letter by print-and-mail. Dark behind M14_APPLIED.
 *
 * The rules, all enforced here and not left to a screen:
 *   - the letter must be approved ('posted') and unsent (one send per
 *     approval request);
 *   - the board member must explicitly confirm, and the amount they confirmed
 *     must equal the cost the server computes now, so a stale price never sends;
 *   - a missing provider or missing pricing refuses (no keys, no send);
 *   - the provider is called once; a provider failure records nothing and
 *     says so in plain words;
 *   - the mailed_letters row stores ids, cents and tracking only. No name,
 *     address or letter text. Logs carry ids only.
 *
 * Dependencies are injected so tests run with the fake provider and an
 * in-memory store; nothing here imports Next, Supabase or an SDK.
 */

import { M14_APPLIED } from '@homeowner-portal/db/m14'
import { costLines, formatCents, letterCostCents, type CostLine, type MailPricing } from './cost'
import type { MailLetterRequest, MailProvider, MailService, MailStatus } from './provider'

export interface MailedLetterRow {
  organizationId: string
  associationId: string
  approvalRequestId: string
  collectionCaseId: string | null
  provider: MailProvider['name']
  providerLetterId: string
  mailService: MailService
  color: boolean
  pages: number
  quotedCents: number
  confirmedCents: number
  status: MailStatus
  trackingNumber: string | null
  expectedDeliveryOn: string | null
  confirmedBy: string
}

export interface ApprovedLetter {
  organizationId: string
  associationId: string
  approvalRequestId: string
  collectionCaseId: string | null
  /** approval_requests.status */
  approvalStatus: string
}

export interface SendDeps {
  provider: MailProvider | null
  pricing: MailPricing | null
  /** Has this approval request already been mailed? */
  alreadySent(approvalRequestId: string): Promise<boolean>
  insert(row: MailedLetterRow): Promise<{ ok: true } | { ok: false }>
  log(msg: string, fields: Record<string, string | number>): void
}

export interface Preview {
  lines: CostLine[]
  totalCents: number
  totalLabel: string
}

/** What the board sees before it can confirm. */
export function previewCost(pricing: MailPricing, i: { pages: number; color: boolean; service: MailService }): Preview {
  const totalCents = letterCostCents(pricing, i)
  return { lines: costLines(pricing, i), totalCents, totalLabel: formatCents(totalCents) }
}

export interface SendInput {
  letter: ApprovedLetter
  request: Omit<MailLetterRequest, 'idempotencyKey'>
  /** The cents the board member saw and agreed to. Must equal the server's cost. */
  confirmedCents: number
  /** True only when the board member pressed the explicit send button. */
  confirmed: boolean
  userId: string
}

export type SendResult = { ok: true; message: string; totalCents: number } | { ok: false; error: string }

export async function sendApprovedLetterByMail(deps: SendDeps, input: SendInput): Promise<SendResult> {
  if (!M14_APPLIED) return { ok: false, error: 'Mailing letters from the app is not switched on yet.' }
  if (!deps.provider || !deps.pricing) {
    return { ok: false, error: 'Mailing is not set up yet. Print the letter and mail it yourself for now.' }
  }
  if (input.letter.approvalStatus !== 'posted') return { ok: false, error: 'Only an approved letter can be mailed.' }
  if (!input.confirmed) return { ok: false, error: 'Tick the box to confirm you want this letter mailed.' }
  if (!Number.isInteger(input.request.pages) || input.request.pages < 1 || input.request.pages > 60) {
    return { ok: false, error: 'This letter has an unusual page count. Check it before mailing.' }
  }

  const cost = letterCostCents(deps.pricing, input.request)
  if (input.confirmedCents !== cost) {
    return { ok: false, error: `The price is now ${formatCents(cost)}. Look at it again before you confirm.` }
  }
  if (await deps.alreadySent(input.letter.approvalRequestId)) {
    return { ok: false, error: 'This letter was already sent by mail.' }
  }

  const req: MailLetterRequest = { ...input.request, idempotencyKey: input.letter.approvalRequestId }
  let sent
  try {
    sent = await deps.provider.send(req)
  } catch {
    deps.log('[mailed-letters] provider send failed', { approvalRequestId: input.letter.approvalRequestId })
    return { ok: false, error: 'The mailing service did not accept the letter. Nothing was sent or charged. Try again later.' }
  }

  const stored = await deps.insert({
    organizationId: input.letter.organizationId,
    associationId: input.letter.associationId,
    approvalRequestId: input.letter.approvalRequestId,
    collectionCaseId: input.letter.collectionCaseId,
    provider: deps.provider.name,
    providerLetterId: sent.providerLetterId,
    mailService: input.request.service,
    color: input.request.color,
    pages: input.request.pages,
    quotedCents: cost,
    confirmedCents: input.confirmedCents,
    status: sent.status,
    trackingNumber: sent.trackingNumber,
    expectedDeliveryOn: sent.expectedDeliveryOn,
    confirmedBy: input.userId,
  })
  if (!stored.ok) {
    // The letter is in the mail. Say so, with the provider id logged, so it is not sent twice.
    deps.log('[mailed-letters] sent but not recorded', {
      approvalRequestId: input.letter.approvalRequestId,
      providerLetterId: sent.providerLetterId,
    })
    return { ok: false, error: 'The letter was sent, but we could not save the record. Do not send it again. Tell support.' }
  }
  return { ok: true, message: `Mailed. ${formatCents(cost)} will be charged.`, totalCents: cost }
}
