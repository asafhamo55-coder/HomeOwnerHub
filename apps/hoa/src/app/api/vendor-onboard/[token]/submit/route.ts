import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { validateInvitationToken } from '@/lib/vendor-invitations'
import { sendEmail, appUrl } from '@/lib/email'

// POST /api/vendor-onboard/[token]/submit
//
// Public endpoint — no Supabase auth session. The token is the
// credential. We use the service-role client to bypass RLS on the
// vendors / vendor_documents / vendor_onboarding_invitations tables
// after validating the token in app code.
//
// Multipart payload:
//   - JSON field "payload" with the vendor profile fields
//   - File fields "file_coi", "file_w9", "file_license" (optional)
//
// On success the vendor row is created, files are uploaded to
// hoa-documents (bucket must exist), vendor_documents rows are
// inserted, and the invitation is marked submitted.

const STORAGE_BUCKET = 'hoa-documents'
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

const AddressSchema = z.object({
  line1: z.string().trim().optional().nullable(),
  line2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  postal_code: z.string().trim().optional().nullable(),
})

const EIN_REGEX = /^\d{2}-?\d{7}$/

const PayloadSchema = z
  .object({
    legal_name: z.string().trim().min(2),
    dba: z.string().trim().nullable().optional(),
    ein: z.string().trim().regex(EIN_REGEX, 'EIN must be 9 digits.'),
    primary_email: z.string().trim().email().nullable().optional().or(z.literal('')),
    primary_phone: z.string().trim().nullable().optional(),
    trades: z.array(z.string().trim().min(1)).min(1),
    address: AddressSchema.nullable().optional(),
    service_area_zips: z
      .array(z.string().trim().regex(/^\d{5}$/))
      .default([]),
  })
  .refine(
    (v) => (v.primary_email && v.primary_email !== '') || (v.primary_phone && v.primary_phone !== ''),
    { message: 'Email or phone is required.', path: ['primary_email'] },
  )

const DOC_FILE_KEYS = [
  ['file_coi', 'coi'],
  ['file_w9', 'w9'],
  ['file_license', 'license'],
] as const

