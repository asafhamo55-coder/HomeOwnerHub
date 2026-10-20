/**
 * BL-101 A9 — what a batch reply body may contain, and how it is filled in
 * for each thread.
 *
 * One body goes to many residents, so it must say nothing about any one of
 * them. Enforced here, not left to care:
 *   - no `[[BLANK: …]]` (approveDraft refuses them anyway; checked first so
 *     the board hears it once, not once per thread);
 *   - no `{{balance}}` — account data is per-home and gated per sender
 *     (A2), which a shared body cannot honour;
 *   - only the merge fields that are safe for anyone: `{{first_name}}`
 *     (the recipient's OWN display name), `{{portal_link}}`, `{{arc_link}}`.
 *
 * Pure: relative imports only, unit-tested.
 */

import { firstNameFrom, renderSavedReply } from '../saved-replies'

export const MAX_BATCH_BODY = 10_000

const SAFE_FIELDS = new Set(['first_name', 'portal_link', 'arc_link'])

export function batchBodyProblem(body: string): string | null {
  const text = body.trim()
  if (!text) return 'Write the reply first.'
  if (text.length > MAX_BATCH_BODY) return 'Keep the reply under 10,000 characters.'
  if (/\[\[\s*BLANK/i.test(text)) return 'Fill in or remove every [[BLANK]] before sending — one reply goes to everyone.'
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    const field = m[1]!.toLowerCase()
    if (field === 'balance') {
      return 'A reply to many residents can’t include a balance. Remove {{balance}} and answer account questions one by one.'
    }
    if (!SAFE_FIELDS.has(field)) return `{{${field}}} can’t be filled in for a batch reply. Remove it.`
  }
  return null
}

/** "Re: <subject>" for the thread, without stacking prefixes. */
export function batchReplySubject(threadSubject: string | null): string {
  const s = (threadSubject ?? '').trim()
  if (!s) return 'Re: your message'
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`
}

/** The body for one thread. Only call after batchBodyProblem() is null. */
export function renderBatchBody(
  body: string,
  v: { fromName: string | null; portalLink: string; arcLink: string },
): string {
  return renderSavedReply(body.trim(), {
    firstName: firstNameFrom(v.fromName),
    // Never filled in a batch; batchBodyProblem already refused it.
    balance: null,
    portalLink: v.portalLink,
    arcLink: v.arcLink,
  })
}
