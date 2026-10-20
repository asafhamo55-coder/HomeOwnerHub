// BL-096 — the assistant's hand-offs. Pure and browser-safe: the route
// builds suggestions with these, and the chat turns each into a link.
//
// A hand-off is only ever a link to a form the resident already has
// (/resident/tickets/new, /resident/arc/new) with the subject and
// description prefilled through the query string the forms already read
// (the same params Ask the Docs uses). Nothing is created until the
// resident reviews the form and submits it themselves.
//
// WHO WRITES THE TEXT (SEC-004). The model reads documents and
// announcements, so anything it writes may carry injected text. The
// prefilled subject and description are therefore built HERE from the
// resident's own last message and a fixed template (buildHandoff). The
// model contributes only a short topic, length-capped and with links,
// URLs and markup stripped (handoffTopic). The form labels the prefill as
// the assistant's suggestion (?from=assistant).

export type HandoffAction = 'ask_board' | 'start_arc'

export interface Handoff {
  action: HandoffAction
  subject: string
  description: string
}

export const HANDOFF_LABEL: Record<HandoffAction, string> = {
  ask_board: 'Ask the board',
  start_arc: 'Start an ARC application',
}

/** Model-written text → one trimmed, bounded, control-free string. */
export function clampHandoffText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max)
}

/** The longest topic the model may contribute. */
export const HANDOFF_TOPIC_MAX = 60
export const HANDOFF_SUBJECT_MAX = 120
export const HANDOFF_DESCRIPTION_MAX = 1500

/** The query flag the forms read to label a prefill as the assistant's suggestion. */
export const FROM_ASSISTANT_PARAM = 'from'
export const FROM_ASSISTANT_VALUE = 'assistant'
export const SUGGESTED_BY_ASSISTANT = 'Suggested by the assistant — review before sending'

const MD_LINK = /!?\[([^\]]*)\]\([^)]*\)/g
const URL_LIKE = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/gi
const SCHEME = /\b(?:javascript|data|mailto|tel|sms|file|vbscript):\S*/gi
// bare domains: example.com, evil.co/path
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi

/** Model-written topic → a short plain phrase: no links, URLs, markup or line breaks. */
export function handoffTopic(v: unknown): string {
  if (typeof v !== 'string') return ''
  const plain = v
    .replace(MD_LINK, '$1')
    .replace(URL_LIKE, ' ')
    .replace(SCHEME, ' ')
    .replace(DOMAIN, ' ')
    .replace(/[<>\[\]{}`*_#|\\]/g, ' ')
    .replace(/\s+/g, ' ')
  const out = clampHandoffText(plain, HANDOFF_TOPIC_MAX)
  // Cut back to a word boundary rather than mid-word; drop trailing punctuation.
  const cut = plain.trim().length > HANDOFF_TOPIC_MAX && out.includes(' ') ? out.slice(0, out.lastIndexOf(' ')) : out
  return cut.replace(/[\s.,;:!?'"-]+$/, '').trim()
}

/**
 * The hand-off the resident sees, built on the server: a fixed template,
 * the resident's own last message, and at most a sanitised topic from the
 * model. Nothing else the model wrote reaches the form.
 */
export function buildHandoff(action: HandoffAction, topic: unknown, residentMessage: string): Handoff {
  const t = handoffTopic(topic)
  const said = clampHandoffText(residentMessage, HANDOFF_DESCRIPTION_MAX - 120)
  if (action === 'start_arc') {
    return {
      action,
      subject: clampHandoffText(t ? `Exterior change: ${t}` : 'Exterior change to my home', HANDOFF_SUBJECT_MAX),
      description: clampHandoffText(
        said ? `What I asked the resident assistant:\n${said}\n\nDescribe the change, materials and colors:` : 'Describe the change, materials and colors:',
        HANDOFF_DESCRIPTION_MAX,
      ),
    }
  }
  return {
    action,
    subject: clampHandoffText(t ? `Question for the board: ${t}` : 'Question for the board', HANDOFF_SUBJECT_MAX),
    description: clampHandoffText(
      said ? `What I asked the resident assistant:\n${said}` : 'My question for the board:',
      HANDOFF_DESCRIPTION_MAX,
    ),
  }
}

/** The prefilled form a hand-off opens. Same params as Ask the Docs' recommendation links, plus ?from=assistant. */
export function handoffHref(h: Handoff): string {
  const params = new URLSearchParams()
  if (h.action === 'start_arc') {
    if (h.subject) params.set('summary', h.subject)
    if (h.description) params.set('scope', h.description)
    return withQuery('/resident/arc/new', params)
  }
  if (h.subject) params.set('subject', h.subject)
  if (h.description) params.set('description', h.description)
  return withQuery('/resident/tickets/new', params)
}

function withQuery(path: string, params: URLSearchParams): string {
  params.set(FROM_ASSISTANT_PARAM, FROM_ASSISTANT_VALUE)
  return `${path}?${params.toString()}`
}

/** One suggestion per action, the latest wins; at most the two actions. */
export function dedupeHandoffs(list: readonly Handoff[]): Handoff[] {
  const byAction = new Map<HandoffAction, Handoff>()
  for (const h of list) byAction.set(h.action, h)
  return (['ask_board', 'start_arc'] as const).flatMap((a) => (byAction.has(a) ? [byAction.get(a)!] : []))
}
