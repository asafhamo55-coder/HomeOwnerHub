'use server'

/**
 * BL-173: the two writes behind "New announcement".
 *
 *   sendAnnouncement      the board's explicit Send (or Schedule). A thin
 *                         wrapper that builds the same payload the full
 *                         composer builds and hands it to
 *                         sendCommunication, the one send path. Consent,
 *                         opt-outs, the outbound guard, official-notice
 *                         rules, scheduling and the audit rows all live
 *                         there and apply unchanged.
 *   dismissAnnouncementNudge
 *                         hides one seasonal suggestion for this
 *                         association (signed, no migration; see ./dismiss).
 *
 * Both are board/admin only and re-check the role: a server action is a
 * public POST endpoint. Nothing here sends on its own: a send needs
 * `confirmed: true`, which only the Send button sets. Nothing here logs
 * message text or addresses.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { smsConfigured } from '@/lib/sms'
import { sendCommunication, type SendCommunicationInput, type SendCommunicationResult } from '@/lib/communications/send'
import { loadStreetOptions } from '@/lib/communications/streets'
import { htmlToMessageText, plainTextToHtml } from '@/lib/communications/plain-text'
import { SCHEDULING_ENABLED } from '@/lib/communications/scheduling'
import { appOrigin } from '@/lib/app-origin'
import { MAX_IMAGES_PER_MESSAGE, countMarkers, dropUnresolvedMarkers, markersToImgHtml } from './inline-images'
import { getOccasion } from './occasions'
import { isNudgeKey } from './nudge'
import { NUDGE_SETTINGS_KEY, signDismissal, withDismissal } from './dismiss'

/** Plain text only; a stray {{ }} would be read as a merge field. */
function stripBraces(s: string): string {
  return s.replace(/\{\{|\}\}/g, '')
}

const Text = (max: number, min = 1) =>
  z
    .string()
    .transform(stripBraces)
    .pipe(z.string().trim().min(min).max(max))

const SendSchema = z.object({
  /** An occasion id, or 'custom' for a typed sentence. */
  occasionId: z.string().max(40),
  subject: Text(120),
  /** Plain text in the composer's editor format. */
  bodyText: Text(6000, 10),
  spanish: z
    .object({
      subject: Text(120),
      bodyText: Text(6000, 10),
      /** The board looked at the Spanish before ticking it on. */
      reviewed: z.boolean(),
    })
    .nullable()
    .optional(),
  audience: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('all') }),
    z.object({
      mode: z.literal('street'),
      streetKey: z.string().min(1).max(120),
      ownersOnly: z.boolean().optional(),
      excludeUnitIds: z.array(z.string().uuid()).max(5000).optional(),
    }),
  ]),
  /** Also text residents who opted in to texts. Ignored when texting is not set up. */
  includeText: z.boolean(),
  /** ISO instant to send later; omitted means send now. */
  scheduledFor: z.string().optional(),
  /** Only the Send button sets this. Without it nothing is sent. */
  confirmed: z.literal(true),
})

export type SendAnnouncementInput = z.input<typeof SendSchema>

export async function sendAnnouncement(input: SendAnnouncementInput): Promise<SendCommunicationResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Write a subject and a message, then press Send.' }
  }
  const v = parsed.data

  const occasion = getOccasion(v.occasionId)
  const category = occasion?.category ?? 'announcement'

  let scheduledFor: string | undefined
  if (v.scheduledFor) {
    const at = new Date(v.scheduledFor)
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'Pick a valid date and time, or choose Send now.' }
    if (!SCHEDULING_ENABLED) return { ok: false, error: 'Scheduling is coming soon.' }
    scheduledFor = at.toISOString()
  }

  let audience: SendCommunicationInput['audience'] = { kind: 'everyone' }
  const wanted = v.audience
  if (wanted.mode === 'street') {
    const assoc = await getPrimaryAssociation()
    if (!assoc) return { ok: false, error: 'No HOA association configured.' }
    const supabase = await getSupabaseServerClient()
    // The street's homes come from our own roster, never from the browser.
    const streets = await loadStreetOptions(supabase, assoc.id)
    const street = streets.find((s) => s.key === wanted.streetKey)
    if (!street) return { ok: false, error: 'That street was not found. Choose All residents or pick the street again.' }
    const allowed = new Set(street.unitIds)
    const exclude = (wanted.excludeUnitIds ?? []).filter((id) => allowed.has(id))
    audience = {
      kind: 'specific_units',
      unitIds: street.unitIds,
      street: street.label,
      ...(wanted.ownersOnly ? { ownersOnly: true } : {}),
      ...(exclude.length > 0 ? { excludeUnitIds: exclude } : {}),
    }
  }

  // Pasted images: only well-formed id markers survive, each becomes an <img>
  // on this app's own image route under the caller's org (never one the
  // browser names). Everything else the board typed stays escaped text, and
  // the text/SMS versions below are made from the finished HTML, where an
  // <img> is dropped like any tag.
  if (countMarkers(v.bodyText) > MAX_IMAGES_PER_MESSAGE || (v.spanish && countMarkers(v.spanish.bodyText) > MAX_IMAGES_PER_MESSAGE)) {
    return { ok: false, error: `Use at most ${MAX_IMAGES_PER_MESSAGE} images in a message.` }
  }
  const imageOpts = { origin: appOrigin(), orgId: gate.orgId }
  const toHtml = (text: string) => markersToImgHtml(plainTextToHtml(dropUnresolvedMarkers(text)), imageOpts)
  const bodyHtml = toHtml(v.bodyText)
  const channels: SendCommunicationInput['channels'] = ['email', 'portal']
  // Never a text channel the server cannot deliver. Who actually gets a
  // text is still decided per resident at send time (opt-in and consent).
  if (v.includeText && smsConfigured()) channels.push('sms')

  return sendCommunication({
    category,
    subject: v.subject,
    bodyHtml,
    bodyText: htmlToMessageText(bodyHtml),
    channels,
    audience,
    ...(scheduledFor ? { scheduledFor } : {}),
    ...(v.spanish
      ? {
          spanish: {
            subject: v.spanish.subject,
            bodyHtml: toHtml(v.spanish.bodyText),
            reviewed: v.spanish.reviewed,
          },
        }
      : {}),
  })
}

export type DismissNudgeResult = { ok: true } | { ok: false; error: string }

export async function dismissAnnouncementNudge(key: string): Promise<DismissNudgeResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isNudgeKey(key)) return { ok: false, error: 'That suggestion was not found.' }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This can’t be saved on this server yet. Contact support.' }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: row, error: readErr } = await supabase
    .from('associations')
    .select('compliance_settings')
    .eq('id', assoc.id)
    .maybeSingle()
  if (readErr || !row) {
    console.error('[announcement-nudge] read failed', { associationId: assoc.id, code: readErr?.code ?? 'no_rows' })
    return { ok: false, error: 'Couldn’t hide this suggestion. Try again.' }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const entry = signDismissal(assoc.id, key, { at: new Date().toISOString(), by: user?.id ?? null }, secret)
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withDismissal(row.compliance_settings, entry) as never })
    .eq('id', assoc.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values.
    console.error('[announcement-nudge] save failed', {
      associationId: assoc.id,
      setting: NUDGE_SETTINGS_KEY,
      code: error?.code ?? 'no_rows',
    })
    return { ok: false, error: 'Couldn’t hide this suggestion. Try again.' }
  }
  revalidatePath('/')
  return { ok: true }
}
