/**
 * Vendor certificate-of-insurance expiry (BL-083): one rule for "expiring"
 * and "expired", and the email the board can choose to send. Pure, no
 * node built-ins — safe to import anywhere.
 *
 * OWNER RULE (2026-10-20): nothing emails anyone outside the board
 * automatically. The daily job only tells the board (in-app notice); the
 * dashboard and the vendor page show the state; the vendor email below is a
 * DRAFT the board reviews, edits and sends with an explicit click, to the
 * vendor's own address on file and nobody else.
 *
 * Dates are date-only strings compared on their Y-M-D parts, against the
 * association's own calendar day (BL-043).
 */

/** "Expiring" means the certificate expires within this many days. */
export const COI_WARNING_DAYS = 30

export type CoiExpiryState = 'expired' | 'expiring' | 'current'

function dayNumber(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return Number.NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

/** Whole calendar days from `today` to `expiresOn`; negative once expired. NaN on a bad date. */
export function coiDaysLeft(expiresOn: string, today: string): number {
  return dayNumber(expiresOn) - dayNumber(today)
}

/**
 * 'expired' from the day after the expiration date, 'expiring' from
 * COI_WARNING_DAYS out through the expiration day itself, else 'current'.
 * Null when there is no usable date.
 */
export function coiExpiryState(expiresOn: string | null | undefined, today: string): CoiExpiryState | null {
  if (!expiresOn) return null
  const days = coiDaysLeft(expiresOn, today)
  if (!Number.isFinite(days)) return null
  if (days < 0) return 'expired'
  if (days <= COI_WARNING_DAYS) return 'expiring'
  return 'current'
}

/** "Expired 3 days ago" / "Expires today" / "Expires in 12 days". */
export function coiExpiryLabel(daysLeft: number): string {
  if (daysLeft < 0) {
    const ago = -daysLeft
    return `Expired ${ago} day${ago === 1 ? '' : 's'} ago`
  }
  if (daysLeft === 0) return 'Expires today'
  return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
}

/** "October 25, 2026" for a date-only value, in UTC so it never shifts a day. */
export function formatCoiDate(day: string): string {
  const n = dayNumber(day)
  if (!Number.isFinite(n)) return day
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(n * 86_400_000),
  )
}

export interface CoiRequestDraftInput {
  associationName: string
  vendorName: string
  /** Null when no certificate date is on file. */
  expiresOn: string | null
  today: string
  /** Plain lines from insuranceRequirementLines; empty for none. */
  requirementLines: string[]
}

/** Subject and plain-text body for the board to review before sending. */
export function draftCoiRequest(i: CoiRequestDraftInput): { subject: string; body: string } {
  const days = i.expiresOn ? coiDaysLeft(i.expiresOn, i.today) : Number.NaN
  const date = i.expiresOn ? formatCoiDate(i.expiresOn) : null
  const subject = `Updated certificate of insurance for ${i.associationName}`
  const lead = !date
    ? `${i.associationName} does not have a current certificate of insurance on file for ${i.vendorName}.`
    : days < 0
      ? `The certificate of insurance ${i.associationName} has on file for ${i.vendorName} expired on ${date}.`
      : days === 0
        ? `The certificate of insurance ${i.associationName} has on file for ${i.vendorName} expires today.`
        : `The certificate of insurance ${i.associationName} has on file for ${i.vendorName} expires on ${date}.`
  const req =
    i.requirementLines.length === 0
      ? ''
      : `\n\nThe updated certificate must show at least:\n${i.requirementLines.map((l) => `- ${l}`).join('\n')}`
  const body = `Hello ${i.vendorName},

${lead}

Please reply to this email with your updated certificate attached so we can keep it on file.${req}

If you have already sent it, thank you, and please disregard this message.

${i.associationName} Board`
  return { subject, body }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The board's (possibly edited) plain text as simple HTML: escaped, one <p> per blank-line block. */
export function coiRequestHtml(body: string): string {
  const paras = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  return `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;line-height:1.5;">
${paras}
</body></html>`
}
