import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { validateRfpInvitationToken } from '@/lib/rfp-invitations'

// POST /api/rfp-bid/[token]/submit
//
// Public endpoint. No Supabase auth session — the token is the
// credential. Validates via service-role + bypasses RLS.

const STORAGE_BUCKET = 'hoa-documents'
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const LineItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().nonnegative().nullable().optional(),
  unit_price: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const PayloadSchema = z.object({
  total_amount: z.number().positive('Total bid amount must be greater than zero.'),
  payment_terms: z.string().trim().nullable().optional(),
  warranty: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  completion_date: z.string().trim().nullable().optional(),
  line_items: z.array(LineItemSchema).default([]),
})

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

  const validation = await validateRfpInvitationToken(token)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invitation_invalid', reason: validation.reason },
      { status: 410 },
    )
  }
  if (validation.alreadyBid) {
    return NextResponse.json(
      { error: 'already_submitted' },
      { status: 409 },
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

  // Validate the optional file BEFORE we hit the DB.
  let file: File | null = null
  const fileEntry = formData.get('file')
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (fileEntry.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }
    if (fileEntry.type && !ALLOWED_FILE_TYPES.has(fileEntry.type)) {
      return NextResponse.json({ error: 'file_wrong_type' }, { status: 400 })
    }
    file = fileEntry
  }

  const db = createAdminClient()

  // Optional file upload first — if it fails we want to abort before
  // we have a stray bid row.
  let storagePath: string | null = null
  let parsedPdfText: string | null = null
  if (file) {
    storagePath = `${invitation.organizationId}/rfps/${invitation.rfpId}/bids/${invitation.vendorId}/${safeName(file.name)}`
    const { error: uploadErr } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (uploadErr) {
      return NextResponse.json(
        {
          error: 'upload_failed',
          message: uploadErr.message,
        },
        { status: 500 },
      )
    }

    // Best-effort: extract text from the PDF so the board can read it
    // inline during comparison. We do NOT fail the submission if
    // extraction throws — the PDF is still stored, the form data is
    // authoritative, and structured AI extraction is the ADR-002
    // Phase 2.1 path anyway. Only attempts on PDFs; skips images.
    if ((file.type || '').toLowerCase() === 'application/pdf') {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const pdfParse = (await import('pdf-parse')).default
        const result = await pdfParse(buffer)
        parsedPdfText = (result.text ?? '').trim().slice(0, 50_000) || null
      } catch (err) {
        console.warn(
          '[rfp-bid] pdf-parse failed; bid will be saved without parsed_pdf_text:',
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  // Insert the bid + line items.
  const { data: bidRow, error: bidErr } = await db
    .from('bids' as never)
    .insert({
      organization_id: invitation.organizationId,
      rfp_id: invitation.rfpId,
      vendor_id: invitation.vendorId,
      total_amount: payload.total_amount,
      payment_terms: payload.payment_terms ?? null,
      warranty: payload.warranty ?? null,
      start_date: payload.start_date || null,
      completion_date: payload.completion_date || null,
      raw_document_path: storagePath,
      parsed_pdf_text: parsedPdfText,
      parsed_pdf_at: parsedPdfText ? new Date().toISOString() : null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (bidErr || !bidRow) {
    if (storagePath) {
      await db.storage.from(STORAGE_BUCKET).remove([storagePath])
    }
    return NextResponse.json(
      {
        error: 'bid_insert_failed',
        message: bidErr?.message ?? 'unknown',
      },
      { status: 500 },
    )
  }

  if (payload.line_items.length > 0) {
    const itemRows = payload.line_items.map((li) => ({
      bid_id: bidRow.id,
      description: li.description,
      quantity: li.quantity ?? null,
      unit_price: li.unit_price ?? null,
      line_total:
        li.quantity != null && li.unit_price != null
          ? li.quantity * li.unit_price
          : null,
      notes: li.notes ?? null,
    }))
    const { error: itemsErr } = await db
      .from('bid_line_items' as never)
      .insert(itemRows as never)
    if (itemsErr) {
      // A bid header without its line items would feed garbage into
      // the W23 comparator. Roll back the bid row (and uploaded file)
      // so the vendor can retry the whole submission.
      console.error('[rfp-bid] line items insert failed', itemsErr.message)
      await db.from('bids' as never).delete().eq('id', bidRow.id)
      if (storagePath) {
        await db.storage.from(STORAGE_BUCKET).remove([storagePath])
      }
      return NextResponse.json(
        {
          error: 'line_items_insert_failed',
          message: itemsErr.message,
        },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({
    ok: true,
    bidId: bidRow.id,
  })
}
