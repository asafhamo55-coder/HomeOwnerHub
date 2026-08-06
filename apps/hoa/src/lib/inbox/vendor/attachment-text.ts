/**
 * Text extraction from a thread's stored PDF attachments, for W33.
 *
 * This is the v2 the vendor spec deferred: a W-9 is the one place an EIN is
 * genuinely knowable, and without it a fast-created vendor is permanently
 * "setup incomplete".
 *
 * NOT a `'use server'` module — it exports non-async helpers, and the pure
 * half (`selectParsableAttachments`, `joinAttachmentText`) is what the unit
 * tests exercise. The I/O half lives in the action that calls it.
 *
 * Never log a file name, a storage path, or extracted text: an attachment
 * on a resident thread can be a violation photo, a lease, or a tax form.
 */

/** Attachment rows this module knows how to consider. */
export interface CandidateAttachment {
  id: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  storage_path: string | null
  fetch_status: string
}

export interface ParsableAttachment {
  id: string
  fileName: string
  storagePath: string
}

/**
 * Caps, chosen against what the live table actually holds: of 200 sampled
 * rows, 105 were PDFs ranging ~20KB to ~1.5MB.
 *
 * The point of each cap is different, so they are separate constants rather
 * than one "limits" blob:
 */
/** Per-file. Above this a PDF is a scan or a brochure, not a form. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
/** How many to open. A W-9 is never the eleventh attachment. */
export const MAX_ATTACHMENTS = 5
/** Total characters handed to the model, so one long PDF cannot crowd out
 *  the email body or blow the context window. */
export const MAX_TOTAL_CHARS = 20_000

/**
 * Which attachments are worth opening.
 *
 * Only PDFs, only ones actually stored, only under the size cap — and
 * `storage_path` must be present, which the schema allows to be null until
 * the fetch job succeeds.
 */
export function selectParsableAttachments(
  attachments: CandidateAttachment[],
): ParsableAttachment[] {
  return attachments
    .filter((a) => a.fetch_status === 'stored')
    .filter((a) => Boolean(a.storage_path))
    .filter((a) => {
      const type = (a.content_type ?? '').toLowerCase()
      // Some senders ship a PDF as application/octet-stream, so fall back to
      // the extension rather than missing a real W-9 on a MIME technicality.
      return type.includes('pdf') || a.file_name.toLowerCase().endsWith('.pdf')
    })
    .filter((a) => a.size_bytes === null || a.size_bytes <= MAX_ATTACHMENT_BYTES)
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      id: a.id,
      fileName: a.file_name,
      storagePath: a.storage_path as string,
    }))
}

/**
 * Join per-file text into the single block W33 receives, truncated as a
 * whole.
 *
 * Each file is labelled, because "which document did the EIN come from" is
 * the question the reviewer has to answer when confirming it — an unlabelled
 * concatenation makes that unanswerable.
 *
 * Returns null when there is nothing usable, which is also the signal that
 * forbids an EIN in W33's output.
 */
export function joinAttachmentText(
  files: Array<{ fileName: string; text: string }>,
): string | null {
  const usable = files.filter((f) => f.text.trim().length > 0)
  if (usable.length === 0) return null

  const joined = usable.map((f) => `--- ${f.fileName} ---\n${f.text.trim()}`).join('\n\n')

  return joined.length > MAX_TOTAL_CHARS
    ? `${joined.slice(0, MAX_TOTAL_CHARS)}\n[truncated]`
    : joined
}
