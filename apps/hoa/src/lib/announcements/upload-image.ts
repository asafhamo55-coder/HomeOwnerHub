'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { createAnnouncementImageUpload } from './image-actions'

/** Uploads one pasted image, browser → storage. Returns the id the message refers to. */
export async function uploadAnnouncementImage(file: File): Promise<{ id: string; orgId: string }> {
  const slot = await createAnnouncementImageUpload(file.type, file.size)
  if (!slot.ok) throw new Error(slot.error)
  const { error } = await getSupabaseBrowserClient()
    .storage.from('hoa-documents')
    .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type })
  if (error) throw new Error('The upload did not finish. Try again.')
  return { id: slot.id, orgId: slot.orgId }
}
