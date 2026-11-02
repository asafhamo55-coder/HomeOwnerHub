'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M14_APPLIED } from '@homeowner-portal/db/m14'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { asPropertyId, resolveUnitForProperty } from '@/lib/properties/resolve'
import { checkAddress, guessAddress } from './address'
import { formatCents } from './cost'
import { getMailProvider, readMailPricing } from './config'
import { renderLetterPdf } from './pdf'
import { MAIL_SERVICES } from './provider'
import { previewCost, sendApprovedLetterByMail, type LetterSource } from './send'
import { insertMailedLetter, loadMailedLetterRecord, mailedLetterExists, updateMailedLetterTracking } from './store'
import { violationLetterBlocks, violationMailBlock } from './violation-letter'
import type { MailResult, PreviewResult } from './actions'

/**
 * Mail a violation's approved notice (BL-032), dark behind M14_APPLIED.
 *
 * The same preview, confirm and send steps as a collections letter
 * (./actions.ts), with one difference in the source: a violation notice has
 * no approval request, so it is sent under the violation's id and the
 * mailed_letters row carries violation_id instead of approval_request_id.
 * The text is the notice as approved (hoa_violations.approved_letter), read
 * on the server; the browser supplies only which violation, the service, the
 * color choice, the addresses and the confirmation. Nothing is emailed or
 * texted. There is no collections case, so no Georgia clock is touched.
 */

const Base = z.object({
  violationId: z.string().uuid(),
  service: z.enum(MAIL_SERVICES),
  color: z.boolean(),
})
const SendSchema = Base.extend({
  to: z.unknown(),
  from: z.unknown(),
  confirmedCents: z.number().int().min(0),
  confirmed: z.boolean(),
})

type PropertyRow = { address: string | null; unit_number: string | null; owner_name: string | null }
type ViolationRow = {
  id: string
  status: string
  approved_letter: string | null
  approved_at: string | null
  property_id: string | null
  property: PropertyRow | PropertyRow[] | null
}

const NOT_ON = 'Mailing letters from the app is not switched on yet.'
const NOT_SET_UP = 'Mailing is not set up yet. Print the letter and mail it yourself for now.'

async function prepare(violationId: string) {
  if (!M14_APPLIED) return { ok: false as const, error: NOT_ON }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false as const, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'You are not signed in.' }

  // The row is filtered to the caller's organization, so another org's id is "not found".
  const { data, error } = await supabase
    .from('hoa_violations')
    .select('id, status, approved_letter, approved_at, property_id, property:hoa_properties(address, unit_number, owner_name)')
    .eq('id', violationId)
    .eq('org_id', gate.orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false as const, error: 'Couldn’t re-check the violation. Nothing was sent. Try again.' }
  const v = data as unknown as ViolationRow | null
  if (!v) return { ok: false as const, error: 'That violation wasn’t found.' }
  const blocked = violationMailBlock(v)
  if (blocked) return { ok: false as const, error: blocked }
  if (!v.property_id) return { ok: false as const, error: 'This violation has no home on file, so the mailing can’t be recorded.' }

  // The association comes from the home's unit, never from the browser.
  let associationId: string | null = null
  try {
    const res = await resolveUnitForProperty(supabase, gate.orgId, asPropertyId(v.property_id))
    if (res.unitId) {
      const { data: unit, error: uErr } = await supabase
        .from('units')
        .select('association_id')
        .eq('id', res.unitId)
        .eq('organization_id', gate.orgId)
        .maybeSingle()
      if (uErr) throw uErr
      associationId = (unit as { association_id: string | null } | null)?.association_id ?? null
    }
  } catch {
    return { ok: false as const, error: 'Couldn’t re-check the home. Nothing was sent. Try again.' }
  }
  if (!associationId) return { ok: false as const, error: 'This home has no association on file, so the mailing can’t be recorded.' }

  const rendered = await renderLetterPdf(violationLetterBlocks(v.approved_letter!))
  const property = Array.isArray(v.property) ? (v.property[0] ?? null) : v.property
  return { ok: true as const, gate, user, rendered, associationId, property }
}

