/**
 * BL-101 A4 — turning an email into a record: the pure parts.
 *
 * Everything here is deterministic text handling. No model call, so an
 * email cannot steer what is prefilled (SEC-004: templates, not AI).
 * No Supabase, no Next.
 */

import { redactContactPII } from '@homeowner-portal/ai/pii'
import { CONTACT_SUBJECT, normalizeEmail, normalizeMailing, normalizePhone } from '@/lib/contact-updates/model'
import { FROM_ASSISTANT_PARAM, FROM_BOARD_VALUE, clampHandoffText, handoffTopic } from '@/lib/resident-assistant/handoff'
import type { TicketCategory } from './ack'

/** The most a prefill puts in the violation wizard's notes. */
export const VIOLATION_NOTES_MAX = 2000

/**
 * The resident's own words, without the quoted thread below them: cut at
 * the first "On … wrote:" line or the first quoted (">") line.
 */
export function ownWords(text: string | null | undefined): string {
  const out: string[] = []
  for (const line of (text ?? '').split(/\r?\n/)) {
    const t = line.trim()
    if (t.startsWith('>')) break
    if (/^on .{3,200} wrote:$/i.test(t)) break
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(t)) break
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Notes for the violation wizard from an email: the newest inbound
 * message's own words, contact details redacted (emails, phones, street
 * addresses, unit numbers — the wizard sends these notes to AI and stores
 * them), whitespace tidied, capped.
 */
export function violationNotesFromEmail(text: string | null | undefined): string {
  const tidy = redactContactPII(ownWords(text))
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (tidy.length <= VIOLATION_NOTES_MAX) return tidy
  return `${tidy.slice(0, VIOLATION_NOTES_MAX - 1).trimEnd()}…`
}

const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}\b/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const MAILING_RE = /^\s*(?:my\s+)?(?:new\s+)?mailing address(?:\s+is)?\s*[:-]?\s*(.+)$/im

/**
 * M-2: while BL-105's sender-auth column is off (SENDER_AUTH_COLUMN_LIVE),
 * a forged From can name a resident's address and pass the sender check,
 * so a contact update filed from an inbox thread may not change the email
 * on file. Phone and mailing changes still go to board approval.
 */
export const INBOX_EMAIL_CHANGE_REFUSED = 'Ask the resident to change their email in the portal.'

export interface ContactPrefill {
  phone: string
  email: string
  mailing: string
}

/**
 * What a "please update my details" email asks for, as a starting point
 * the board checks before filing. Only the resident's own words are read
 * (never the quoted thread). Each field is a normalized value or ''.
 *
 *   - phone: the first US phone number;
 *   - email: the first address that is not the one they wrote from (the
 *     one they wrote from is already on file: the sender is verified);
 *   - mailing: a line that starts "Mailing address: …".
 */
export function contactPrefillFromEmail(text: string | null | undefined, senderEmail: string | null): ContactPrefill {
  const own = ownWords(text)
  const sender = (senderEmail ?? '').trim().toLowerCase()

  const phoneHit = own.match(PHONE_RE)?.[0]
  const phone = phoneHit ? normalizePhone(phoneHit) : null

  let email = ''
  for (const hit of own.match(EMAIL_RE) ?? []) {
    const e = normalizeEmail(hit)
    if (e.ok && e.value && e.value !== sender) {
      email = e.value
      break
    }
  }

  const mailHit = own.match(MAILING_RE)?.[1]
  const mailing = mailHit ? normalizeMailing(mailHit.replace(/[.\s]+$/, '')) : null

  return {
    phone: phone && phone.ok && phone.value ? phone.value : '',
    email,
    mailing: mailing && mailing.ok && mailing.value ? mailing.value : '',
  }
}

/** A record the board may link a thread to, from the home's own lists. */
export interface LinkCandidate {
  type: 'ticket' | 'arc_request' | 'violation'
  id: string
  label: string
  status: string
  date: string | null
}

/** Drop what is already linked; newest first. Pure. */
export function pickLinkCandidates(
  rows: readonly LinkCandidate[],
  alreadyLinked: ReadonlyArray<{ type: string; id: string }>,
): LinkCandidate[] {
  const linked = new Set(alreadyLinked.map((l) => `${l.type}:${l.id}`))
  return rows
    .filter((r) => !linked.has(`${r.type}:${r.id}`))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

// ─── Ticket ─────────────────────────────────────────────────────────

/** The board ticket form's limits: the same as a resident's own ticket (lib/resident-tickets.ts). */
export const TICKET_SUBJECT_MIN = 5
export const TICKET_SUBJECT_MAX = 200
export const TICKET_DESCRIPTION_MIN = 20
export const TICKET_DESCRIPTION_MAX = 4000

/** The subject line without its reply / forward prefixes ("Re: Fwd: Pool gate" → "Pool gate"). */
export function cleanSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').replace(/\s+/g, ' ').trim()
  for (;;) {
    const next = s.replace(/^(?:re|fwd?|fw|aw|sv)\s*(?:\[\d+\])?\s*:\s*/i, '')
    if (next === s) return s
    s = next
  }
}

