/**
 * BL-101 A5 — saved replies: a code-defined starter library the board
 * drops into a reply draft from the composer ("Saved replies").
 *
 * WHAT THEY ARE. Paragraphs, not whole emails: no greeting, no sign-off.
 * They go into the open draft at the cursor (or after its greeting), like
 * the acknowledgement lines (lib/inbox/reply-insert.ts), and nothing
 * sends until the board approves the draft.
 *
 * NO INVENTED FACTS. Every community-specific detail (pool hours, trash
 * day, the gate office, a fee) is a `[[BLANK: community_fact]]` marker,
 * so Approve stays blocked until a person fills it in (hasUnfilledBlanks).
 * The text is state-neutral: no statute, deadline or fee is stated.
 *
 * MERGE FIELDS, resolved on the server (saved-replies-actions.ts):
 *   {{first_name}}   the sender's own display name on the email, first
 *                    word; "there" when absent (a greeting, not a fact).
 *   {{balance}}      the home's balance, ONLY when the sender passed the
 *                    A2 disclosure gate (account-context.ts); otherwise
 *                    `[[BLANK: money]]`, exactly like an AI draft.
 *   {{portal_link}}  the resident portal sign-in.
 *   {{arc_link}}     the resident's ARC application form.
 * An unknown field also becomes a blank, never empty text.
 *
 * Org-editable replies need a table (plan item B2, migration 0065).
 * Pure: no imports, unit-tested.
 */

export type SavedReplyField = 'first_name' | 'balance' | 'portal_link' | 'arc_link'

export interface SavedReply {
  id: string
  title: string
  /** One line for the picker. */
  hint: string
  text: string
}

const FACT = '[[BLANK: community_fact]]'

export const SAVED_REPLIES: readonly SavedReply[] = [
  {
    id: 'how-to-pay',
    title: 'How to pay dues',
    hint: 'Portal payment, with the balance when it can be shared.',
    text: `Your current balance on file is {{balance}}. You can pay online in the resident portal: {{portal_link}}. Other ways to pay: ${FACT}.`,
  },
  {
    id: 'portal-sign-in',
    title: 'Portal sign-in help',
    hint: 'Where to sign in and what to do if the email doesn’t match.',
    text: 'You can sign in to the resident portal here: {{portal_link}}. Use the email address we have on file for you. If it doesn’t recognise your email, reply to this message and we’ll check your details.',
  },
  {
    id: 'arc-how-to',
    title: 'ARC: how to apply',
    hint: 'Link to the ARC form; plans and photos.',
    text: 'Exterior changes need approval from the architectural review committee before work starts. You can apply in the resident portal: {{arc_link}}. Please include a description, plans or a sketch, and photos of the area. The committee will review it and let you know the decision.',
  },
  {
    id: 'pool-hours',
    title: 'Pool and amenity hours',
    hint: 'Hours and rules (you fill in the hours).',
    text: `The pool and amenity hours are ${FACT}. The full amenity rules are in the community documents in the resident portal: {{portal_link}}.`,
  },
  {
    id: 'gate-fob',
    title: 'Gate access or key fob',
    hint: 'Replacement fob or gate code request.',
    text: `For a new or replacement gate fob or access code: ${FACT}. For security we only issue access to residents on file for the home.`,
  },
  {
    id: 'trash-day',
    title: 'Trash and recycling',
    hint: 'Pickup days (you fill them in).',
    text: `Trash and recycling pickup is on ${FACT}. Please bring bins in after pickup, as set out in the community rules.`,
  },
  {
    id: 'parking',
    title: 'Parking rules',
    hint: 'Points to the rules; no enforcement promised.',
    text: 'Thank you for raising this. The parking rules are in the community documents in the resident portal: {{portal_link}}. The board will look into it and follow up as needed.',
  },
  {
    id: 'noise',
    title: 'Noise complaint received',
    hint: 'Acknowledges; no outcome promised.',
    text: 'Thank you for letting us know about the noise. The board has noted it and will follow up as appropriate. If it happens again, please note the date and time and let us know.',
  },
  {
    id: 'records-request',
    title: 'Records request',
    hint: 'Acknowledges; the timeline is yours to state.',
    text: `We've received your request to inspect association records. ${FACT}. Many documents are also available in the resident portal: {{portal_link}}.`,
  },
  {
    id: 'resale-estoppel',
    title: 'Resale or estoppel request',
    hint: 'Who handles it and how (you fill in the details).',
    text: `For a resale certificate or estoppel request: ${FACT}. Please include the property address and the expected closing date.`,
  },
]

const BY_ID = new Map(SAVED_REPLIES.map((r) => [r.id, r]))

export function findSavedReply(id: string): SavedReply | null {
  return BY_ID.get(id) ?? null
}

/** The merge fields a reply uses, so the server reads only what it needs. */
export function fieldsUsed(text: string): Set<string> {
  return new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1]!.toLowerCase()))
}

export interface MergeValues {
  firstName: string | null
  /** Already formatted ("$412.50 as of 2026-10-20"); null = withheld or unknown. */
  balance: string | null
  portalLink: string
  arcLink: string
}

/** Fill the merge fields. Anything not resolvable is a blank, never empty text. */
export function renderSavedReply(text: string, v: MergeValues): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, raw: string) => {
    switch (raw.toLowerCase()) {
      case 'first_name':
        return v.firstName ?? 'there'
      case 'balance':
        return v.balance ?? '[[BLANK: money]]'
      case 'portal_link':
        return v.portalLink
      case 'arc_link':
        return v.arcLink
      default:
        return '[[BLANK: other]]'
    }
  })
}

/**
 * The first word of a display name, when it looks like a name: letters,
 * apostrophes and hyphens, at most 30 characters. "pat@example.com",
 * "Accounts Payable" style role names and empty values give null.
 */
export function firstNameFrom(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().replace(/^["']+|["']+$/g, '').split(/[\s,]+/)[0] ?? ''
  if (!first || first.length > 30 || !/^\p{L}[\p{L}'’-]*$/u.test(first)) return null
  if (/^(info|admin|accounts?|office|support|team|noreply|no-reply)$/i.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function formatBalance(cents: number, asOf: string): string {
  return `$${(cents / 100).toFixed(2)} (as of ${asOf})`
}