function safeName(original: string): string {
  const dot = original.lastIndexOf('.')
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const validation = await validateInvitationToken(token)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invitation_invalid', reason: validation.reason },
      { status: 410 },
    )
  }
  const invitation = validation.invitation

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const payloadRaw = formData.get('payload')
  if (typeof payloadRaw !== 'string') {
    return NextResponse.json({ error: 'missing_payload' }, { status: 400 })
  }
  let payload: z.infer<typeof PayloadSchema>
  try {
    payload = PayloadSchema.parse(JSON.parse(payloadRaw))
  } catch (err) {
    return NextResponse.json(
      {
        error: 'invalid_payload',
        message: err instanceof Error ? err.message : 'invalid',
      },
      { status: 400 },
    )
  }

  // Pre-validate file shapes before we touch the DB.
  const files: Array<{ key: string; docType: string; file: File }> = []
  for (const [field, docType] of DOC_FILE_KEYS) {
    const entry = formData.get(field)
    if (entry instanceof File && entry.size > 0) {
      if (entry.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'file_too_large', field },
          { status: 400 },
        )
      }
      if (entry.type && !ALLOWED_FILE_TYPES.has(entry.type)) {
        return NextResponse.json(
          { error: 'file_wrong_type', field },
          { status: 400 },
        )
      }
      files.push({ key: field, docType, file: entry })
    }
  }

  const db = createAdminClient()

  const address = payload.address
  const addressJson =
    address && Object.values(address).some((v) => v != null && v !== '')
      ? address
      : null

  // Per-org duplicate guard on EIN. Prevents a network-retry of this
  // public endpoint (where the first call may have already inserted the
  // vendor row but the response never reached the client) from creating
  // a second vendor with the same EIN under the same organization.
  const { data: existingVendor } = await db
    .from('vendors' as never)
    .select('id')
    .eq('organization_id', invitation.organizationId)
    .eq('ein', payload.ein)
    .maybeSingle<{ id: string }>()
  if (existingVendor) {
    return NextResponse.json(
      {
        error: 'duplicate_ein',
        message:
          'A vendor with this EIN already exists for this organization.',
      },
      { status: 409 },
    )
  }

  // Create the vendor row.
  const { data: vendorRow, error: vendorErr } = await db
    .from('vendors' as never)
    .insert({
      organization_id: invitation.organizationId,
      legal_name: payload.legal_name,
      dba: payload.dba || null,
      ein: payload.ein,
      primary_email: payload.primary_email || null,
      primary_phone: payload.primary_phone || null,
      trades: payload.trades,
      address: addressJson,
      service_area_zips:
        payload.service_area_zips.length > 0 ? payload.service_area_zips : null,
      status: 'prospect',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (vendorErr || !vendorRow) {
    return NextResponse.json(
      {
        error: 'vendor_insert_failed',
        message: vendorErr?.message ?? 'unknown',
      },
      { status: 500 },
    )
  }
  const vendorId = vendorRow.id

  // Upload each provided file. Any failure aborts the whole submission
  // and rolls back the vendor row + already-uploaded files, so the
  // vendor can safely retry with the same token. Reporting "submitted"
  // when a document didn't actually save would leave the board with an
  // incomplete file set and no signal to chase.
  const uploadedPaths: string[] = []
  const uploadResults: Array<{
    docType: string
    storagePath: string
    ok: boolean
    error?: string
  }> = []

  async function abort(status: number, body: Record<string, unknown>) {
    if (uploadedPaths.length > 0) {
      await db.storage.from(STORAGE_BUCKET).remove(uploadedPaths)
    }
    await db.from('vendors' as never).delete().eq('id', vendorId)
    return NextResponse.json(body, { status })
  }

  for (const { docType, file } of files) {
    const storagePath = `${invitation.organizationId}/vendors/${vendorId}/${docType}/${safeName(file.name)}`
    const { error: uploadErr } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (uploadErr) {
      console.error('[vendor-onboard] upload failed', { docType, error: uploadErr.message })
      return abort(502, {
        error: 'document_upload_failed',
        docType,
        message: uploadErr.message,
      })
    }
    uploadedPaths.push(storagePath)

    const { error: insertErr } = await db
      .from('vendor_documents' as never)
      .insert({
        organization_id: invitation.organizationId,
        vendor_id: vendorId,
        doc_type: docType,
        storage_path: storagePath,
      } as never)
    if (insertErr) {
      console.error('[vendor-onboard] document insert failed', { docType, error: insertErr.message })
      return abort(500, {
        error: 'document_insert_failed',
        docType,
        message: insertErr.message,
      })
    }
    uploadResults.push({ docType, storagePath, ok: true })
  }

  // Mark invitation submitted and link to the new vendor. If this fails
  // the token would remain reusable and the next submission would
  // create a duplicate vendor — so we abort and roll back instead of
  // logging and continuing.
  const { error: invitationErr } = await db
    .from('vendor_onboarding_invitations' as never)
    .update({
      status: 'submitted',
      vendor_id: vendorId,
      submitted_at: new Date().toISOString(),
    } as never)
    .eq('id', invitation.id)
  if (invitationErr) {
    console.error('[vendor-onboard] invitation status update failed', invitationErr.message)
    return abort(500, {
      error: 'invitation_update_failed',
      message: invitationErr.message,
    })
  }

  // Best-effort notification to the manager who created the invitation.
  // Looks up the inviter via invitations.created_by → profiles.email,
  // sends a one-line summary via Resend. Failures are logged, not
  // surfaced — the vendor has done their part and shouldn't see an
  // error if our email pipeline is sick.
  await notifyManagerOnSubmission(db, invitation.id, vendorId).catch((err) => {
    console.warn(
      '[vendor-onboard] manager notification failed:',
      err instanceof Error ? err.message : err,
    )
  })

  return NextResponse.json({
    ok: true,
    vendorId,
    documentResults: uploadResults,
  })
}

async function notifyManagerOnSubmission(
  db: ReturnType<typeof createAdminClient>,
  invitationId: string,
  vendorId: string,
): Promise<void> {
  const { data: inv } = await db
    .from('vendor_onboarding_invitations' as never)
    .select(
      'created_by, invitee_name, invitee_email, org:orgs(name)',
    )
    .eq('id', invitationId)
    .maybeSingle<{
      created_by: string | null
      invitee_name: string | null
      invitee_email: string
      org: { name: string } | null
    }>()
  if (!inv?.created_by) return // nobody to notify

  const { data: vendor } = await db
    .from('vendors' as never)
    .select('legal_name')
    .eq('id', vendorId)
    .maybeSingle<{ legal_name: string }>()

  const { data: profile } = await db
    .from('profiles')
    .select('email, full_name')
    .eq('id', inv.created_by)
    .maybeSingle<{ email: string | null; full_name: string | null }>()
  if (!profile?.email) return

  const vendorName = vendor?.legal_name ?? inv.invitee_name ?? inv.invitee_email
  const orgName = inv.org?.name ?? 'your association'

  await sendEmail({
    to: profile.email,
    subject: `${vendorName} completed vendor onboarding`,
    text: `${vendorName} just submitted their vendor profile for ${orgName}.

Open the manager dashboard to review:
${appUrl('/vendors')}

— HomeownerHub`,
    html: `<p>${escapeHtml(vendorName)} just submitted their vendor profile for <strong>${escapeHtml(orgName)}</strong>.</p>
<p><a href="${appUrl('/vendors')}">Review in the manager dashboard →</a></p>`,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
