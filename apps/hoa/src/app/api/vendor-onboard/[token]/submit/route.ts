import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { validateInvitationToken } from '@/lib/vendor-invitations'

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

  // Upload each provided file, best-effort. Track failures but don't
  // roll back — partial uploads are still useful to the board, and the
  // vendor can retry the failed ones by being re-invited.
  const uploadResults: Array<{
    docType: string
    storagePath: string
    ok: boolean
    error?: string
  }> = []

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
      uploadResults.push({
        docType,
        storagePath,
        ok: false,
        error: uploadErr.message,
      })
      continue
    }
    const { error: insertErr } = await db
      .from('vendor_documents' as never)
      .insert({
        organization_id: invitation.organizationId,
        vendor_id: vendorId,
        doc_type: docType,
        storage_path: storagePath,
      } as never)
    if (insertErr) {
      await db.storage.from(STORAGE_BUCKET).remove([storagePath])
      uploadResults.push({
        docType,
        storagePath,
        ok: false,
        error: insertErr.message,
      })
      continue
    }
    uploadResults.push({ docType, storagePath, ok: true })
  }

  // Mark invitation submitted and link to the new vendor.
  await db
    .from('vendor_onboarding_invitations' as never)
    .update({
      status: 'submitted',
      vendor_id: vendorId,
      submitted_at: new Date().toISOString(),
    } as never)
    .eq('id', invitation.id)

  return NextResponse.json({
    ok: true,
    vendorId,
    documentResults: uploadResults,
  })
}
