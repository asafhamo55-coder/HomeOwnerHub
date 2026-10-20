// BL-021 / BL-059 — the bill scan itself, shared by both ways in:
//
//   - POST /api/accounting/bill-scan — the "Scan a bill" upload card;
//   - scanAttachmentAsBill (lib/inbox/attachment-bill.ts) — "Scan as a bill"
//     on a stored inbox attachment.
//
// The CALLER gates (board/admin) and checks the file's size and type first;
// this runs W36 (service role writes the ai_runs audit row) and files a
// `w36.ap_bill` approval proposal with the service role. It PROPOSES; it
// never enters a bill. The invoice and its journal entry are created only
// when a board member approves it in /approvals (executor.ts → enterBill).
//
// Every model call draws on the shared `board_ai` AI limit (lib/api/ai-limits.ts),
// after the cheap refusals (no association, a duplicate, a PDF with no
// text) and before the model, so neither way in is an uncapped AI route.
//
// The bill's content is untrusted (an inbox attachment is whatever a
// stranger emailed): the W36 prompt says so, and code — not the model —
// enforces everything that matters for money (processBillScanResponse,
// matchVendor, the account list, billMissing before approve).
//
// Throws ApiRouteError; the route lets withRoute answer it, the server
// action maps it to a message. Logs carry ids, counts and codes only.

import { createAdminClient } from '@homeowner-portal/db'
import { MAX_BILL_TEXT_CHARS, proposeApproval, scanBill, W36_AP_BILL } from '@homeowner-portal/workflows'
import { ApiRouteError } from '@/lib/api/errors'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import { checkAndRecordAiUsage, linkAiUsageToRun } from '@/lib/api/rate-limit'
import { readAllResult } from '@/lib/supabase/read-all'
import type { getSupabaseServerClient } from '@/lib/supabase/server'
import { BILL_ALLOWED_TYPES } from './file-rules'
import {
  billMissing,
  billNeedsCheck,
  billSubjectId,
  buildBillProposal,
  sha256Hex,
  type AccountCandidate,
  type BillOrigin,
  type VendorCandidate,
} from './proposal'

type ServerDb = Awaited<ReturnType<typeof getSupabaseServerClient>>

export const BILL_STORAGE_BUCKET = 'hoa-documents'

export interface ScanBillFileInput {
  /** The caller's own RLS client. */
  supabase: ServerDb
  /** From the gate, never the request. */
  orgId: string
  userId: string
  bytes: Uint8Array
  /** Already resolved against BILL_ALLOWED_TYPES by the caller. */
  contentType: string
  /** Where the file came from, when not an upload (stored on the payload). */
  origin?: BillOrigin
  /** logRouteFailure's area prefix, e.g. 'accounting.bill-scan'. */
  logArea: string
}

export type ScanBillFileResult =
  | { duplicate: true; approvalRequestId: string }
  | {
      duplicate: false
      approvalRequestId: string
      summary: string
      amountCents: number | null
      missing: string[]
      needsCheck: string[]
      warnings: string[]
    }

async function pdfText(bytes: Uint8Array, orgId: string, logArea: string): Promise<string> {
  try {
    // Dynamic import, as every pdf-parse call site here does (heavy chain).
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(Buffer.from(bytes))
    return (parsed.text ?? '').trim()
  } catch (err) {
    logRouteFailure(`${logArea}.pdf-parse`, err, { orgId, bytes: bytes.byteLength })
    return ''
  }
}

