/**
 * BL-105 — the receiving server's SPF / DKIM / DMARC verdict for a message,
 * read from its `Authentication-Results` header (RFC 8601).
 *
 * The From header is whatever the sender typed. Gmail checks it on the way
 * in and records what it found in an `Authentication-Results` header it
 * PREPENDS to the message. That header is the only part of an inbound
 * message we can trust about who sent it, and only under two rules:
 *
 *   1. TOPMOST ONLY. A sender can put any header they like in their own
 *      message, including a fake `Authentication-Results: mx.google.com;
 *      dmarc=pass`. The receiving server adds its own ABOVE everything the
 *      sender wrote, so only the first one in header order is the
 *      receiver's. If the first one is not from a trusted server, the
 *      answer is `none` — we never go looking further down for a better one.
 *   2. TRUSTED AUTHSERV-ID. The first token names the server that did the
 *      check. Only ids in `trustedAuthServIds` (Gmail: `mx.google.com`)
 *      count.
 *
 * Verdict, in order:
 *   - `fail`: dmarc=fail.
 *   - `pass`: dmarc=pass, or dkim=pass / spf=pass for a domain aligned with
 *     the From address.
 *   - `fail`: no pass above, and spf=fail|softfail or dkim=fail. Withholding
 *     is the safe direction: a forwarded email that loses its SPF only
 *     loses the account details in a draft, never the message.
 *   - `none`: nothing conclusive (no trusted header, dmarc=none,
 *     temperror, neutral, or only unaligned passes).
 *
 * Alignment is "relaxed" without a public-suffix list: the signing / mail
 * domain equals the From domain or is a parent of it (`example.com` signs
 * for `mail.example.com`). Sibling subdomains are treated as unaligned —
 * conservative, so it can only turn a pass into `none`, never the reverse.
 *
 * Pure. Never logs (the header carries addresses).
 */

export type SenderAuthVerdict = 'pass' | 'fail' | 'none'

export const SENDER_AUTH_VERDICTS: readonly SenderAuthVerdict[] = ['pass', 'fail', 'none']

/** Gmail and Google Workspace both stamp their checks with this id. */
export const DEFAULT_TRUSTED_AUTHSERV_IDS: readonly string[] = ['mx.google.com']

/**
 * BL-105 flag. `inbox_messages.sender_auth` does not exist until the owner
 * applies docs/specs/2026-10-20-inbound-auth.sql. While false, ingest does
 * not write the column and the Inbox does not read it (every sender behaves
 * exactly as before BL-105). Flip to true in the same deploy that follows
 * the migration — both the hoa app and packages/jobs read this constant.
 */
export const SENDER_AUTH_COLUMN_LIVE = true

interface ResInfo {
  method: string
  result: string
  props: Record<string, string>
}

/** Remove RFC 5322 comments `( … )`, nested, outside double quotes. */
function stripComments(value: string): string {
  let out = ''
  let depth = 0
  let inQuotes = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!
    if (ch === '\\' && i + 1 < value.length) {
      if (depth === 0) out += ch + value[i + 1]
      i++
      continue
    }
    if (depth === 0 && ch === '"') inQuotes = !inQuotes
    if (!inQuotes && ch === '(') {
      depth++
      continue
    }
    if (!inQuotes && ch === ')' && depth > 0) {
      depth--
      continue
    }
    if (depth === 0) out += ch
  }
  return out
}

function parseHeader(value: string): { authServId: string; results: ResInfo[] } | null {
  const segments = stripComments(value)
    .replace(/\s+/g, ' ')
    .split(';')
    .map((s) => s.trim())
  const head = segments.shift()
  if (!head) return null
  // authserv-id [ version ]
  const authServId = head.split(' ')[0]!.toLowerCase()
  if (!authServId) return null

  const results: ResInfo[] = []
  for (const seg of segments) {
    if (!seg) continue
    const tokens = seg.split(' ').filter(Boolean)
    const first = tokens.shift()
    const m = first?.match(/^([a-z0-9_-]+)(?:\/\d+)?=([a-z]+)$/i)
    if (!m) continue
    const props: Record<string, string> = {}
    for (const t of tokens) {
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const key = t.slice(0, eq).toLowerCase()
      const val = t.slice(eq + 1).replace(/^"(.*)"$/, '$1').toLowerCase()
      if (!(key in props)) props[key] = val
    }
    results.push({ method: m[1]!.toLowerCase(), result: m[2]!.toLowerCase(), props })
  }
  return { authServId, results }
}

/** `user@Mail.Example.com` → `mail.example.com`; `@x.org` → `x.org`; `x.org` → `x.org`. */
export function domainOf(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase().replace(/^<|>$/g, '')
  const at = v.lastIndexOf('@')
  const d = (at >= 0 ? v.slice(at + 1) : v).replace(/\.$/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}

/** Relaxed alignment, conservatively: equal, or `other` is a parent of `from`. */
export function domainsAligned(fromDomain: string | null, other: string | null): boolean {
  if (!fromDomain || !other) return false
  if (fromDomain === other) return true
  // A bare TLD is never a parent we accept.
  return other.includes('.') && fromDomain.endsWith(`.${other}`)
}

export function senderAuthVerdict(
  authResultsHeaders: readonly string[],
  fromEmail: string | null,
  trustedAuthServIds: readonly string[] = DEFAULT_TRUSTED_AUTHSERV_IDS,
): SenderAuthVerdict {
  const top = authResultsHeaders[0]
  if (!top) return 'none'
  const parsed = parseHeader(top)
  if (!parsed) return 'none'
  const trusted = trustedAuthServIds.map((s) => s.toLowerCase())
  if (!trusted.includes(parsed.authServId)) return 'none'

  const fromDomain = domainOf(fromEmail)
  const of = (method: string) => parsed.results.filter((r) => r.method === method)
  const dmarc = of('dmarc')
  const dkim = of('dkim')
  const spf = of('spf')

  if (dmarc.some((r) => r.result === 'fail')) return 'fail'
  if (dmarc.some((r) => r.result === 'pass')) return 'pass'

  const dkimAlignedPass = dkim.some(
    (r) => r.result === 'pass' && domainsAligned(fromDomain, domainOf(r.props['header.d'] ?? r.props['header.i'])),
  )
  const spfAlignedPass = spf.some(
    (r) => r.result === 'pass' && domainsAligned(fromDomain, domainOf(r.props['smtp.mailfrom'])),
  )
  if (dkimAlignedPass || spfAlignedPass) return 'pass'

  if (spf.some((r) => r.result === 'fail' || r.result === 'softfail')) return 'fail'
  if (dkim.some((r) => r.result === 'fail')) return 'fail'
  return 'none'
}

/** A stored value back to a verdict; anything unknown (incl. null) is `none`. */
export function toSenderAuthVerdict(value: unknown): SenderAuthVerdict {
  return value === 'pass' || value === 'fail' ? value : 'none'
}
