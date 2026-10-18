// BL-079 — which of an ARC application's attachments the board review reads,
// and loading them for the vision model.
//
// Same limits and the same transport as the inbox's photo findings
// (lib/inbox/draft/photo-findings.ts): images are inlined as base64 data
// URLs, never signed URLs (a signed URL is publicly fetchable for its whole
// lifetime, and these are photos of somebody's home), with per-image and
// per-batch byte caps that keep the request under the provider's limit.
//
// The references handed to the workflow are attachment ids and "Photo N"
// labels — never the file name, which can carry a name or an address.
// Never log a file name, a storage path or an image.
//
// Pure selection plus one I/O function that takes the caller's client (the
// board member's RLS client, or the service role in the after-submit run).
// Relative imports only.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { ATTACHMENT_BUCKET } from '../attachment-rules'

type Db = SupabaseClient<Database>

/**
 * Per-image ceiling. Groq takes a base64 image up to 4MB, and base64
 * inflates by ~33%, so 3MB raw is the largest that fits. Bigger phone photos
 * are skipped and counted in the review's warning.
 */
export const ARC_PHOTO_MAX_BYTES = 3 * 1024 * 1024

/** Total raw bytes across the batch: ~16MB base64, under Groq's 20MB request limit. */
export const ARC_PHOTO_MAX_TOTAL_BYTES = 12 * 1024 * 1024

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i

export interface ArcAttachmentCandidate {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  storagePath?: string | null
}

export interface SelectedArcPhoto {
  id: string
  label: string
  contentType: string
  sizeBytes: number
  storagePath: string | null
}

function imageType(a: ArcAttachmentCandidate): string | null {
  const type = (a.contentType ?? '').toLowerCase()
  if (type.includes('heic') || type.includes('heif') || /\.hei[cf]$/i.test(a.fileName)) return null
  if (type.startsWith('image/')) return type
  // Some uploads arrive as application/octet-stream: trust the extension.
  const ext = a.fileName.toLowerCase().match(IMAGE_EXT)?.[1]
  if (!ext) return null
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * The photos a review reads, in upload order, and how many attachments it
 * leaves unread (not an image the model can open, too large, or over the
 * limit). PDFs are plans the board opens itself; HEIC no endpoint here decodes.
 */
export function selectArcPhotos(rows: ArcAttachmentCandidate[], max: number): { selected: SelectedArcPhoto[]; skipped: number } {
  const selected: SelectedArcPhoto[] = []
  let total = 0
  for (const a of rows) {
    if (selected.length >= max) continue
    const type = imageType(a)
    const size = a.sizeBytes ?? 0
    if (!type || size > ARC_PHOTO_MAX_BYTES || total + size > ARC_PHOTO_MAX_TOTAL_BYTES) continue
    total += size
    selected.push({ id: a.id, label: `Photo ${selected.length + 1}`, contentType: type, sizeBytes: size, storagePath: a.storagePath ?? null })
  }
  return { selected, skipped: rows.length - selected.length }
}

export interface LoadedArcPhotos {
  photos: Array<{ attachmentId: string; label: string }>
  /** Data URLs, in the same order as `photos`. Never stored. */
  images: string[]
  skipped: number
}

const NONE: LoadedArcPhotos = { photos: [], images: [], skipped: 0 }

async function listArcAttachments(db: Db, args: { orgId: string; arcId: string }): Promise<ArcAttachmentCandidate[] | null> {
  const { data, error } = await db
    .from('submission_attachments' as never)
    .select('id, file_name, content_type, size_bytes, storage_path')
    .eq('organization_id' as never, args.orgId)
    .eq('thread_type' as never, 'arc')
    .eq('parent_id' as never, args.arcId)
    .order('created_at' as never, { ascending: true })
  if (error) {
    console.error('arc review photos failed', { stage: 'list', arcId: args.arcId, code: (error as { code?: string }).code ?? 'unknown' })
    return null
  }
  return ((data ?? []) as unknown as Array<{ id: string; file_name: string; content_type: string | null; size_bytes: number | null; storage_path: string }>).map(
    (r) => ({ id: r.id, fileName: r.file_name, contentType: r.content_type, sizeBytes: r.size_bytes, storagePath: r.storage_path }),
  )
}

/** The attachment ids a review would read now, or null when the list failed. */
export async function currentArcPhotoIds(db: Db, args: { orgId: string; arcId: string; max: number }): Promise<string[] | null> {
  const rows = await listArcAttachments(db, args)
  return rows ? selectArcPhotos(rows, args.max).selected.map((p) => p.id) : null
}

/** Load the selected photos for one application. Never throws: a failure is fewer photos. */
export async function loadArcPhotos(db: Db, args: { orgId: string; arcId: string; max: number }): Promise<LoadedArcPhotos> {
  const rows = await listArcAttachments(db, args)
  if (!rows) return NONE
  const { selected, skipped } = selectArcPhotos(rows, args.max)

  const out: LoadedArcPhotos = { photos: [], images: [], skipped }
  for (const p of selected) {
    try {
      const { data: blob, error: dlError } = await db.storage.from(ATTACHMENT_BUCKET).download(p.storagePath ?? '')
      if (dlError || !blob) {
        console.error('arc review photos failed', { stage: 'download', arcId: args.arcId, attachmentId: p.id })
        out.skipped++
        continue
      }
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      out.photos.push({ attachmentId: p.id, label: `Photo ${out.photos.length + 1}` })
      out.images.push(`data:${p.contentType};base64,${base64}`)
    } catch (err) {
      console.error('arc review photos failed', { stage: 'read', arcId: args.arcId, attachmentId: p.id, errorName: err instanceof Error ? err.name : 'UnknownError' })
      out.skipped++
    }
  }
  return out
}
