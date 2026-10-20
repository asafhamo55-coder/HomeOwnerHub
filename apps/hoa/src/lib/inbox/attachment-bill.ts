'use server'

/**
 * BL-059 — "Scan as a bill": an invoice emailed to the association becomes
 * a bill proposal in /approvals, through the same scan as the "Scan a bill"
 * upload (lib/bill-scan/scan-core.ts). Nothing is entered, paid or posted
 * here: the board reviews, edits and approves the proposal in /approvals,
 * and only that approval runs enterBill.
 *
 * The checks, in order, before any model call:
 *   - requireBoardOrAdminForAction (BOARD_ONLY_DENIED) before any client;
 *   - the attachment is read on the board member's own RLS client, scoped
 *     to the gate's org, and must be stored;
 *   - its storage path must be the exact shape the attachments job mints
 *     for THIS org, thread and attachment (inboxAttachmentPathOk, the same
 *     check "Save to documents" uses), so the download can only ever read
 *     this attachment's own object;
 *   - type (PDF / JPG / PNG / WebP) and size (MAX_UPLOAD_BYTES, the vision
 *     limit for images), on the row AND on the downloaded bytes;
 *   - the shared `board_ai` AI limit, inside scanBillFile.
 *
 * The attachment is untrusted: anyone can email the association. Only the
 * file's bytes go to the model — never the email's subject, body or sender
 * — and the money rules are enforced in code (scan-core.ts header).
 *
 * The link back to the thread is stored on the proposal's payload
 * (`origin`), the only existing field that can hold it; see proposal.ts.
 *
 * Logs carry ids and codes only — never a file name, a path or text.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { ApiRouteError } from '@/lib/api/errors'
import { MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MAX_PHOTO_BYTES } from '@/lib/inbox/draft/photo-findings'
import { BILL_WRONG_TYPE, resolveBillContentType } from '@/lib/bill-scan/file-rules'
import { BILL_STORAGE_BUCKET, scanBillFile } from '@/lib/bill-scan/scan-core'
import { inboxAttachmentPathOk } from './attachment-file-rules'

export type ScanAttachmentResult =
  | {
      ok: true
      approvalRequestId: string
      /** This file already has a live bill proposal; nothing new was filed. */
      duplicate: boolean
      summary?: string
      missing?: string[]
      needsCheck?: string[]
    }
  | { ok: false; error: string; rateLimited?: true }

const AttachmentId = z.string().uuid()

const TOO_LARGE = 'This file is over 25 MB, too large to scan.'
const PHOTO_TOO_LARGE = 'Photos of a bill must be under 3 MB to scan. Ask the vendor for a PDF, or enter the bill by hand.'

const NO_TEXT_LAYER =
  'This PDF has no readable text (it is probably a scan). Save a photo or screenshot of the bill and use Scan a bill on Enter a bill, or enter it by hand.'

function sizeProblem(contentType: string, bytes: number): string | null {
  if (bytes > MAX_UPLOAD_BYTES) return TOO_LARGE
  if (contentType !== 'application/pdf' && bytes > MAX_PHOTO_BYTES) return PHOTO_TOO_LARGE
  return null
}

export async function scanAttachmentAsBill(attachmentId: string): Promise<ScanAttachmentResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const orgId = gate.orgId

  if (!AttachmentId.safeParse(attachmentId).success) return { ok: false, error: 'Invalid attachment.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in to an organization.' }

  const { data: row, error: readError } = await supabase
    .from('inbox_attachments')
    .select('id, thread_id, file_name, content_type, size_bytes, storage_path, fetch_status')
    .eq('id', attachmentId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) {
    console.error('scanAttachmentAsBill: read failed', { orgId, attachmentId, code: readError.code })
    return { ok: false, error: 'Couldn’t load this attachment. Try again.' }
  }
  if (!row) return { ok: false, error: 'Attachment not found.' }
  if (row.fetch_status !== 'stored' || !row.storage_path) {
    return { ok: false, error: 'This file hasn’t finished downloading yet.' }
  }

  const contentType = resolveBillContentType(row.content_type, row.file_name)
  if (!contentType) return { ok: false, error: `Only a PDF or a photo can be scanned. ${BILL_WRONG_TYPE}` }
  const declaredSize = sizeProblem(contentType, row.size_bytes ?? 0)
  if (declaredSize) return { ok: false, error: declaredSize }

  if (!inboxAttachmentPathOk(row.storage_path, { orgId, threadId: row.thread_id, attachmentId: row.id })) {
    console.error('scanAttachmentAsBill: unexpected storage path shape', { orgId, attachmentId })
    return { ok: false, error: 'This file can’t be scanned from here. Download it and use Scan a bill on Enter a bill.' }
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(BILL_STORAGE_BUCKET).download(row.storage_path)
  if (downloadError || !blob) {
    console.error('scanAttachmentAsBill: download failed', { orgId, attachmentId, status: (downloadError as { statusCode?: unknown } | null)?.statusCode ?? null })
    return { ok: false, error: 'Couldn’t open this file. Try again.' }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength === 0) return { ok: false, error: 'This file is empty.' }
  // size_bytes is what the mail provider said; the bytes are what we hold.
  const actualSize = sizeProblem(contentType, bytes.byteLength)
  if (actualSize) return { ok: false, error: actualSize }

  try {
    const result = await scanBillFile({
      supabase,
      orgId,
      userId: user.id,
      bytes,
      contentType,
      origin: { kind: 'inbox_attachment', threadId: row.thread_id, attachmentId: row.id },
      logArea: 'inbox.scan-bill',
    })
    revalidatePath('/approvals')
    if (result.duplicate) return { ok: true, approvalRequestId: result.approvalRequestId, duplicate: true }
    return {
      ok: true,
      approvalRequestId: result.approvalRequestId,
      duplicate: false,
      summary: result.summary,
      missing: result.missing,
      needsCheck: result.needsCheck,
    }
  } catch (error) {
    if (error instanceof ApiRouteError) {
      if (error.code === 'rate_limited') return { ok: false, error: error.publicMessage, rateLimited: true }
      if (error.extra?.reason === 'no_text_layer') return { ok: false, error: NO_TEXT_LAYER }
      // publicMessage is the envelope's text for a person (generic for internal).
      return { ok: false, error: error.publicMessage }
    }
    console.error('scanAttachmentAsBill: unexpected failure', {
      orgId,
      attachmentId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return { ok: false, error: 'Couldn’t scan this bill. Try again, or enter it by hand.' }
  }
}
