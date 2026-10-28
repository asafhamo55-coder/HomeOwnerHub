'use client'

// The repo's singleton, NOT a bare createBrowserClient — one browser client
// per page load, so we don't add duplicate auth listeners and websocket fanout
// every time a composer mounts.
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { addDraftAttachment, createAttachmentUploadUrl } from './attachment-actions'

const BUCKET = 'hoa-documents'

/**
 * Upload one file from the browser and attach it to the draft. Shared by
 * the picker's "Upload a file" and an image pasted into the message.
 *
 * Bytes go browser → storage directly. A server action caps its request
 * body at 1MB, so a 15MB file could never pass through one. The caller
 * checks the size budget first; both server actions check it again.
 */
export async function uploadDraftAttachment(draftId: string, file: File): Promise<{ ok: true } | { error: string }> {
  const signed = await createAttachmentUploadUrl(draftId, file.name, file.size)
  if ('error' in signed) return signed
  const { error: uploadError } = await getSupabaseBrowserClient()
    .storage.from(BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file)
  if (uploadError) return { error: 'The upload did not finish. Try again.' }
  return addDraftAttachment(draftId, 'upload', signed.path, {
    fileName: file.name,
    contentType: file.type || null,
    sizeBytes: file.size,
  })
}
