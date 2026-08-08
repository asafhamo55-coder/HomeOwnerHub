/**
 * Downloading and parsing stored PDF attachments.
 *
 * The I/O half that `vendor/attachment-text.ts` deliberately leaves to its
 * callers. Extracted here when W34 needed the same loop thread-scoped that
 * W33 already had message-scoped: two copies of a per-file swallow-and-
 * continue loop would have been two places for "a corrupt PDF must not fail
 * the whole extraction" to stop being true.
 *
 * `selectParsableAttachments` and `joinAttachmentText` stay pure in
 * `attachment-text.ts`; this module only does the downloading and parsing
 * between them.
 *
 * Never log a file name, a storage path, or extracted text: an attachment on
 * a resident thread can be a violation photo, a lease, or a tax form.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsableAttachment } from './vendor/attachment-text'

/**
 * Downloads and text-extracts each attachment, skipping any that fail.
 *
 * Every failure is swallowed per-file, deliberately: a corrupt or
 * password-protected PDF is common and not exceptional, and it must not fail
 * the whole extraction, which must not fail the caller. Returns one entry per
 * file that yielded text; the caller passes the result to
 * `joinAttachmentText`, whose null return is the signal that nothing was
 * readable.
 */
export async function readPdfTexts(
  // Loosely typed on purpose: the two callers hold differently-generic
  // Supabase clients, and neither needs this helper to know the schema — it
  // only touches `.storage`, which is identical across both.
  supabase: Pick<SupabaseClient, 'storage'>,
  bucket: string,
  parsable: ParsableAttachment[],
): Promise<Array<{ fileName: string; text: string }>> {
  if (parsable.length === 0) return []

  // Dynamic import: pdf-parse pulls a heavy native chain, and every call
  // site in this app imports it this way rather than paying for it on the
  // cold start of unrelated routes.
  let pdfParse: (buffer: Buffer) => Promise<{ text: string }>
  try {
    pdfParse = (await import('pdf-parse')).default as typeof pdfParse
  } catch (err) {
    console.error(
      `readPdfTexts: pdf-parse unavailable: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return []
  }

  const texts: Array<{ fileName: string; text: string }> = []
  for (const attachment of parsable) {
    try {
      const { data: blob, error: dlError } = await supabase.storage
        .from(bucket)
        .download(attachment.storagePath)
      if (dlError || !blob) {
        console.error(
          `readPdfTexts: download failed for attachment ${attachment.id}: ${dlError?.message ?? 'no body'}`,
        )
        continue
      }
      const parsed = await pdfParse(Buffer.from(await blob.arrayBuffer()))
      texts.push({ fileName: attachment.fileName, text: parsed.text ?? '' })
    } catch (err) {
      console.error(
        `readPdfTexts: parse failed for attachment ${attachment.id}: ${err instanceof Error ? err.name : 'UnknownError'}`,
      )
    }
  }

  return texts
}
