// POST /api/accounting/bill-scan — BL-021 AI bill scan. Its only caller is
// the "Scan a bill" card on /accounting/invoices/new. Board-only (RC-4):
// it runs W36 (service role writes the ai_runs audit row) and files an
// approval proposal with the service role. The scan itself is shared with
// "Scan as a bill" on an inbox attachment: lib/bill-scan/scan-core.ts.
//
// It PROPOSES; it never enters a bill. The response points at a
// `w36.ap_bill` approval request that shows in /approvals under "Bills to
// enter"; the invoice and its journal entry are created only when a board
// member approves it there (lib/bill-scan/executor.ts → enterBill).
//
// Multipart: file=<PDF with a text layer | JPG | PNG | WebP>
// 201 { approvalRequestId, duplicate: false, summary, amountCents, missing, needsCheck, warnings }
// 200 { approvalRequestId, duplicate: true }   — this exact file already has a live proposal
// 400 validation_failed       — malformed multipart, no file
// 413 payload_too_large       — over MAX_UPLOAD_BYTES, or an image over the vision limit
// 415 unsupported_media_type  — not PDF / JPG / PNG / WebP
// 422 unprocessable           — reason no_association | no_text_layer
// 429 rate_limited            — the shared board AI limit (board_ai) is used up
// 503 not_configured          — the hoa-documents bucket is missing
// 503 upstream_unavailable    — the model failed or replied with something unusable

import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin, requireRouteUser } from '@/lib/api/auth'
import { parseForm } from '@/lib/api/parse'
import { MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MAX_PHOTO_BYTES } from '@/lib/inbox/draft/photo-findings'
import { BILL_WRONG_TYPE, resolveBillContentType } from '@/lib/bill-scan/file-rules'
import { scanBillFile } from '@/lib/bill-scan/scan-core'

export const POST = withRoute('accounting.bill-scan', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin() // 401 / 403 before the body is read
  const form = await parseForm(request)

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiRouteError('validation_failed', 'Choose a bill to upload.', {
      issues: [{ path: 'file', message: 'A bill is required.' }],
    })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiRouteError('payload_too_large', 'The bill must be under 25 MB.', { maxBytes: MAX_UPLOAD_BYTES })
  }
  const contentType = resolveBillContentType(file.type, file.name)
  if (!contentType) throw new ApiRouteError('unsupported_media_type', BILL_WRONG_TYPE)
  // The vision provider caps the whole request (~20 MB after base64).
  if (contentType !== 'application/pdf' && file.size > MAX_PHOTO_BYTES) {
    throw new ApiRouteError('payload_too_large', 'Photos of a bill must be under 3 MB. Try a smaller photo or a PDF.', {
      maxBytes: MAX_PHOTO_BYTES,
    })
  }

  const { userId } = await requireRouteUser()
  const result = await scanBillFile({
    supabase: await getSupabaseServerClient(),
    orgId,
    userId,
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType,
    logArea: 'accounting.bill-scan',
  })
  if (result.duplicate) return NextResponse.json({ approvalRequestId: result.approvalRequestId, duplicate: true })
  return NextResponse.json(result, { status: 201 })
})
