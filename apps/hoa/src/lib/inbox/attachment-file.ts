'use server'

/**
 * BL-101 A8 — "Save to documents": file a stored inbox attachment into the
 * documents library.
 *
 * Same gate, bucket, row and rules as the Upload form (lib/documents.ts):
 *   - requireBoardOrAdminForAction, the documents gate, before any client;
 *   - the user-bound client throughout, so storage and table RLS (0055,
 *     0064) apply exactly as they do to an upload — no service role;
 *   - documentFileProblem / DOCUMENT_UPLOAD_TYPES from documents-rules.ts,
 *     the Upload form's type list, 50 MB cap and file-type allowlist.
 *
 * The bytes are COPIED within `hoa-documents`, not pointed at: the library
 * copy must outlive the email (deleting a document removes its file, and
 * the inbox object must not go with it). The source path is checked against
 * the exact shape the attachments job mints before the copy runs.
 *
 * Provenance has no column yet (B5, migration 0065), so it goes in the
 * name; see attachment-file-rules.ts. Nothing is made resident-visible
 * here beyond what the chosen type already implies (visible_to_owners
 * keeps its default, false).
 *
 * M-3: the type defaults to Other. CC&R / bylaws / rules need the board's
 * "I confirm this is our official governing document" tick, checked here
 * server-side; only then is the PDF's text stored (parsed_text) and the
 * copy filed under the confirmed-governing path AI retrieval accepts.
 *
 * Logs carry ids and codes only — never a file name, a path or text.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { removeStorageObjects } from '@/lib/storage-remove'
import { DOCUMENT_UPLOAD_TYPES, documentFileProblem, isGoverningUploadType } from '@/lib/documents-rules'
import { readPdfTexts } from './attachment-pdf'
import { selectParsableAttachments } from './vendor/attachment-text'
import {
  GOVERNING_CONFIRM_REQUIRED,
  filedDocumentName,
  filedStoragePath,
  inboxAttachmentPathOk,
  isAlreadyExistsError,
} from './attachment-file-rules'

const BUCKET = 'hoa-documents'

export interface SaveAttachmentState {
  ok?: boolean
  documentId?: string
  error?: string
  fieldErrors?: Record<string, string>
}

const Input = z.object({
  attachmentId: z.string().uuid('Invalid attachment.'),
  name: z.string().trim().min(2, 'Give the document a name.').max(160, 'Keep the name under 160 characters.'),
  type: z.enum(DOCUMENT_UPLOAD_TYPES, { message: 'Pick a document type.' }),
  // An HTML checkbox posts "on" when ticked and nothing when not.
  confirmGoverning: z.literal('on').nullable(),
})

export async function saveAttachmentToDocuments(
  _prev: SaveAttachmentState,
  formData: FormData,
): Promise<SaveAttachmentState> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { error: gate.error }
  const orgId = gate.orgId

  const parsed = Input.safeParse({
    attachmentId: formData.get('attachmentId'),
    name: formData.get('name'),
    type: formData.get('type'),
    confirmGoverning: formData.get('confirmGoverning') === 'on' ? 'on' : null,
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    if (fieldErrors.attachmentId) return { error: fieldErrors.attachmentId }
    return { fieldErrors }
  }
  const { attachmentId, name, type } = parsed.data
  // M-3: anyone can email the board a PDF. Filing it as a governing type
  // publishes it to every resident and lets the AI cite it, so that needs
  // the board's explicit confirmation — enforced here, not just in the form.
  const confirmedGoverning = isGoverningUploadType(type) && parsed.data.confirmGoverning === 'on'
  if (isGoverningUploadType(type) && !confirmedGoverning) {
    return { fieldErrors: { confirmGoverning: GOVERNING_CONFIRM_REQUIRED } }
  }

  const supabase = await getSupabaseServerClient()
  const { data: row, error: readError } = await supabase
    .from('inbox_attachments')
    .select('id, thread_id, message_id, file_name, content_type, size_bytes, storage_path, fetch_status')
    .eq('id', attachmentId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) {
    console.error('saveAttachmentToDocuments: read failed', { orgId, attachmentId, code: readError.code })
    return { error: 'Couldn’t load this attachment. Try again.' }
  }
  if (!row) return { error: 'Attachment not found.' }
  if (row.fetch_status !== 'stored' || !row.storage_path) {
    return { error: 'This file hasn’t finished downloading yet.' }
  }

  const problem = documentFileProblem({ fileName: row.file_name, sizeBytes: row.size_bytes })
  if (problem) return { error: problem }

  if (!inboxAttachmentPathOk(row.storage_path, { orgId, threadId: row.thread_id, attachmentId: row.id })) {
    console.error('saveAttachmentToDocuments: unexpected storage path shape', { orgId, attachmentId })
    return { error: 'This file can’t be filed from here. Download it and use Upload in Documents.' }
  }

  // The day the email arrived, for the provenance in the name. Optional:
  // a failed read files the document as "(from email)" without a date.
  const { data: message, error: messageError } = await supabase
    .from('inbox_messages')
    .select('sent_at')
    .eq('id', row.message_id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (messageError) {
    console.error('saveAttachmentToDocuments: message date read failed', { orgId, attachmentId, code: messageError.code })
  }

  const destination = filedStoragePath(orgId, row.id, row.storage_path, { confirmedGoverning })
  const { error: copyError } = await supabase.storage.from(BUCKET).copy(row.storage_path, destination)
  if (copyError) {
    if (isAlreadyExistsError(copyError as { message?: string; statusCode?: string | number })) {
      return { error: 'This file is already in the documents library.' }
    }
    console.error('saveAttachmentToDocuments: copy failed', { orgId, attachmentId, message: copyError.message })
    return { error: 'Couldn’t copy the file into the library. Try again.' }
  }

  // Text for the library's AI features, PDFs only, under the same 5 MB cap
  // the inbox already uses for reading attachments — and only for a
  // confirmed governing document (M-3). Anything else from the inbox is
  // filed without text, so no AI feature can quote a stranger's file; the
  // path also keeps it out of AI retrieval (isAiEligibleDocumentPath).
  let parsedText: string | null = null
  const parsable = !confirmedGoverning ? [] : selectParsableAttachments([
    {
      id: row.id,
      file_name: row.file_name,
      content_type: row.content_type,
      size_bytes: row.size_bytes,
      storage_path: destination,
      fetch_status: 'stored',
    },
  ])
  if (parsable.length > 0) {
    const texts = await readPdfTexts(supabase, BUCKET, parsable)
    const text = texts[0]?.text.trim()
    parsedText = text ? text : null
  }

  const { data: doc, error: insertError } = await supabase
    .from('hoa_documents')
    .insert({
      org_id: orgId,
      name: filedDocumentName(name, message?.sent_at ?? null),
      type,
      storage_path: destination,
      file_size: row.size_bytes,
      parsed_text: parsedText,
      parsed_at: parsedText ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (insertError || !doc) {
    console.error('saveAttachmentToDocuments: insert failed', { orgId, attachmentId, code: insertError?.code })
    // Same cleanup as uploadDocument: no row, no orphaned copy.
    await removeStorageObjects(supabase, BUCKET, [destination], `saveAttachmentToDocuments cleanup ${attachmentId}`)
    return { error: 'Couldn’t add the document to the library. Try again.' }
  }

  revalidatePath('/documents')
  revalidatePath(`/inbox/${row.thread_id}`)
  return { ok: true, documentId: doc.id }
}
