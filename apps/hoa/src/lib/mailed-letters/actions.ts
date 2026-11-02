'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M14_APPLIED } from '@homeowner-portal/db/m14'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { recordLetterMailing, recordLetterPrinted } from '@/lib/collections/letters/actions'
import { loadLetterContext, type LetterContext, type LetterRequest } from '@/lib/collections/letters/load'
import { buildLetter, letterBlocked } from '@/lib/collections/letters/model'
import { valueOf } from '@/lib/properties/estoppel/model'
import { checkAddress, guessAddress } from './address'
import { formatCents } from './cost'
import { getMailProvider, readMailPricing } from './config'
import { blanksLeft, letterDocument } from './letter-doc'
import { renderLetterPdf } from './pdf'
import { MAIL_SERVICES, type PostalAddress } from './provider'
import { previewCost, sendApprovedLetterByMail, type Preview } from './send'
import { insertMailedLetter, loadMailedLetterRecord, mailedLetterExists, updateMailedLetterTracking } from './store'
import { mailMethodFor } from './tracking'

/**
 * The server side of "Mail this letter" (BL-032), dark behind M14_APPLIED.
 *
 * Nothing here emails or texts anyone. A board member previews the cost,
 * confirms it, and only then is the letter handed to the mailing provider.
 * The page count and the PDF come from the same letter the board approved,
 * rebuilt on the server from the database; the browser supplies which
 * letter, the service, the color choice, the addresses and the confirmation.
 *
 * Order on send: the existing print step runs first (recordLetterPrinted:
 * approved, figures unchanged, state law check, collections event, audit
 * row), then the provider is called once, then the mailed_letters row is
 * written. Georgia's clocks are not touched here: they start only when a
 * delivery is recorded through recordLetterMailing, and only for certified
 * mail (mail-tracking.ts), exactly as for a hand-mailed letter.
 */

export type PreviewResult =
  | {
      ok: true
      pages: number
      preview: Preview
      home: string
      recipient: Partial<PostalAddress>
      /** True for the Georgia notices whose waiting period runs from certified delivery. */
      certifiedRecommended: boolean
    }
  | { ok: false; error: string }
export type MailResult = { ok: true; message: string } | { ok: false; error: string }

const Service = z.enum(MAIL_SERVICES)
const Base = z.object({
  propertyId: z.string().uuid(),
  approvalRequestId: z.string().uuid(),
  service: Service,
  color: z.boolean(),
})
const SendSchema = Base.extend({
  to: z.unknown(),
  from: z.unknown(),
  confirmedCents: z.number().int().min(0),
  confirmed: z.boolean(),
})

const GA_CLOCK_KINDS = new Set(['ga_fee_notice', 'ga_pre_foreclosure', 'ga_condo_pre_foreclosure'])

function revalidate(propertyId: string) {
  const id = asPropertyId(propertyId)
  revalidatePath(propertyHref(id))
  revalidatePath(propertyHref(id, { collectionsLetter: true }))
}

