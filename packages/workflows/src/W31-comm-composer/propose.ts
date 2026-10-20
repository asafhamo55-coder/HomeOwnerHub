// W31 — Comm Composer, one-box proposal step (BL-102 A2).
//
// The board types what it wants to tell residents in plain words ("water
// will be off Thursday 9–2 on Elm St for pipe repair"). This step proposes
// the rest of the message for the board to review: subject, body, audience,
// urgency, a matching built-in template and a send time.
//
// It only proposes. Nothing here sends, picks recipients by id or stores
// anything; the HOA wizard fills its existing steps from the reply and the
// board reviews and sends as usual.
//
// Like translate.ts, the model call is injected (`complete`): the HOA route
// passes `runMain` from @homeowner-portal/ai behind requireAiQuota, and unit
// tests pass a mock. Nothing in this file touches the network.
//
// The body comes back as PLAIN TEXT in the HOA editor's format (blank line
// = paragraph, "- " bullets, **bold**), never HTML. The app turns it into
// HTML with its own escaping converter, so a model reply cannot inject
// markup.

import { z } from 'zod'
import { SUPPORTED_MERGE_FIELDS } from './prompt'
import { mergeFieldNames } from './translate'

export const PROPOSE_PROMPT_VERSION = '1.1.0'

/** The audiences the proposal may pick. Each maps 1:1 onto an existing
 *  composer audience. A street is not an audience kind: it travels in
 *  `street`, and the HOA app matches it against the HOA's real streets
 *  (BL-102 A5), never trusting the model's spelling as a recipient list. */
export const PROPOSAL_AUDIENCES = [
  'everyone',
  'owners_only',
  'tenants_only',
  'late_on_dues',
  'open_violations',
  'board',
] as const
export type ProposalAudience = (typeof PROPOSAL_AUDIENCES)[number]

/** communications.category values (the table's CHECK list). */
export const PROPOSAL_CATEGORIES = [
  'welcome',
  'dues',
  'meeting',
  'violation',
  'arc',
  'financial',
  'emergency',
  'announcement',
  'community',
  'custom',
] as const

export interface ProposalTemplateOption {
  id: string
  name: string
  description: string
}

export const CommProposeInputSchema = z.object({
  /** What the board typed. */
  message: z.string().trim().min(3).max(1000),
  /** The board member's local date and time, "YYYY-MM-DDTHH:mm", so
   *  "Thursday" and "tomorrow at 8" can be resolved. */
  localNow: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
})
export type CommProposeInput = z.infer<typeof CommProposeInputSchema>

const ReplySchema = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10).max(6000),
  audience: z.enum(PROPOSAL_AUDIENCES),
  street: z.string().trim().max(80).nullable().optional(),
  urgency: z.enum(['routine', 'urgent']),
  category: z.enum(PROPOSAL_CATEGORIES),
  templateId: z.string().max(80).nullable().optional(),
  sendAt: z.string().nullable().optional(),
  missingFacts: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
  why: z.string().trim().max(240).optional(),
})

export interface CommProposal {
  subject: string
  /** Plain text in the HOA editor's format. */
  body: string
  audience: ProposalAudience
  /** A street the board named. The HOA app matches it to a real street
   *  of the HOA (combined with everyone / owners_only), or flags it. */
  street: string | null
  urgency: 'routine' | 'urgent'
  category: (typeof PROPOSAL_CATEGORIES)[number]
  /** One of the offered template ids, or null. */
  templateId: string | null
  /** "YYYY-MM-DDTHH:mm" in the board's local time, only when the board's
   *  words asked for a later send, and only if it is in the future. */
  sendAt: string | null
  /** Facts the message needs that the board didn't give. Never invented. */
  missingFacts: string[]
  /** Numbers in the draft that are not in what the board typed (a time,
   *  amount or date the model may have made up). The wizard flags them. */
  unverifiedNumbers: string[]
  /** The model's short reason for the audience and urgency. */
  why: string
}

export type ProposeMessage = { role: 'system' | 'user'; content: string }
export type ProposeComplete = (messages: ProposeMessage[]) => Promise<string>

const FIELDS = SUPPORTED_MERGE_FIELDS.map((f) => `{{ ${f} }}`).join(' and ')

