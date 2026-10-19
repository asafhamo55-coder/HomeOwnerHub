// BL-096 — the assistant's hand-offs. Pure and browser-safe: the route
// builds suggestions with these, and the chat turns each into a link.
//
// A hand-off is only ever a link to a form the resident already has
// (/resident/tickets/new, /resident/arc/new) with the subject and
// description prefilled through the query string the forms already read
// (the same params Ask the Docs uses). Nothing is created until the
// resident reviews the form and submits it themselves.

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

/** The prefilled form a hand-off opens. Same params as Ask the Docs' recommendation links. */
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
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** One suggestion per action, the latest wins; at most the two actions. */
export function dedupeHandoffs(list: readonly Handoff[]): Handoff[] {
  const byAction = new Map<HandoffAction, Handoff>()
  for (const h of list) byAction.set(h.action, h)
  return (['ask_board', 'start_arc'] as const).flatMap((a) => (byAction.has(a) ? [byAction.get(a)!] : []))
}
