'use server'

/**
 * Attachment CRUD for an outgoing message.
 *
 * Bytes are never copied. Each row points at an object already in the
 * private `hoa-documents` bucket:
 *   - 'inbox'    → an inbox_attachments row's storage_path
 *   - 'document' → an hoa_documents row's storage_path (the CURRENT file;
 *                  hoa_document_versions holds SUPERSEDED files and must
 *                  never be attached, or a board would mail the old CC&Rs)
 *   - 'upload'   → an object the browser PUT directly under this draft
 *
 * Uploaded bytes never pass through a server action: Next.js caps a server
 * action body at 1MB by default, and pushing 15MB through one is the wrong
 * shape regardless. The browser gets a short-lived signed upload URL and
 * PUTs to storage itself.
 *
 * Never log a file name, an email address, a subject, or a body.
 * PostgrestError `.code`/`.message` only, never `.details`.
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { attachmentNameProblem, checkAttachmentFits } from './attachments'

const BUCKET = 'hoa-documents'

/**
 * Validates that `ref` is EXACTLY `inbox-drafts/<orgId>/<draftId>/<object>`
 * — four non-empty segments, none of them `.` or `..` — rather than merely
 * checking a string prefix. A prefix check (`ref.startsWith(...)`) cannot
 * see past a traversal like `inbox-drafts/org-1/draft-1/../../org-2/x`,
 * which literally starts with the required prefix. Returns the validated
 * path unchanged, or null if it does not match the exact shape this module
 * mints in `createAttachmentUploadUrl`.
 */
function resolveUploadPath(ref: string, orgId: string, draftId: string): string | null {
  const segments = ref.split('/')
  if (segments.length !== 4) return null
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null
  }
  const [prefix, refOrgId, refDraftId] = segments
  if (prefix !== 'inbox-drafts' || refOrgId !== orgId || refDraftId !== draftId) return null
  return ref
}

/** Loads the draft's current attachments so the budget can be checked. */
async function currentSizes(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  draftId: string,
): Promise<Array<{ sizeBytes: number }> | null> {
  const { data, error } = await supabase
    .from('inbox_draft_attachments')
    .select('size_bytes')
    .eq('organization_id', orgId)
    .eq('draft_id', draftId)
  if (error) {
    console.error(`attachments: budget read failed: ${error.code} ${error.message}`)
    return null
  }
  return (data ?? []).map((row) => ({ sizeBytes: Number(row.size_bytes) }))
}

/**
 * Confirms the draft is still editable and belongs to the caller's org.
 * A file must never be attachable to a reply already inside its undo window
 * — the approver reviewed a specific set of files.
 */
async function assertEditableDraft(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  draftId: string,
): Promise<{ ok: true; threadId: string | null } | { error: string }> {
  const { data, error } = await supabase
    .from('inbox_drafts')
    .select('id, thread_id, status')
    .eq('id', draftId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) {
    console.error(`attachments: draft read failed: ${error.code} ${error.message}`)
    return { error: 'Could not load this draft.' }
  }
  if (!data) return { error: 'This draft no longer exists.' }
  if (data.status !== 'draft') {
    return { error: 'This message is no longer editable.' }
  }
  return { ok: true, threadId: data.thread_id }
}

export async function createAttachmentUploadUrl(
  draftId: string,
  fileName: string,
  sizeBytes: number,
): Promise<{ ok: true; path: string; token: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const editable = await assertEditableDraft(supabase, org.id, draftId)
  if ('error' in editable) return editable

  const existing = await currentSizes(supabase, org.id, draftId)
  if (!existing) return { error: 'Could not check the attachment size limit.' }

  const fits = checkAttachmentFits(existing, sizeBytes)
  if (!fits.ok) return { error: fits.error }

  // A fresh uuid per attempt. A partial upload that never completes leaves an
  // orphan under this draft's prefix; nothing outside the prefix is ever an
  // upload, so removing the prefix cleans them all up.
  const path = `inbox-drafts/${org.id}/${draftId}/${randomUUID()}`

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    // StorageError, not PostgrestError — no `.code`. `.message` is safe.
    console.error(`attachments: signing upload failed: ${error?.message ?? 'unknown'}`)
    return { error: 'Could not start the upload.' }
  }

  // `fileName` is not used in the path — it is recorded on the row by
  // addDraftAttachment instead, so a hostile name cannot shape a storage key.
  return { ok: true, path: data.path, token: data.token }
}

