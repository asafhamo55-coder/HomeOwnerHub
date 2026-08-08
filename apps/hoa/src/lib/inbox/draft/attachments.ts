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

/**
 * Why a filename is refused at ATTACH time, not only at send time.
 *
 * `assertSafeFileName` in packages/mailbox/src/send.ts rejects `"`, CR, LF
 * and an empty name — correctly, and it stays there as the last line of
 * defence. But `buildMimeMessage` is called INSIDE `sendToGmail`, so a throw
 * from it lands in that function's catch, which calls `fail()` and writes the
 * raw internal message into `inbox_drafts.error`. A board member who attaches
 * a library document legitimately named `2025 "Approved" Budget.pdf`, then
 * approves it, would after the undo window be shown "Sending this reply
 * failed", that raw internal string, and the amber banner warning them the
 * reply MAY ALREADY HAVE REACHED THE RESIDENT and to check the Sent folder
 * before rewriting. Nothing was sent — the throw happens before `sendReply`
 * is reached — so that warning is actively false, and the document is
 * unattachable with no way to discover why.
 *
 * Refusing at attach time instead puts a plain explanation inline in the
 * picker, while the draft is still editable and nothing is at stake.
 *
 * Lives here rather than in attachment-actions.ts because that module is
 * `'use server'` and may export only async functions — the same reason
 * `checkAttachmentFits` above lives here.
 *
 * Returns a user-facing message, or null when the name is fine.
 */
export function attachmentNameProblem(fileName: string): string | null {
  if (/[\r\n]/.test(fileName)) {
    return "That file's name contains a line break, which cannot be put in an email. Rename the file and attach it again."
  }
  if (fileName.includes('"')) {
    return 'That file\'s name contains a double quote ("), which cannot be put in an email. Rename the file and attach it again.'
  }
  if (fileName.trim() === '') {
    return 'That file has no name, so it cannot be attached. Rename the file and attach it again.'
  }
  return null
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
