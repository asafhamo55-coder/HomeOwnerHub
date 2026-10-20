import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { validateRfpInvitationToken } from '@/lib/rfp-invitations'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseForm, parseValue } from '@/lib/api/parse'
import { zDateOnly, zText } from '@/lib/api/schemas'
import { MAX_ARRAY_ITEMS, MAX_JSON_BYTES, MAX_LONG_TEXT, MAX_SHORT_TEXT, MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { extractPdfText } from '@/lib/pdf/extract-text'

// POST /api/rfp-bid/[token]/submit
//
// Public endpoint (RC-5). No Supabase auth session — the invitation token
// is the credential, so it is validated first (RC-3 step 2) and every RC-8
// limit applies. Works through the service role, scoped to the
// invitation's own org / rfp / vendor ids (never client-supplied).
//
// Request fields stay snake_case and dollars: this is a public vendor
// contract kept until it is versioned (RC-11). Amounts are validated to
// whole cents and line totals are computed in integer cents.

const STORAGE_BUCKET = 'hoa-documents'

/** Allowed upload types → the extension the stored object gets. */
const ALLOWED_FILE_TYPES = new Map<string, string>([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

/** Tokens are 32 random bytes as base64url (lib/rfp-invitations generateToken). */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/

/** Matches the numeric(14,2) columns' headroom, same cap as zCents ($1B). */
const MAX_DOLLARS = 1_000_000_000
const MAX_QUANTITY = 1_000_000

// Exact, not epsilon-based: a two-decimal amount k/100 parses to the double
// nearest k/100, v*100 is within a few ulps of k so Math.round recovers k,
// and k/100 (correctly rounded) is that same double again. Holds for every
// k below 2^53, far past MAX_DOLLARS. An absolute tolerance on v*100 wrongly
// refused about 8% of valid amounts above $100M (276651707.6*100 is
// 27665170760.000004).
const toCents = (v: number) => Math.round(v * 100)
const isWholeCents = (v: number) => toCents(v) / 100 === v

const zDollars = z
  .number()
  .finite()
  .max(MAX_DOLLARS, 'That amount is too large.')
  .refine(isWholeCents, 'Use at most two decimal places.')

const optionalText = (max: number) => zText(max).nullable().optional()

const LineItemSchema = z
  .object({
    description: zText(MAX_SHORT_TEXT, 1),
    quantity: z.number().finite().nonnegative().max(MAX_QUANTITY).nullable().optional(),
    unit_price: zDollars.pipe(z.number().nonnegative()).nullable().optional(),
    notes: optionalText(MAX_LONG_TEXT),
  })
  .refine(
    (li) => li.quantity == null || li.unit_price == null || li.quantity * li.unit_price <= MAX_DOLLARS,
    { message: 'That line total is too large.', path: ['unit_price'] },
  )

const PayloadSchema = z.object({
  total_amount: zDollars.pipe(z.number().positive('Total bid amount must be greater than zero.')),
  payment_terms: optionalText(MAX_SHORT_TEXT),
  warranty: optionalText(MAX_SHORT_TEXT),
  // The form sends '' for an empty date input; treat it as absent.
  start_date: z.literal('').or(zDateOnly).nullable().optional(),
  completion_date: z.literal('').or(zDateOnly).nullable().optional(),
  line_items: z.array(LineItemSchema).max(MAX_ARRAY_ITEMS).default([]),
})

const FormSchema = z.object({
  // Code units <= bytes, so this bound is never tighter than the byte cap
  // checked (as 413) before it.
  payload: z.string({ required_error: 'Required' }).max(MAX_JSON_BYTES),
})

/** A storage upload refused because the bucket does not exist (RC-1: 503 not_configured). */
function isMissingBucket(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  // storage-js StorageApiError: `statusCode` is the API's own code ("404"
  // for "Bucket not found", even when the HTTP status is 400); `status` is
  // the HTTP status. An upload creates its object, so a 404 can only mean
  // the bucket is missing. Classified by code, never by text (RC-2).
  const e = err as { statusCode?: unknown; status?: unknown }
  return String(e.statusCode) === '404' || e.status === 404
}

const BID_EXISTS_MESSAGE = 'A bid from you already exists for this RFP. Contact the association to change it.'

function storageName(mime: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ALLOWED_FILE_TYPES.get(mime) ?? ''}`
}

export const POST = withRoute(
  'rfp-bid.submit',
  async (request: Request, ctx: { params: Promise<{ token: string }> }) => {
    // ── Auth: the token (RC-5) ─────────────────────────────────────────
    const { token } = await ctx.params
    if (!TOKEN_SHAPE.test(token)) throw new ApiRouteError('not_found', 'This bid link is not valid.')

    const validation = await validateRfpInvitationToken(token)
    if (!validation.ok) {
      if (validation.reason === 'not_found') throw new ApiRouteError('not_found', 'This bid link is not valid.')
      throw new ApiRouteError(
        'gone',
        validation.reason === 'expired'
          ? 'The deadline for this RFP has passed.'
          : 'This RFP is no longer accepting bids.',
        { reason: validation.reason },
      )
    }
    if (validation.alreadyBid) {
      throw new ApiRouteError('conflict', 'You have already submitted a bid for this RFP.', {
        reason: 'already_submitted',
      })
    }
    // R-07: a bid in any other status (awarded, declined, withdrawn, …) also
    // occupies UNIQUE (rfp_id, vendor_id). Refuse it here, before the body is
    // read, the file uploaded or the PDF parsed — not after, via the 23505.
    // The insert below still maps a concurrent 23505 to the same 409.
    if (validation.existingBidStatus != null) {
      throw new ApiRouteError('conflict', BID_EXISTS_MESSAGE, { reason: 'bid_exists' })
    }
    const invitation = validation.invitation
    const logCtx = { rfpId: invitation.rfpId, vendorId: invitation.vendorId }

    // ── Parse + validate (RC-8) ────────────────────────────────────────
    const formData = await parseForm(request)
    const payloadEntry = formData.get('payload')
    // The cap is in bytes: measure UTF-8 bytes, not UTF-16 code units.
    if (typeof payloadEntry === 'string' && new TextEncoder().encode(payloadEntry).byteLength > MAX_JSON_BYTES) {
      throw new ApiRouteError('payload_too_large', undefined, { maxBytes: MAX_JSON_BYTES })
    }
    const { payload: payloadRaw } = parseValue(FormSchema, { payload: payloadEntry ?? undefined })
    let payloadJson: unknown
    try {
      payloadJson = JSON.parse(payloadRaw)
    } catch {
      throw new ApiRouteError('invalid_json')
    }
    const payload = parseValue(PayloadSchema, payloadJson)

    // Validate the optional file BEFORE any write.
    let file: File | null = null
    const fileEntry = formData.get('file')
    if (fileEntry instanceof File && fileEntry.size > 0) {
      if (fileEntry.size > MAX_UPLOAD_BYTES) {
        throw new ApiRouteError('payload_too_large', 'That file is larger than 25 MB.', {
          maxBytes: MAX_UPLOAD_BYTES,
        })
      }
      if (!ALLOWED_FILE_TYPES.has(fileEntry.type)) {
        throw new ApiRouteError('unsupported_media_type', 'Upload a PDF, JPEG, PNG or WebP file.')
      }
      file = fileEntry
    }

    // ── Work ───────────────────────────────────────────────────────────
    const db = createAdminClient()

    async function removeUpload(path: string | null): Promise<void> {
      if (!path) return
      const { error } = await db.storage.from(STORAGE_BUCKET).remove([path])
      // Cannot compensate further: the orphaned object stays in the bucket
      // under the org's rfps/ prefix. Logged by code so it can be swept.
      if (error) logRouteFailure('rfp-bid.submit.upload_remove', error, logCtx)
    }

    // Optional file upload first — if it fails we abort before any bid row.
    let storagePath: string | null = null
    let parsedPdfText: string | null = null
    if (file) {
      storagePath = `${invitation.organizationId}/rfps/${invitation.rfpId}/bids/${invitation.vendorId}/${storageName(file.type)}`
      const { error: uploadErr } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })
      if (uploadErr && isMissingBucket(uploadErr)) {
        logRouteFailure('rfp-bid.submit.upload_bucket_missing', uploadErr, logCtx)
        throw new ApiRouteError('not_configured', 'Bid uploads are not set up yet. Contact the association.')
      }
      checkWrite({ error: uploadErr }, 'rfp-bid.submit.upload', logCtx)

      // Best-effort: extract text from the PDF so the board can read it
      // inline during comparison. We do NOT fail the submission if
      // extraction throws — the PDF is still stored, the form data is
      // authoritative, and structured AI extraction is the ADR-002
      // Phase 2.1 path anyway. Only attempts on PDFs; skips images.
      if (file.type === 'application/pdf') {
        try {
          // Shared hardened extractor (SEC-L7): an anonymous vendor's PDF.
          const result = await extractPdfText(new Uint8Array(await file.arrayBuffer()), { maxPages: 100, maxChars: 50_000 })
          parsedPdfText = result.text.trim().slice(0, 50_000) || null
        } catch (err) {
          logRouteFailure('rfp-bid.submit.pdf_parse', err, logCtx)
        }
      }
    }

    // Insert the bid. UNIQUE (rfp_id, vendor_id) makes the claim atomic:
    // a concurrent double-submit, or an existing bid in any status, is a
    // 23505 that becomes a 409 instead of a second row (RC-5).
    const now = new Date().toISOString()
    const { data: bidRow, error: bidErr } = await db
      .from('bids' as never)
      .insert({
        organization_id: invitation.organizationId,
        rfp_id: invitation.rfpId,
        vendor_id: invitation.vendorId,
        total_amount: toCents(payload.total_amount) / 100,
        payment_terms: payload.payment_terms || null,
        warranty: payload.warranty || null,
        start_date: payload.start_date || null,
        completion_date: payload.completion_date || null,
        raw_document_path: storagePath,
        parsed_pdf_text: parsedPdfText,
        parsed_pdf_at: parsedPdfText ? now : null,
        status: 'submitted',
        submitted_at: now,
      } as never)
      .select('id')
      .single<{ id: string }>()

    if (bidErr || !bidRow) {
      await removeUpload(storagePath)
      checkWrite({ error: bidErr }, 'rfp-bid.submit.bid_insert', logCtx, {
        conflict: { reason: 'bid_exists', message: BID_EXISTS_MESSAGE },
      })
      throw new ApiRouteError('internal')
    }

    if (payload.line_items.length > 0) {
      const itemRows = payload.line_items.map((li) => ({
        bid_id: bidRow.id,
        description: li.description,
        quantity: li.quantity ?? null,
        unit_price: li.unit_price != null ? toCents(li.unit_price) / 100 : null,
        line_total:
          li.quantity != null && li.unit_price != null
            ? Math.round(li.quantity * toCents(li.unit_price)) / 100
            : null,
        notes: li.notes || null,
      }))
      const { error: itemsErr } = await db.from('bid_line_items' as never).insert(itemRows as never)
      if (itemsErr) {
        // A bid header without its line items would feed garbage into the
        // W23 comparator. Roll back in reverse order — the bid row, then the
        // uploaded file — so the vendor can retry the whole submission. If
        // the bid delete itself fails, the header row is left behind (and
        // blocks a retry with 409 bid_exists); it is logged by id.
        const { error: delErr } = await db.from('bids' as never).delete().eq('id', bidRow.id)
        if (delErr) logRouteFailure('rfp-bid.submit.bid_rollback', delErr, { ...logCtx, bidId: bidRow.id })
        await removeUpload(storagePath)
        checkWrite({ error: itemsErr }, 'rfp-bid.submit.line_items_insert', { ...logCtx, bidId: bidRow.id })
      }
    }

    return NextResponse.json({ bidId: bidRow.id }, { status: 201 })
  },
)