export async function addDraftAttachment(
  draftId: string,
  source: 'upload' | 'inbox' | 'document',
  ref: string,
  uploaded?: { fileName: string; contentType: string | null; sizeBytes: number },
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const editable = await assertEditableDraft(supabase, org.id, draftId)
  if ('error' in editable) return editable

  let resolved: {
    storagePath: string
    fileName: string
    contentType: string | null
    sizeBytes: number
  }

  if (source === 'upload') {
    if (!uploaded) return { error: 'Missing upload details.' }
    // `ref` is the storage path returned by createAttachmentUploadUrl. It is
    // re-derived rather than trusted: only a path in EXACTLY the shape this
    // module mints for THIS org and THIS draft may be attached, so a forged
    // ref (including a `..` traversal) cannot reach another org's file.
    const validatedPath = resolveUploadPath(ref, org.id, draftId)
    if (!validatedPath) {
      return { error: 'That upload does not belong to this message.' }
    }

    // `uploaded.sizeBytes` is client-declared and not trustworthy — a
    // client could under-report it to slip an oversized object past the
    // budget check below while the actual PUT to storage carries more
    // bytes. Read the real size off the object that actually landed in
    // storage and use THAT for the budget check and the stored row.
    const { data: info, error: infoError } = await supabase.storage
      .from(BUCKET)
      .info(validatedPath)
    if (infoError || !info || typeof info.size !== 'number') {
      // StorageError, not PostgrestError — no `.code`. `.message` is safe.
      console.error(`attachments: upload stat failed: ${infoError?.message ?? 'no size returned'}`)
      return { error: 'Could not verify that upload.' }
    }

    resolved = {
      storagePath: validatedPath,
      fileName: uploaded.fileName,
      contentType: uploaded.contentType,
      sizeBytes: info.size,
    }
  } else if (source === 'inbox') {
    const { data, error } = await supabase
      .from('inbox_attachments')
      .select('storage_path, file_name, content_type, size_bytes, fetch_status')
      .eq('id', ref)
      .eq('organization_id', org.id)
      .maybeSingle()
    if (error) {
      console.error(`attachments: inbox lookup failed: ${error.code} ${error.message}`)
      return { error: 'Could not load that file.' }
    }
    if (!data || data.fetch_status !== 'stored' || !data.storage_path) {
      return { error: 'That file is not available to attach.' }
    }
    resolved = {
      storagePath: data.storage_path,
      fileName: data.file_name,
      contentType: data.content_type,
      sizeBytes: Number(data.size_bytes ?? 0),
    }
  } else {
    // hoa_documents scopes by `org_id`, NOT `organization_id` — the inbox
    // tables and the document tables disagree on this column name.
    const { data, error } = await supabase
      .from('hoa_documents')
      .select('storage_path, name, file_size')
      .eq('id', ref)
      .eq('org_id', org.id)
      .maybeSingle()
    if (error) {
      console.error(`attachments: document lookup failed: ${error.code} ${error.message}`)
      return { error: 'Could not load that document.' }
    }
    if (!data) return { error: 'That document is not available to attach.' }
    resolved = {
      storagePath: data.storage_path,
      fileName: data.name,
      // hoa_documents has no content-type column; infer from the extension
      // and let buildMimeMessage fall back to application/octet-stream.
      contentType: inferContentType(data.name),
      sizeBytes: Number(data.file_size ?? 0),
    }
  }

  // One check after `resolved`, so it covers all three sources — an upload's
  // client-supplied name, an inbound file's resident-supplied name, and a
  // library document's name — rather than only the branch someone remembered.
  // See attachmentNameProblem's docstring for what this spares the approver.
  const nameProblem = attachmentNameProblem(resolved.fileName)
  if (nameProblem) return { error: nameProblem }

  const existing = await currentSizes(supabase, org.id, draftId)
  if (!existing) return { error: 'Could not check the attachment size limit.' }
  const fits = checkAttachmentFits(existing, resolved.sizeBytes)
  if (!fits.ok) return { error: fits.error }

  const { error: insertError } = await supabase.from('inbox_draft_attachments').insert({
    organization_id: org.id,
    draft_id: draftId,
    source,
    storage_path: resolved.storagePath,
    file_name: resolved.fileName,
    content_type: resolved.contentType,
    size_bytes: resolved.sizeBytes,
  })
  if (insertError) {
    console.error(`attachments: insert failed: ${insertError.code} ${insertError.message}`)
    return { error: 'Could not attach that file.' }
  }

  if (editable.threadId) revalidatePath(`/inbox/${editable.threadId}`)
  return { ok: true }
}

export async function removeDraftAttachment(
  attachmentId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('inbox_draft_attachments')
    .select('id, draft_id, source, storage_path')
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (error) {
    console.error(`attachments: remove lookup failed: ${error.code} ${error.message}`)
    return { error: 'Could not remove that file.' }
  }
  if (!data) return { error: 'That file is already removed.' }

  const editable = await assertEditableDraft(supabase, org.id, data.draft_id)
  if ('error' in editable) return editable

  const { error: deleteError } = await supabase
    .from('inbox_draft_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
  if (deleteError) {
    console.error(`attachments: delete failed: ${deleteError.code} ${deleteError.message}`)
    return { error: 'Could not remove that file.' }
  }

  // Only an 'upload' object is owned by this draft. An 'inbox' or 'document'
  // path is the live file elsewhere in the app — deleting it here would
  // destroy a governing document because someone changed their mind about an
  // attachment.
  if (data.source === 'upload') {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([data.storage_path])
    if (storageError) {
      // Not fatal: the row is gone, so the file will not be sent. A stray
      // object is a housekeeping matter, not a correctness one.
      console.error(`attachments: storage cleanup failed: ${storageError.message}`)
    }
  }

  if (editable.threadId) revalidatePath(`/inbox/${editable.threadId}`)
  return { ok: true }
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function inferContentType(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[extension] ?? null
}