/** Whitespace collapsed per line, at most one blank line in a row. */
function tidy(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Keyword guess at a ticket category, first match wins (safety before
 * everything, so "gas smell by the pool" is not filed as common area).
 * No AI, so an email cannot steer it beyond a keyword; the board confirms
 * it in the form anyway.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [TicketCategory, RegExp]> = [
  ['safety', /\b(?:unsafe|danger(?:ous)?|hazard(?:ous)?|fire|smoke|gas (?:leak|smell)|injur(?:y|ed)|break-?in|theft|stolen|security)\b/],
  ['billing', /\b(?:dues|assessments?|invoices?|balance|late fee|billing|bill|statement|payments?|refund|autopay)\b/],
  ['access', /\b(?:gate|fobs?|key ?cards?|keys?|remotes?|clicker|access code|locked out)\b/],
  ['parking', /\b(?:parking|parked|tow(?:ed|ing)?|trailer|rv|boat|vehicles?)\b/],
  ['noise', /\b(?:noise|noisy|loud|music|barking)\b/],
  ['common_area', /\b(?:pool|clubhouse|playground|gym|fitness|common area|tennis|pickleball|street ?lights?|mailbox(?:es)?|landscaping)\b/],
  ['maintenance', /\b(?:broken|repair|leak(?:s|ing)?|fix|maintenance|damaged?|crack(?:ed)?|pothole|tree|roof|drain|sprinklers?|not working)\b/],
]

export function guessTicketCategory(subject: string | null | undefined, text: string | null | undefined): TicketCategory {
  const hay = `${cleanSubject(subject)}\n${ownWords(text)}`.toLowerCase()
  for (const [category, re] of CATEGORY_KEYWORDS) if (re.test(hay)) return category
  return 'general'
}

/** A subject the Approvals queue would parse as a PR-10 contact-update request. */
export function isReservedTicketSubject(subject: string): boolean {
  return subject.trim().toLowerCase() === CONTACT_SUBJECT.toLowerCase()
}

export interface TicketPrefill {
  category: TicketCategory
  subject: string
  description: string
}

/**
 * The board's "Create a ticket" form, started from the newest inbound
 * message: the subject without Re:/Fwd:, the resident's own words (never
 * the quoted thread) and a keyword category. The ticket is the board's own
 * record of the email, so contact details stay as written (nothing here
 * sends it to AI). A subject that would read as a contact-update request
 * is replaced, because Approvals parses those.
 */
export function ticketPrefillFromEmail(subject: string | null | undefined, text: string | null | undefined): TicketPrefill {
  let s = cap(cleanSubject(subject), TICKET_SUBJECT_MAX)
  if (s.length < TICKET_SUBJECT_MIN || isReservedTicketSubject(s)) s = 'Emailed request'
  return {
    category: guessTicketCategory(subject, text),
    subject: s,
    description: cap(tidy(ownWords(text)), TICKET_DESCRIPTION_MAX),
  }
}

// ─── ARC hand-off link ──────────────────────────────────────────────

/** Kept short: the link goes in an email, and every character is URL-encoded. */
export const ARC_SCOPE_FROM_EMAIL_MAX = 600

export interface ArcPrefill {
  summary: string
  scope: string
}

/**
 * The resident's own ARC form, prefilled from their email. Plan A4: the
 * board can't file ARC on a resident's behalf yet (the resident would
 * never see it: arc_requests_select is submitted_by = auth.uid()), so the
 * reply hands them this link and they submit it themselves. A fixed
 * template around their own words; the subject goes through the hand-off
 * topic sanitiser (no links, markup or line breaks), and contact details
 * are redacted because the text rides in a URL.
 */
export function arcPrefillFromEmail(subject: string | null | undefined, text: string | null | undefined): ArcPrefill {
  const topic = handoffTopic(cleanSubject(subject))
  const said = clampHandoffText(cap(tidy(redactContactPII(ownWords(text))), ARC_SCOPE_FROM_EMAIL_MAX), ARC_SCOPE_FROM_EMAIL_MAX)
  return {
    summary: topic ? `Exterior change: ${topic}` : 'Exterior change to my home',
    scope: said
      ? `From my email to the board:\n${said}\n\nDescribe the change, materials and colors:`
      : 'Describe the change, materials and colors:',
  }
}

/** Path of the prefilled resident ARC form; the form labels it as the board's (`from=board`). */
export function boardArcHref(prefill: ArcPrefill): string {
  const params = new URLSearchParams()
  if (prefill.summary) params.set('summary', prefill.summary)
  if (prefill.scope) params.set('scope', prefill.scope)
  params.set(FROM_ASSISTANT_PARAM, FROM_BOARD_VALUE)
  return `/resident/arc/new?${params.toString()}`
}
