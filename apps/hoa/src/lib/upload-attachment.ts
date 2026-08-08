'use client'

import { ATTACHMENT_BUCKET } from '@/lib/attachment-rules'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  prepareAttachmentUpload,
  recordAttachmentUpload,
  type ThreadType,
} from '@/lib/submission-attachments'

/**
 * Upload an attachment without routing its bytes through the server.
 *
 * Vercel caps a serverless function's request body at 4.5 MB, and no Next
 * config overrides it — `serverActions.bodySizeLimit` only raises Next's own
 * ceiling, not the platform's. A resident photographing a violation produces
 * a 3-6 MB image, so posting the file to a server action failed in
 * production with no way to succeed by retrying.
 *
 * Three steps: the server authorises and returns a path; the browser PUTs
 * the bytes straight to Supabase Storage using the signed-in user's own
 * session; the server records the metadata row under RLS. Only the first
 * and third cross Vercel, and both carry a few hundred bytes.
 *
 * If the object uploads but the metadata insert fails, the server deletes
 * the orphaned object — see `recordAttachmentUpload`.
 */
export async function uploadAttachmentDirect(
  threadType: ThreadType,
  parentId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prepared = await prepareAttachmentUpload({
    threadType,
    parentId,
    fileName: file.name,
    contentType: file.type || '',
    sizeBytes: file.size,
  })
  if (!prepared.ok) return { ok: false, error: prepared.error }

  const supabase = getSupabaseBrowserClient()
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(prepared.data.storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })

  if (uploadError) {
    // Surfaced verbatim: a bucket-missing or policy error here is
    // actionable, and burying it behind a generic message is what made the
    // original failure undiagnosable.
    return { ok: false, error: uploadError.message }
  }

  return recordAttachmentUpload({
    threadType,
    parentId,
    storagePath: prepared.data.storagePath,
    fileName: file.name,
    contentType: file.type || '',
    sizeBytes: file.size,
  })
}
