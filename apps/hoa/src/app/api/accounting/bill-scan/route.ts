// POST /api/accounting/bill-scan — BL-021 AI bill scan. Its only caller is
// the "Scan a bill" card on /accounting/invoices/new. Board-only (RC-4):
// it runs W36 (service role writes the ai_runs audit row) and files an
// approval proposal with the service role.
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
// 503 not_configured          — the hoa-documents bucket is missing
// 503 upstream_unavailable    — the model failed or replied with something unusable

import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { MAX_BILL_TEXT_CHARS, proposeApproval, scanBill, W36_AP_BILL } from '@homeowner-portal/workflows'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseForm } from '@/lib/api/parse'
import { MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAllResult } from '@/lib/supabase/read-all'
import { MAX_PHOTO_BYTES } from '@/lib/inbox/draft/photo-findings'
import {
  billMissing,
  billNeedsCheck,
  billSubjectId,
  buildBillProposal,
  sha256Hex,
  type AccountCandidate,
  type VendorCandidate,
} from '@/lib/bill-scan/proposal'

const STORAGE_BUCKET = 'hoa-documents'

/** Allowed MIME type → stored extension. HEIC is out: no vision endpoint here decodes it. */
const ALLOWED_TYPES: ReadonlyMap<string, string> = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['pdf', 'application/pdf'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

const WRONG_TYPE = 'Upload the bill as a PDF, JPG, PNG or WebP.'

function resolveContentType(file: File): string | null {
  const declared = file.type.split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return ALLOWED_TYPES.has(declared) ? declared : null
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return null
  return TYPE_BY_EXTENSION.get(file.name.slice(dot + 1).toLowerCase()) ?? null
}

async function pdfText(bytes: Uint8Array, orgId: string): Promise<string> {
  try {
    // Dynamic import, as every pdf-parse call site here does (heavy chain).
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(Buffer.from(bytes))
    return (parsed.text ?? '').trim()
  } catch (err) {
    logRouteFailure('accounting.bill-scan.pdf-parse', err, { orgId, bytes: bytes.byteLength })
    return ''
  }
}

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
  const contentType = resolveContentType(file)
  if (!contentType) throw new ApiRouteError('unsupported_media_type', WRONG_TYPE)
  const isPdf = contentType === 'application/pdf'
  // The vision provider caps the whole request (~20 MB after base64).
  if (!isPdf && file.size > MAX_PHOTO_BYTES) {
    throw new ApiRouteError('payload_too_large', 'Photos of a bill must be under 3 MB. Try a smaller photo or a PDF.', {
      maxBytes: MAX_PHOTO_BYTES,
    })
  }

  const supabase = await getSupabaseServerClient()

  // The association enterBill will post to (getPrimaryAssociation's rule:
  // first by name), scoped to the gate's org.
  const { data: assocRows, error: assocErr } = await supabase
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
  if (assocErr) {
    logRouteFailure('accounting.bill-scan.association', assocErr, { orgId })
    throw new ApiRouteError('internal')
  }
  const associationId = assocRows?.[0]?.id
  if (!associationId) {
    throw new ApiRouteError('unprocessable', 'Set up your association before entering bills.', { reason: 'no_association' })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const subjectId = await billSubjectId(orgId, bytes)

  // Same file, still live (proposed / approved / posted)? Point at it and
  // spend nothing on the model.
  const { data: existing, error: existingErr } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('organization_id', orgId)
    .eq('action_type', W36_AP_BILL)
    .eq('subject_id', subjectId)
    .in('status', ['proposed', 'approved', 'posted'])
    .limit(1)
  if (existingErr) {
    logRouteFailure('accounting.bill-scan.existing', existingErr, { orgId })
    throw new ApiRouteError('internal')
  }
  if (existing?.[0]) return NextResponse.json({ approvalRequestId: existing[0].id, duplicate: true })

  let documentText: string | null = null
  if (isPdf) {
    const text = await pdfText(bytes, orgId)
    if (!text) {
      throw new ApiRouteError(
        'unprocessable',
        'This PDF has no readable text (it is probably a scan). Upload a photo of the bill (JPG or PNG) instead.',
        { reason: 'no_text_layer' },
      )
    }
    documentText = text.slice(0, MAX_BILL_TEXT_CHARS)
  }

  const [accountsRes, vendorsRes] = await Promise.all([
    readAllResult<{ id: string; account_number: string; account_name: string }>((from, to) =>
      supabase
        .from('chart_of_accounts')
        .select('id, account_number, account_name')
        .eq('association_id', associationId)
        .eq('account_type', 'expense')
        .eq('is_active', true)
        .order('id')
        .range(from, to),
    ),
    readAllResult<{ id: string; legal_name: string; dba: string | null }>((from, to) =>
      supabase
        .from('vendors')
        .select('id, legal_name, dba')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .neq('status', 'blacklisted')
        .order('id')
        .range(from, to),
    ),
  ])
  if (accountsRes.error || vendorsRes.error) {
    logRouteFailure('accounting.bill-scan.refs', accountsRes.error ?? vendorsRes.error, { orgId })
    throw new ApiRouteError('internal')
  }
  const accounts: AccountCandidate[] = (accountsRes.data ?? [])
    .map((a) => ({ id: a.id, accountNumber: a.account_number, accountName: a.account_name }))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
  const vendors: VendorCandidate[] = (vendorsRes.data ?? []).map((v) => ({ id: v.id, legalName: v.legal_name, dba: v.dba }))

  // Keep the bill so the approver can check the AI against it. Server-built
  // path under the gate's org; the client's file name never reaches it.
  const storagePath = `${orgId}/bills/${Date.now()}-${crypto.randomUUID()}.${ALLOWED_TYPES.get(contentType)}`
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadError) {
    logRouteFailure('accounting.bill-scan.upload', uploadError, { orgId, bytes: bytes.byteLength })
    const code = errorCode(uploadError)
    if (code === '404' || code === 'NoSuchBucket') {
      throw new ApiRouteError('not_configured', 'Document storage is not set up yet.', { reason: 'bucket_missing' })
    }
    throw new ApiRouteError('internal')
  }
  const removeUpload = async () => {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    if (error) logRouteFailure('accounting.bill-scan.cleanup', error, { orgId })
  }

  let scan: Awaited<ReturnType<typeof scanBill>>
  try {
    scan = await scanBill(
      {
        source: isPdf ? 'pdf_text' : 'image',
        documentText,
        fileSha256: await sha256Hex(bytes),
        contentType,
        expenseAccounts: accounts.map((a) => ({ accountNumber: a.accountNumber, accountName: a.accountName })),
      },
      {
        organizationId: orgId,
        // Inline bytes, never a signed URL: a bill is not for a public link.
        imageDataUrl: isPdf ? null : `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
      },
    )
  } catch (err) {
    logRouteFailure('accounting.bill-scan.model', err, { orgId })
    await removeUpload()
    throw new ApiRouteError('upstream_unavailable', 'The AI couldn’t read this bill right now. Try again, or enter it by hand.')
  }

  const proposal = buildBillProposal(scan, {
    associationId,
    storagePath,
    contentType,
    source: isPdf ? 'pdf_text' : 'image',
    vendors,
    accounts,
  })

  let filed: Awaited<ReturnType<typeof proposeApproval>>
  try {
    filed = await proposeApproval(createAdminClient(), {
      organizationId: orgId,
      workflowId: 'W36',
      actionType: W36_AP_BILL,
      subjectType: 'bill_document',
      subjectId,
      payload: proposal.payload as never,
      summary: proposal.summary,
      amount: proposal.amount,
    })
  } catch (err) {
    logRouteFailure('accounting.bill-scan.propose', err, { orgId })
    await removeUpload()
    throw new ApiRouteError('internal')
  }
  if (!filed.created) {
    // A concurrent upload of the same file won the slot.
    await removeUpload()
    return NextResponse.json({ approvalRequestId: filed.id, duplicate: true })
  }

  return NextResponse.json(
    {
      approvalRequestId: filed.id,
      duplicate: false,
      summary: proposal.summary,
      amountCents: proposal.amount === null ? null : Math.round(proposal.amount * 100),
      missing: billMissing(proposal.payload),
      needsCheck: billNeedsCheck(proposal.payload),
      warnings: proposal.payload.warnings,
    },
    { status: 201 },
  )
})
