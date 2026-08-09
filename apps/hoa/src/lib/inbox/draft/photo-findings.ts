/**
 * Reading the photos a resident attached, so W34's work order can describe
 * what is actually wrong rather than only what the owner wrote.
 *
 * Mirrors the split `vendor/attachment-text.ts` established: the selection
 * predicate is pure and unit-tested; the download-and-ask half is the async
 * export below.
 *
 * Images are sent as base64 data URLs, NOT as signed storage URLs. A signed
 * URL is publicly fetchable by anyone holding it for its whole lifetime, and
 * these are photos of the inside of somebody's home. Inlining the bytes keeps
 * them out of any public URL space; the cost is request size, which is what
 * the caps below are for.
 *
 * Never log a file name, a storage path, or a finding.
 */

import { z } from 'zod'
import { analyzeImages, MAX_IMAGES_PER_REQUEST } from '@homeowner-portal/ai'
import type { PhotoFinding } from '@homeowner-portal/workflows'
import type { CandidateAttachment } from '@/lib/inbox/vendor/attachment-text'

export interface SelectedPhoto {
  id: string
  fileName: string
  storagePath: string
  contentType: string
}

/**
 * Per-image ceiling. Groq caps the WHOLE request at 20MB, and base64 inflates
 * by ~33%, so five images at this size is ~20MB before headers — hence the
 * total budget below rather than this cap alone.
 */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024

/**
 * Total raw bytes across the batch. 12MB raw → ~16MB base64, leaving headroom
 * under Groq's 20MB request limit for the prompt and JSON envelope.
 */
export const MAX_TOTAL_PHOTO_BYTES = 12 * 1024 * 1024

/** Extensions we will hand to a vision model, keyed by what it can decode. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i

/**
 * Which attachments are worth showing the model.
 *
 * HEIC is deliberately excluded even though iPhones produce it constantly:
 * no vision endpoint here decodes it, and sending one costs a request to
 * learn nothing. It rides along as an attachment for the vendor either way.
 */
export function selectPhotoAttachments(attachments: CandidateAttachment[]): SelectedPhoto[] {
  const selected: SelectedPhoto[] = []
  let totalBytes = 0

  for (const attachment of attachments) {
    if (selected.length >= MAX_IMAGES_PER_REQUEST) break
    if (attachment.fetch_status !== 'stored' || !attachment.storage_path) continue

    const type = (attachment.content_type ?? '').toLowerCase()
    // Some senders ship a photo as application/octet-stream, so fall back to
    // the extension rather than missing a real photo on a MIME technicality —
    // the same allowance selectParsableAttachments makes for PDFs.
    const looksLikeImage = type.startsWith('image/') || IMAGE_EXTENSIONS.test(attachment.file_name)
    if (!looksLikeImage) continue
    if (type.includes('heic') || type.includes('heif')) continue
    if (/\.hei[cf]$/i.test(attachment.file_name)) continue

    const size = attachment.size_bytes ?? 0
    if (size > MAX_PHOTO_BYTES) continue
    if (totalBytes + size > MAX_TOTAL_PHOTO_BYTES) continue

    totalBytes += size
    selected.push({
      id: attachment.id,
      fileName: attachment.file_name,
      storagePath: attachment.storage_path,
      contentType: type.startsWith('image/') ? type : inferImageType(attachment.file_name),
    })
  }

  return selected
}

function inferImageType(fileName: string): string {
  const match = fileName.toLowerCase().match(IMAGE_EXTENSIONS)
  const ext = match?.[1]
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * What we ask the model.
 *
 * Scoped hard to observable physical condition. The model is NOT asked what
 * caused the problem, how bad it is, or what it will cost — a vendor acts on
 * this text, and a confident guess about cause is how the wrong trade gets
 * dispatched. Same discipline as W34's own rules 1–3.
 */
const PHOTO_QUESTION = `These photos were attached by a homeowner reporting a problem at their property. A contractor will read your description to decide what to bring and what to inspect.

For EACH image, describe only what is physically visible: the affected surface or fixture, where it is, its apparent extent, and any visible staining, cracking, corrosion, breakage, or debris.

RULES
- Describe only what you can see. Do not infer a cause.
- Do not estimate cost, severity, urgency, or who is responsible.
- Do not identify people. If a person appears, ignore them.
- If an image shows nothing relevant to a property problem, say so for that image.
- One or two sentences per image. A contractor reads this on a phone.

Return JSON only:
{"findings": [{"index": 0, "finding": "what is visible in the first image"}]}

"index" is the image's position in the order given, starting at 0.`

const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      index: z.number().int().min(0),
      finding: z.string(),
    }),
  ),
})

/**
 * Downloads the selected photos and returns one finding per image the model
 * actually described.
 *
 * Returns `[]` on any failure rather than throwing. A work order missing its
 * photo descriptions is still a usable work order — the images are attached
 * regardless — whereas a vision outage that blocked drafting entirely would
 * take the whole feature down with it. The caller records the degradation.
 */
export async function readPhotoFindings(
  supabase: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  bucket: string,
  photos: SelectedPhoto[],
): Promise<PhotoFinding[]> {
  if (photos.length === 0) return []

  const dataUrls: string[] = []
  const included: SelectedPhoto[] = []

  for (const photo of photos) {
    try {
      const { data: blob, error } = await supabase.storage.from(bucket).download(photo.storagePath)
      if (error || !blob) {
        console.error(`readPhotoFindings: download failed for attachment ${photo.id}`)
        continue
      }
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      dataUrls.push(`data:${photo.contentType};base64,${base64}`)
      included.push(photo)
    } catch (err) {
      console.error(
        `readPhotoFindings: read failed for attachment ${photo.id}: ${err instanceof Error ? err.name : 'UnknownError'}`,
      )
    }
  }

  if (dataUrls.length === 0) return []

  let raw: string
  try {
    // max_tokens scaled to the batch, not fixed: this model bills output at
    // 5x input, and one or two sentences per image is the whole ask.
    raw = await analyzeImages({
      imageUrls: dataUrls,
      question: PHOTO_QUESTION,
      max_tokens: 120 * dataUrls.length + 80,
    })
  } catch (err) {
    console.error(
      `readPhotoFindings: vision call failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return []
  }

  return parsePhotoFindings(raw, included)
}

/**
 * Maps the model's indexed findings back onto the file names they describe.
 *
 * Exported for unit testing, and separate from the I/O for the same reason
 * W34's `processVendorRequestResponse` is: the root vitest harness is
 * pure-modules-only.
 *
 * An out-of-range or duplicate index is DROPPED rather than mapped to a
 * neighbouring file. Attributing a finding to the wrong photo is the one
 * failure a reviewer cannot catch — the digest names a file, the board member
 * opens that file, and it does not show what the line claims.
 */
export function parsePhotoFindings(raw: string, photos: SelectedPhoto[]): PhotoFinding[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Never log `raw`: it describes the inside of a resident's home.
    console.error('[photo-findings] model response was not JSON', { responseLength: raw.length })
    return []
  }

  const result = FindingsSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[photo-findings] model response failed schema validation')
    return []
  }

  const used = new Set<number>()
  const findings: PhotoFinding[] = []

  for (const item of result.data.findings) {
    const photo = photos[item.index]
    if (!photo || used.has(item.index)) continue
    if (item.finding.trim().length === 0) continue
    used.add(item.index)
    findings.push({ fileName: photo.fileName, finding: item.finding.trim() })
  }

  return findings
}
