'use server'

/**
 * Hosting for an image pasted into an announcement (see ./inline-images.ts
 * for why it is hosted rather than attached).
 *
 * The browser asks here for a one-shot signed upload slot under
 * `<orgId>/announcement-images/<uuid>.<ext>` in the private hoa-documents
 * bucket and PUTs the bytes to storage itself (a server action body is
 * capped at 1MB). The org prefix is what the bucket's insert policy
 * requires, and it comes from the role gate, never from the caller. The
 * public read goes through /api/announcement-image, which serves only this
 * prefix. Never log a file name or the bytes; ids and codes only.
 */

import { randomUUID } from 'node:crypto'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isInlineImageType } from '@/lib/inbox/draft/inline-images'
import { MAX_ANNOUNCEMENT_IMAGE_BYTES } from './inline-images'

const BUCKET = 'hoa-documents'
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

export type AnnouncementImageSlot =
  | { ok: true; id: string; orgId: string; path: string; token: string }
  | { ok: false; error: string }

export async function createAnnouncementImageUpload(contentType: string, sizeBytes: number): Promise<AnnouncementImageSlot> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof contentType !== 'string' || !isInlineImageType(contentType)) {
    return { ok: false, error: 'Only PNG, JPG, GIF or WebP images can go in a message.' }
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
    return { ok: false, error: 'That image is too large. Keep it under 5 MB.' }
  }
  const id = `${randomUUID()}.${EXT[contentType]}`
  const path = `${gate.orgId}/announcement-images/${id}`
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[announcement-image] upload slot failed', { orgId: gate.orgId })
    return { ok: false, error: 'The image could not be prepared. Try again.' }
  }
  return { ok: true, id, orgId: gate.orgId, path, token: data.token }
}