export async function scanBillFile(input: ScanBillFileInput): Promise<ScanBillFileResult> {
  const { supabase, orgId, userId, bytes, contentType, origin, logArea } = input
  const ext = BILL_ALLOWED_TYPES.get(contentType)
  if (!ext) throw new ApiRouteError('unsupported_media_type')
  const isPdf = contentType === 'application/pdf'

  // The association enterBill will post to (getPrimaryAssociation's rule:
  // first by name), scoped to the gate's org.
  const { data: assocRows, error: assocErr } = await supabase
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
  if (assocErr) {
    logRouteFailure(`${logArea}.association`, assocErr, { orgId })
    throw new ApiRouteError('internal')
  }
  const associationId = assocRows?.[0]?.id
  if (!associationId) {
    throw new ApiRouteError('unprocessable', 'Set up your association before entering bills.', { reason: 'no_association' })
  }

  const subjectId = await billSubjectId(orgId, bytes)

  // Same file, still live (proposed / approved / posted)? Point at it and
  // spend nothing on the model. The same invoice uploaded and emailed is
  // the same bytes, so it is caught here too.
  const { data: existing, error: existingErr } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('organization_id', orgId)
    .eq('action_type', W36_AP_BILL)
    .eq('subject_id', subjectId)
    .in('status', ['proposed', 'approved', 'posted'])
    .limit(1)
  if (existingErr) {
    logRouteFailure(`${logArea}.existing`, existingErr, { orgId })
    throw new ApiRouteError('internal')
  }
  if (existing?.[0]) return { duplicate: true, approvalRequestId: existing[0].id }

  let documentText: string | null = null
  if (isPdf) {
    const text = await pdfText(bytes, orgId, logArea)
    if (!text) {
      throw new ApiRouteError(
        'unprocessable',
        'This PDF has no readable text (it is probably a scan). Upload a photo of the bill (JPG or PNG) instead.',
        { reason: 'no_text_layer' },
      )
    }
    documentText = text.slice(0, MAX_BILL_TEXT_CHARS)
  }

  // The shared board AI limit: a 429 rate_limited ApiRouteError when full.
  const { usageId } = await checkAndRecordAiUsage('board_ai', { orgId, userId })

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
    logRouteFailure(`${logArea}.refs`, accountsRes.error ?? vendorsRes.error, { orgId })
    throw new ApiRouteError('internal')
  }
  const accounts: AccountCandidate[] = (accountsRes.data ?? [])
    .map((a) => ({ id: a.id, accountNumber: a.account_number, accountName: a.account_name }))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
  const vendors: VendorCandidate[] = (vendorsRes.data ?? []).map((v) => ({ id: v.id, legalName: v.legal_name, dba: v.dba }))

  // Keep the bill so the approver can check the AI against it. Server-built
  // path under the gate's org; no client or email file name reaches it.
  const storagePath = `${orgId}/bills/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BILL_STORAGE_BUCKET).upload(storagePath, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadError) {
    logRouteFailure(`${logArea}.upload`, uploadError, { orgId, bytes: bytes.byteLength })
    const code = errorCode(uploadError)
    if (code === '404' || code === 'NoSuchBucket') {
      throw new ApiRouteError('not_configured', 'Document storage is not set up yet.', { reason: 'bucket_missing' })
    }
    throw new ApiRouteError('internal')
  }
  const removeUpload = async () => {
    const { error } = await supabase.storage.from(BILL_STORAGE_BUCKET).remove([storagePath])
    if (error) logRouteFailure(`${logArea}.cleanup`, error, { orgId })
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
    logRouteFailure(`${logArea}.model`, err, { orgId })
    await removeUpload()
    throw new ApiRouteError('upstream_unavailable', 'The AI couldn’t read this bill right now. Try again, or enter it by hand.')
  }
  await linkAiUsageToRun(usageId, scan.runId)

  const proposal = buildBillProposal(scan, {
    associationId,
    storagePath,
    contentType,
    source: isPdf ? 'pdf_text' : 'image',
    vendors,
    accounts,
    ...(origin ? { origin } : {}),
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
    logRouteFailure(`${logArea}.propose`, err, { orgId })
    await removeUpload()
    throw new ApiRouteError('internal')
  }
  if (!filed.created) {
    // A concurrent scan of the same file won the slot.
    await removeUpload()
    return { duplicate: true, approvalRequestId: filed.id }
  }

  return {
    duplicate: false,
    approvalRequestId: filed.id,
    summary: proposal.summary,
    amountCents: proposal.amount === null ? null : Math.round(proposal.amount * 100),
    missing: billMissing(proposal.payload),
    needsCheck: billNeedsCheck(proposal.payload),
    warnings: proposal.payload.warnings,
  }
}