async function prepare(propertyId: string, approvalRequestId: string) {
  if (!M14_APPLIED) return { ok: false as const, error: 'Mailing letters from the app is not switched on yet.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false as const, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'You are not signed in.' }
  let ctx: LetterContext | null
  try {
    ctx = await loadLetterContext(supabase, gate.orgId, asPropertyId(propertyId))
  } catch {
    return { ok: false as const, error: 'Couldn’t re-check the account. Nothing was sent. Try again.' }
  }
  if (!ctx) return { ok: false as const, error: 'This property was not found.' }
  const request: LetterRequest | undefined = ctx.requests.find((r) => r.id === approvalRequestId)
  if (!request) return { ok: false as const, error: 'That letter wasn’t found for this home.' }
  if (request.status !== 'posted') return { ok: false as const, error: 'Only an approved letter can be mailed.' }
  if (!ctx.collectionCase || ctx.collectionCase.id !== request.payload.caseId) {
    return { ok: false as const, error: 'The collections case for this letter is closed, so it can’t be mailed.' }
  }
  const letter = buildLetter(ctx.input, request.payload.kind, ctx.today, ctx.events, request.payload.values)
  const blocked = letterBlocked(letter, request.payload.values, true)
  if (blocked) return { ok: false as const, error: blocked }
  const blocks = letterDocument(letter, ctx.input, request.payload.values)
  const blanks = blanksLeft(blocks)
  if (blanks.length > 0) return { ok: false as const, error: `Fill in every blank before mailing: ${blanks.join(', ')}.` }
  const rendered = await renderLetterPdf(blocks)
  return { ok: true as const, gate, supabase, user, ctx, request, letter, rendered }
}

/** Step one of the screen: the exact price of this letter, before anything is sent. */
export async function previewMailedLetter(input: z.input<typeof Base>): Promise<PreviewResult> {
  const parsed = Base.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the choices and try again.' }
  const v = parsed.data
  const pricing = readMailPricing()
  if (!pricing || !getMailProvider(pricing)) return { ok: false, error: 'Mailing is not set up yet. Print the letter and mail it yourself for now.' }
  const p = await prepare(v.propertyId, v.approvalRequestId)
  if (!p.ok) return p
  const field = (key: string) => p.letter.fields.find((f) => f.key === key)
  const owners = field('owners') ? (valueOf(field('owners')!, p.request.payload.values) ?? '') : ''
  const mailing = field('mailingAddress') ?? field('lotAddress')
  const addressText = mailing ? (valueOf(mailing, p.request.payload.values) ?? '') : ''
  const home = [p.ctx.input.address, p.ctx.input.unitNumber ? `Unit ${p.ctx.input.unitNumber}` : null].filter(Boolean).join(', ')
  return {
    ok: true,
    pages: p.rendered.pages,
    preview: previewCost(pricing, { pages: p.rendered.pages, color: v.color, service: v.service }),
    home,
    recipient: guessAddress(owners.split(/\r?\n/)[0] ?? '', addressText),
    certifiedRecommended: GA_CLOCK_KINDS.has(p.request.payload.kind),
  }
}

/** Step two: the board confirmed the price. Print step, then one provider call, then the record. */
export async function mailApprovedLetter(input: z.input<typeof SendSchema>): Promise<MailResult> {
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the choices and try again.' }
  const v = parsed.data
  if (!v.confirmed) return { ok: false, error: 'Tick the box to confirm you want this letter mailed.' }
  const to = checkAddress(v.to, 'recipient')
  if (!to.ok) return to
  const from = checkAddress(v.from, 'return')
  if (!from.ok) return from

  const pricing = readMailPricing()
  const provider = getMailProvider(pricing)
  if (!pricing || !provider) return { ok: false, error: 'Mailing is not set up yet. Print the letter and mail it yourself for now.' }
  const p = await prepare(v.propertyId, v.approvalRequestId)
  if (!p.ok) return p
  const { gate, ctx, request, rendered } = p
  if (!ctx.associationId) return { ok: false, error: 'This home has no association on file, so the mailing can’t be recorded.' }
  const associationId = ctx.associationId
  const admin = createAdminClient()

  // Refuse before the print step records anything: a stale price or a second send.
  const cost = previewCost(pricing, { pages: rendered.pages, color: v.color, service: v.service })
  if (v.confirmedCents !== cost.totalCents) return { ok: false, error: `The price is now ${formatCents(cost.totalCents)}. Look at it again before you confirm.` }
  try {
    if (await mailedLetterExists(admin, gate.orgId, request.id)) return { ok: false, error: 'This letter was already sent by mail.' }
  } catch {
    return { ok: false, error: 'Couldn’t check whether this letter was already mailed. Nothing was sent. Try again.' }
  }

  const printed = await recordLetterPrinted({ propertyId: v.propertyId, approvalRequestId: request.id, verified: v.confirmed })
  if (!printed.ok) return printed

  const result = await sendApprovedLetterByMail(
    {
      provider,
      pricing,
      alreadySent: (id) => mailedLetterExists(admin, gate.orgId, id),
      insert: (row) => insertMailedLetter(admin, row),
      log: (msg, fields) => console.error(msg, fields),
    },
    {
      letter: {
        organizationId: gate.orgId,
        associationId,
        approvalRequestId: request.id,
        collectionCaseId: request.payload.caseId,
        approvalStatus: request.status,
      },
      request: { to: to.address, from: from.address, pdf: rendered.pdf, pages: rendered.pages, color: v.color, service: v.service },
      confirmedCents: v.confirmedCents,
      confirmed: v.confirmed,
      userId: p.user.id,
    },
  )
  revalidate(v.propertyId)
  return result.ok ? { ok: true, message: `${result.message} The status will show on the letter.` } : result
}

const RefreshSchema = z.object({ propertyId: z.string().uuid(), approvalRequestId: z.string().uuid() })

/**
 * Ask the provider where a mailed letter is. When a mailed or delivered day
 * is new, it goes on the collections case through recordLetterMailing, the
 * same step a hand-entered record uses (M7_APPLIED), so Georgia's clocks
 * count from delivery and only for certified mail, as before.
 */
export async function refreshMailedLetter(input: z.input<typeof RefreshSchema>): Promise<MailResult> {
  if (!M14_APPLIED) return { ok: false, error: 'Mailing letters from the app is not switched on yet.' }
  const parsed = RefreshSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That letter isn’t valid.' }
  const v = parsed.data
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  const pricing = readMailPricing()
  const provider = getMailProvider(pricing)
  if (!provider) return { ok: false, error: 'Mailing is not set up yet.' }

  const supabase = await getSupabaseServerClient()
  let ctx: LetterContext | null
  try {
    ctx = await loadLetterContext(supabase, gate.orgId, asPropertyId(v.propertyId))
  } catch {
    return { ok: false, error: 'Couldn’t check the letter. Try again.' }
  }
  if (!ctx?.requests.some((r) => r.id === v.approvalRequestId)) return { ok: false, error: 'That letter wasn’t found for this home.' }

  const admin = createAdminClient()
  let row
  try {
    row = await loadMailedLetterRecord(admin, gate.orgId, v.approvalRequestId)
  } catch {
    return { ok: false, error: 'Couldn’t read the mailing record. Try again.' }
  }
  if (!row?.providerLetterId) return { ok: false, error: 'This letter has not been mailed from the app.' }
  if (row.provider !== provider.name) return { ok: false, error: 'This letter was sent through a different mailing service than the one set up now.' }

  let update
  try {
    update = await provider.track(row.providerLetterId)
  } catch {
    return { ok: false, error: 'The mailing service didn’t answer. Try again later.' }
  }
  if (!(await updateMailedLetterTracking(admin, gate.orgId, v.approvalRequestId, update))) {
    return { ok: false, error: 'Couldn’t save the new status. Try again.' }
  }

  const newDay = (update.mailedOn && update.mailedOn !== row.mailedOn) || (update.deliveredOn && update.deliveredOn !== row.deliveredOn)
  if (M7_APPLIED && newDay) {
    const mail = await recordLetterMailing({
      propertyId: v.propertyId,
      approvalRequestId: v.approvalRequestId,
      mailMethod: mailMethodFor(row.mailService),
      ...(update.trackingNumber ? { trackingNumber: update.trackingNumber } : {}),
      ...(update.mailedOn ? { mailedOn: update.mailedOn } : {}),
      ...(update.status === 'delivered' && update.deliveredOn ? { deliveredOn: update.deliveredOn } : {}),
    })
    if (!mail.ok) {
      revalidate(v.propertyId)
      return { ok: false, error: `Status updated, but it couldn’t be added to the collections case: ${mail.error}` }
    }
  }
  revalidate(v.propertyId)
  return { ok: true, message: 'Status updated.' }
}
