'use server'

import { z } from 'zod'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { sendEmailBatch } from '@/lib/email'
import { buildSenderName } from '@/lib/email/sender-name'
import { appUrl } from '@/lib/app-origin'
import { resolveAudience, type AudienceDefinition } from './audience'
import { composeBilingualHtml, htmlToPlainText } from './bilingual'
import { htmlToMessageText } from './plain-text'
import { SAMPLE_RESIDENT_NAME, buildPreview, type MessagePreview } from './preview'

/**
 * BL-102 A7: the composer's phone preview and "Send a test to me".
 *
 * The preview resolves the audience with the send's own resolver, takes one
 * sample recipient (the first with an email, or a synthetic "Sample
 * Resident" when there is nobody), and renders through the send's own
 * functions (./preview.ts). It sends nothing and writes nothing.
 *
 * The test send emails ONLY the signed-in board member's own address,
 * through the guarded sendEmailBatch (BL-004 outbound guard), and writes no
 * communication rows. It is never a resident send.
 *
 * Nothing here logs: a preview carries a resident's name.
 */

const AudienceSchema = z.object({
  kind: z.enum([
    'everyone',
    'owners_only',
    'tenants_only',
    'late_on_dues',
    'open_violations',
    'specific_units',
    'specific_residents',
    'board',
    'manual_emails',
  ]),
  unitIds: z.array(z.string().uuid()).max(5000).optional(),
  residentIds: z.array(z.string().uuid()).max(500).optional(),
  boardUserIds: z.array(z.string().uuid()).max(200).optional(),
  emails: z.array(z.string().max(254)).max(500).optional(),
  emailNames: z.array(z.string().max(120)).max(500).optional(),
  phones: z.array(z.string().max(20)).max(500).optional(),
  ownersOnly: z.boolean().optional(),
  street: z.string().max(120).optional(),
  // BL-146: homes unticked from a street; applied by resolveAudience.
  excludeUnitIds: z.array(z.string().uuid()).max(5000).optional(),
})

const MessageSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  bodyHtml: z.string().trim().min(1).max(100_000),
  extraFields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  spanish: z
    .object({ subject: z.string().trim().min(1).max(255), bodyHtml: z.string().trim().min(1).max(40_000) })
    .nullable()
    .optional(),
})

const PreviewInputSchema = MessageSchema.extend({ audience: AudienceSchema })

export type PreviewInput = z.input<typeof PreviewInputSchema>
export type TestSendInput = z.input<typeof MessageSchema>

export type PreviewForSampleResult =
  | ({ ok: true; sampleName: string; synthetic: boolean } & MessagePreview)
  | { ok: false; error: string }

/** Same length as a real /communications/<uuid> link, so the text's
 *  character count matches the send. */
const SAMPLE_LINK_ID = '00000000-0000-0000-0000-000000000000'

/** The body and plain text exactly as sendCommunication stores them. */
function storedBody(input: z.infer<typeof MessageSchema>): { bodyHtml: string; bodyText: string } {
  if (input.spanish) {
    const bodyHtml = composeBilingualHtml({
      englishHtml: input.bodyHtml,
      spanishSubject: input.spanish.subject,
      spanishHtml: input.spanish.bodyHtml,
    })
    return { bodyHtml, bodyText: htmlToPlainText(bodyHtml) }
  }
  return { bodyHtml: input.bodyHtml, bodyText: htmlToMessageText(input.bodyHtml) }
}

const PREVIEW_FAILED = 'Couldn’t build the preview. Try again.'

export async function previewForSample(input: PreviewInput): Promise<PreviewForSampleResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = PreviewInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Write a subject and message first.' }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()
  const { data: assocRow, error: assocErr } = await supabase
    .from('associations')
    .select('name, type')
    .eq('id', assoc.id)
    .single()
  if (assocErr || !assocRow) return { ok: false, error: PREVIEW_FAILED }

  let resolved
  try {
    resolved = await resolveAudience(supabase, assoc.id, value.audience as AudienceDefinition)
  } catch {
    return { ok: false, error: PREVIEW_FAILED }
  }
  const sample = resolved.recipients.find((r) => r.email) ?? resolved.recipients[0] ?? null
  const synthetic = !sample
  const recipient = {
    email: sample?.email ?? null,
    recipient_name: sample?.recipientName ?? SAMPLE_RESIDENT_NAME,
    unit_id: sample?.unitId ?? null,
  }

  const body = storedBody(value)
  const preview = buildPreview(recipient, {
    subject: value.subject,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    extraFields: value.extraFields,
    associationName: assocRow.name,
    senderName: buildSenderName(assocRow.name, assocRow.type),
    portalLink: appUrl(`/communications/${SAMPLE_LINK_ID}`),
  })
  return { ok: true, sampleName: recipient.recipient_name, synthetic, ...preview }
}

export type TestSendResult = { ok: true; sentTo: string } | { ok: false; error: string }

/**
 * Email the message to the signed-in board member only. The address comes
 * from their own auth session, never from the browser.
 */
export async function sendTestToMe(input: TestSendInput): Promise<TestSendResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = MessageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Write a subject and message first.' }
  const value = parsed.data

  const supabase = await getSupabaseServerClient()
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user?.email) return { ok: false, error: 'Your account has no email address to send the test to.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const { data: assocRow } = await supabase
    .from('associations')
    .select('name, type, organization_id')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const recipient = {
    email: user.email,
    recipient_name: (profile as { full_name: string | null } | null)?.full_name ?? SAMPLE_RESIDENT_NAME,
    unit_id: null,
  }

  // Blanks become visible "[Due date]" markers, as in the preview, so a
  // test never fails on an unanswered question.
  const body = storedBody(value)
  const preview = buildPreview(recipient, {
    subject: value.subject,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    extraFields: value.extraFields,
    associationName: assocRow.name,
    portalLink: appUrl(`/communications/${SAMPLE_LINK_ID}`),
  })
  // No recipientRef: there is no communication_recipients row, so a reply
  // to the test must not look like a reply to a real send.
  const payload = {
    to: user.email,
    subject: `[Test] ${preview.email.subject}`,
    html: preview.email.html,
    senderName: buildSenderName(assocRow.name, assocRow.type),
  }

  const [result] = await sendEmailBatch([payload], {
    orgSandbox: await fetchOrgSandbox(supabase, assocRow.organization_id),
    ref: 'comm-test-send',
  })
  if (!result?.ok) return { ok: false, error: result?.error ?? 'The test email didn’t send.' }
  return { ok: true, sentTo: user.email }
}
