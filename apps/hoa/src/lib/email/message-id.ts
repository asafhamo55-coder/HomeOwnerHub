/**
 * Our own RFC 5322 Message-ID for a communication email, so a resident's
 * reply can be linked back to the communication_recipients row it answers.
 *
 * Why not communication_recipients.external_id: that column holds Resend's
 * API id (`result.data.id`), which delivery webhooks key on (`email_id`). A
 * reply's In-Reply-To / References carry the SMTP Message-ID instead, which
 * is never the Resend API id. Storing the SMTP id would need a new column;
 * deriving it from the recipient row id needs none — the row exists before
 * the send, and the id is recovered from the reply's headers.
 *
 * Shape: `<hoh-cr.{recipientUuid}@{EMAIL_FROM domain}>`.
 *
 * Pure: no env, no I/O.
 */

const PREFIX = 'hoh-cr.'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OURS = new RegExp(`^${PREFIX.replace('.', '\\.')}(${UUID})@[^\\s<>@]+$`, 'i')
const UUID_ONLY = new RegExp(`^${UUID}$`, 'i')

/** The domain of EMAIL_FROM ("Name <a@b.com>" or "a@b.com"), or null. */
export function senderDomain(envFrom: string): string | null {
  const addr = envFrom.match(/<([^<>]+)>/)?.[1] ?? envFrom
  const at = addr.trim().lastIndexOf('@')
  if (at < 0) return null
  const domain = addr.trim().slice(at + 1).toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

/** `<hoh-cr.{id}@{domain}>`, or null when either part is unusable (then no header is set). */
export function recipientMessageId(recipientId: string, envFrom: string): string | null {
  const domain = senderDomain(envFrom)
  if (!domain || !UUID_ONLY.test(recipientId)) return null
  return `<${PREFIX}${recipientId.toLowerCase()}@${domain}>`
}

/** Every `<…>` id in a header value; a bare id when there are no brackets. */
export function messageIdsIn(header: string | null | undefined): string[] {
  if (!header) return []
  const bracketed = [...header.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]!)
  if (bracketed.length > 0) return bracketed
  return header.split(/\s+/).filter(Boolean)
}

/**
 * The recipient row ids named by our Message-IDs among `ids`. Anything not in
 * our exact shape is ignored — a foreign id that merely contains a uuid
 * does not count.
 */
export function recipientIdsFromMessageIds(ids: string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    const m = id.trim().replace(/^<|>$/g, '').match(OURS)
    if (m) out.add(m[1]!.toLowerCase())
  }
  return [...out]
}