/** Step one: the exact price of this notice, before anything is sent. */
export async function previewMailedViolationLetter(input: z.input<typeof Base>): Promise<PreviewResult> {
  const parsed = Base.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the choices and try again.' }
  const v = parsed.data
  const pricing = readMailPricing()
  if (!pricing || !getMailProvider(pricing)) return { ok: false, error: NOT_SET_UP }
  const p = await prepare(v.violationId)
  if (!p.ok) return p
  const home = [p.property?.address, p.property?.unit_number ? `Unit ${p.property.unit_number}` : null].filter(Boolean).join(', ')
  return {
    ok: true,
    pages: p.rendered.pages,
    preview: previewCost(pricing, { pages: p.rendered.pages, color: v.color, service: v.service }),
    home,
    recipient: guessAddress(p.property?.owner_name ?? '', p.property?.address ?? ''),
    certifiedRecommended: false,
  }
}

/** Step two: the board confirmed the price. One provider call, then the record. */
export async function mailViolationLetter(input: z.input<typeof SendSchema>): Promise<MailResult> {
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
  if (!pricing || !provider) return { ok: false, error: NOT_SET_UP }
  const p = await prepare(v.violationId)
  if (!p.ok) return p
  const { gate, rendered } = p
  const source: LetterSource = { kind: 'violation', violationId: v.violationId }
  const admin = createAdminClient()

  // Refuse before anything is sent: a stale price or a second send.
  const cost = previewCost(pricing, { pages: rendered.pages, color: v.color, service: v.service })
  if (v.confirmedCents !== cost.totalCents) return { ok: false, error: `The price is now ${formatCents(cost.totalCents)}. Look at it again before you confirm.` }
  try {
    if (await mailedLetterExists(admin, gate.orgId, source)) return { ok: false, error: 'This letter was already sent by mail.' }
  } catch {
    return { ok: false, error: 'Couldn’t check whether this letter was already mailed. Nothing was sent. Try again.' }
  }

  const result = await sendApprovedLetterByMail(
    {
      provider,
      pricing,
      alreadySent: (s) => mailedLetterExists(admin, gate.orgId, s),
      insert: (row) => insertMailedLetter(admin, row),
      log: (msg, fields) => console.error(msg, fields),
    },
    {
      letter: { organizationId: gate.orgId, associationId: p.associationId, source, collectionCaseId: null, approved: true },
      request: { to: to.address, from: from.address, pdf: rendered.pdf, pages: rendered.pages, color: v.color, service: v.service },
      confirmedCents: v.confirmedCents,
      confirmed: v.confirmed,
      userId: p.user.id,
    },
  )
  revalidatePath(`/violations/${v.violationId}`)
  return result.ok ? { ok: true, message: `${result.message} The status will show on the violation.` } : result
}

const RefreshSchema = z.object({ violationId: z.string().uuid() })

/** Ask the provider where a mailed notice is, and save the answer. */
export async function refreshMailedViolationLetter(input: z.input<typeof RefreshSchema>): Promise<MailResult> {
  if (!M14_APPLIED) return { ok: false, error: NOT_ON }
  const parsed = RefreshSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That violation isn’t valid.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  const pricing = readMailPricing()
  const provider = getMailProvider(pricing)
  if (!provider) return { ok: false, error: 'Mailing is not set up yet.' }

  const source: LetterSource = { kind: 'violation', violationId: parsed.data.violationId }
  const admin = createAdminClient()
  let row
  try {
    row = await loadMailedLetterRecord(admin, gate.orgId, source)
  } catch {
    return { ok: false, error: 'Couldn’t read the mailing record. Try again.' }
  }
  if (!row?.providerLetterId) return { ok: false, error: 'This notice has not been mailed from the app.' }
  if (row.provider !== provider.name) return { ok: false, error: 'This letter was sent through a different mailing service than the one set up now.' }

  let update
  try {
    update = await provider.track(row.providerLetterId)
  } catch {
    return { ok: false, error: 'The mailing service didn’t answer. Try again later.' }
  }
  if (!(await updateMailedLetterTracking(admin, gate.orgId, source, update))) {
    return { ok: false, error: 'Couldn’t save the new status. Try again.' }
  }
  revalidatePath(`/violations/${parsed.data.violationId}`)
  return { ok: true, message: 'Status updated.' }
}