export function proposeSystemPrompt(templates: readonly ProposalTemplateOption[]): string {
  const list = templates.map((t) => `- ${t.id}: ${t.name}. ${t.description}`).join('\n')
  return `You help a volunteer HOA board write a message to residents. The board describes what they want to say in plain words. You propose the message and how to send it. The board reviews everything before anything is sent; you never send.

Rules you MUST follow:
1. NEVER invent facts. Use only dates, times, places, amounts, names and reasons the board wrote. If the message needs a fact the board did not give (for example when the water comes back), leave it out of the body and list it in "missingFacts" as a short question.
2. The only merge fields you may use are ${FIELDS}. Never use any other {{ }} field, not even a home address or unit. Start the body with "Hi {{ recipient_name }}," and end it with a sign-off line "{{ association_name }} Board".
3. The body is PLAIN TEXT, not HTML. Separate paragraphs with a blank line. Use "- " at the start of a line for a bullet. Use **two stars** around a few words for bold. No other formatting.
4. Plain, friendly, short sentences. 40 to 180 words. Subject under 70 characters, no all caps.
5. "audience" is exactly one of: everyone (every home), owners_only, tenants_only, late_on_dues (homes behind on dues), open_violations (homes with an open violation), board (the board only). Default to everyone. If the board names one street, put just the street name in "street" (for example "Elm St") and pick everyone, or owners_only if they said owners; the app sends to the homes on that street. Otherwise "street" is null.
6. "urgency" is "urgent" for safety, water, power, gas, road, gate or weather problems happening soon, otherwise "routine".
7. "category" is one of: welcome, dues, meeting, violation, arc, financial, emergency, announcement, community, custom. Urgent service problems are "emergency".
8. "templateId" is the id of the one template below that fits this message, or null if none fits well.
${list}
9. "sendAt" is null unless the board asks to send the message later (for example "send this Friday at 8am"). A date the event happens on is not a send time. When set, use "YYYY-MM-DDTHH:mm" in the board's local time.
10. "why" is one short sentence explaining the audience and urgency you picked.

Return strict JSON only, no code fences:
{ "subject": "...", "body": "...", "audience": "everyone", "street": null, "urgency": "routine", "category": "announcement", "templateId": null, "sendAt": null, "missingFacts": [], "why": "..." }`
}

export function proposeUserPrompt(input: CommProposeInput): string {
  const weekday = new Date(`${input.localNow.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  return `The board's local date and time now: ${input.localNow} (${weekday}).

What the board wants to tell residents:
"""
${input.message}
"""

Return JSON only.`
}

/** Numbers (with an optional am/pm) in the draft that the board never typed. */
export function numbersNotInSource(draft: string, source: string): string[] {
  const norm = (s: string) => s.toLowerCase()
  const sourceNums = new Set((norm(source).match(/\d+/g) ?? []).map((n) => String(Number(n))))
  const out = new Set<string>()
  for (const m of norm(draft).matchAll(/\d+(?:[:.]\d+)?\s*(?:am|pm|a\.m\.|p\.m\.|%)?/g)) {
    const parts = (m[0].match(/\d+/g) ?? []).map((n) => String(Number(n)))
    // ":00" minutes are formatting, not a new fact.
    if (parts.some((p) => p !== '0' && !sourceNums.has(p))) out.add(m[0].trim())
  }
  return [...out]
}

function validSendAt(sendAt: string | null | undefined, localNow: string): string | null {
  if (!sendAt) return null
  const m = sendAt.trim().match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  if (!m) return null
  // Same zone on both sides (the board's local wall clock), so a string
  // compare of the fixed-width form orders them correctly.
  return m[1] > localNow ? m[1] : null
}

/**
 * Parse and check one model reply. Null means "unusable": not JSON, the
 * wrong shape, or a merge field the send cannot fill (that would fail the
 * strict render for every recipient).
 */
export function parseProposalReply(
  raw: string | null,
  input: CommProposeInput,
  templates: readonly ProposalTemplateOption[],
): CommProposal | null {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    return null
  }
  const parsed = ReplySchema.safeParse(json)
  if (!parsed.success) return null
  const r = parsed.data
  const allowed = new Set<string>(SUPPORTED_MERGE_FIELDS)
  if (mergeFieldNames(`${r.subject}\n${r.body}`).some((f) => !allowed.has(f))) return null
  // The body is plain text; a reply that answered in HTML is unusable.
  if (/<\/?[a-z][^>]*>/i.test(r.body)) return null
  const templateId = r.templateId && templates.some((t) => t.id === r.templateId) ? r.templateId : null
  const draftText = `${r.subject}\n${r.body}`.replace(/\{\{[^}]*\}\}/g, '')
  return {
    subject: r.subject,
    body: r.body,
    audience: r.audience,
    street: r.street ? r.street : null,
    urgency: r.urgency,
    category: r.category,
    templateId,
    sendAt: validSendAt(r.sendAt, input.localNow),
    missingFacts: r.missingFacts ?? [],
    unverifiedNumbers: numbersNotInSource(draftText, input.message),
    why: r.why ?? '',
  }
}

export type ProposeResult =
  | { ok: true; proposal: CommProposal; promptVersion: string }
  | { ok: false; reason: 'unusable_reply' }

/**
 * One call, one retry on an unusable reply. A thrown `complete` (provider
 * down) propagates so the caller can map it to its own envelope.
 */
export async function proposeCommunication(
  input: CommProposeInput,
  templates: readonly ProposalTemplateOption[],
  complete: ProposeComplete,
): Promise<ProposeResult> {
  const messages: ProposeMessage[] = [
    { role: 'system', content: proposeSystemPrompt(templates) },
    { role: 'user', content: proposeUserPrompt(input) },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const proposal = parseProposalReply(await complete(messages), input, templates)
    if (proposal) return { ok: true, proposal, promptVersion: PROPOSE_PROMPT_VERSION }
  }
  return { ok: false, reason: 'unusable_reply' }
}
