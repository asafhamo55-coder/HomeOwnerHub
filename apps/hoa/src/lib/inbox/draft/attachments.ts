/**
 * Pure attachment-size arithmetic, shared by the composer (which must refuse
 * a file before uploading it) and the server action that queues the send
 * (which must refuse it again, because a client check is an affordance and
 * not a guarantee).
 *
 * No `'use server'` directive — see blanks.ts for why.
 */

/**
 * 15MB of raw file bytes. Base64 inflates roughly a third, so a full load
 * becomes about 20MB on the wire: under Gmail's 25MB send ceiling with room
 * for headers and the body, and under what most receiving servers accept.
 * Never write this as a literal.
 */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

export function remainingBudget(existing: Array<{ sizeBytes: number }>): number {
  const used = existing.reduce((total, file) => total + file.sizeBytes, 0)
  return Math.max(0, MAX_ATTACHMENT_BYTES - used)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function checkAttachmentFits(
  existing: Array<{ sizeBytes: number }>,
  incoming: number,
): { ok: true } | { ok: false; error: string } {
  if (incoming <= 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  const remaining = remainingBudget(existing)
  if (incoming > remaining) {
    // formatBytes(MAX_ATTACHMENT_BYTES) renders "15.0 MB" (it always keeps
    // one decimal, per the KB/MB cases below) — derive the cap's whole-MB
    // figure straight from the constant instead, so this stays in lockstep
    // with MAX_ATTACHMENT_BYTES without a magic "15" literal anywhere.
    const capMb = MAX_ATTACHMENT_BYTES / (1024 * 1024)
    return {
      ok: false,
      error: `A message can carry ${capMb} MB of attachments. ${formatBytes(remaining)} left.`,
    }
  }
  return { ok: true }
}
