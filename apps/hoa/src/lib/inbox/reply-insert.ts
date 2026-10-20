/**
 * BL-101 A4 follow-up — "Insert into reply". Puts a fixed acknowledgement
 * line (lib/inbox/convert/ack.ts) into the reply draft's body in the
 * browser. Never sends, never saves: the line sits in the composer like
 * any other edit, and Approve stays the only way anything leaves.
 *
 * The convert menu and the composer are siblings on the thread page, so
 * they talk through one window event (the keyboard layer does the same,
 * lib/inbox/keys.ts). Dispatch is synchronous, so the sender learns in
 * the same tick whether a composer took the line.
 *
 * No `@/` imports beyond ack.ts: pure, and unit-tested without a DOM.
 */

import { VIOLATION_ACK } from './convert/ack'

export const INBOX_INSERT_EVENT = 'inbox:insert-into-reply'

export type InsertResult = 'inserted' | 'already' | 'busy' | 'no_draft'

export interface InsertDetail {
  text: string
  /** Set by the composer that handled it; left 'no_draft' when none is open. */
  result: InsertResult
}

const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^\n]{0,80}$/i

/**
 * Where the line goes:
 *  - at the caret, when the board member last clicked or typed in the
 *    message (their choice wins), as its own paragraph;
 *  - otherwise straight after a greeting line ("Hi Pat,"), the place an
 *    acknowledgement reads naturally;
 *  - otherwise at the top.
 * A body that already holds the line is left alone ('already'), so a
 * second click or a reload never doubles it.
 */
export function insertIntoBody(body: string, line: string, caret: number | null = null): { body: string; result: 'inserted' | 'already' } {
  const text = line.trim()
  if (!text) return { body, result: 'already' }
  if (body.includes(text)) return { body, result: 'already' }
  if (!body.trim()) return { body: text, result: 'inserted' }

  let at: number
  if (caret !== null && caret >= 0 && caret <= body.length) {
    at = caret
  } else {
    const firstBreak = body.indexOf('\n')
    const firstLine = (firstBreak === -1 ? body : body.slice(0, firstBreak)).trim()
    at = GREETING.test(firstLine) ? (firstBreak === -1 ? body.length : firstBreak) : 0
  }
  const before = body.slice(0, at).trimEnd()
  const after = body.slice(at).trimStart()
  return { body: [before, text, after].filter(Boolean).join('\n\n'), result: 'inserted' }
}

/**
 * Ask the open composer to take `text`. Returns what happened, so the
 * button can say "Added to your reply" or "Draft a reply first".
 */
export function dispatchInsertIntoReply(text: string): InsertResult {
  if (typeof window === 'undefined') return 'no_draft'
  const detail: InsertDetail = { text, result: 'no_draft' }
  window.dispatchEvent(new CustomEvent<InsertDetail>(INBOX_INSERT_EVENT, { detail }))
  return detail.result
}

export const INSERT_MESSAGE: Record<InsertResult, string> = {
  inserted: 'Added to your reply. Review it there before you approve.',
  already: 'That line is already in your reply.',
  busy: 'The reply is being sent or saved. Try again in a moment.',
  no_draft: 'There’s no reply draft open on this email yet. Draft a reply first, or copy the line.',
}

/**
 * Lines another page may ask the thread view to insert on open
 * (`/inbox/[id]?insert=<key>`). A fixed key, never text from the URL: a
 * link can't put words in a board member's reply (SEC-004).
 */
export const INSERT_ON_OPEN = {
  violation: VIOLATION_ACK,
} as const
export type InsertOnOpenKey = keyof typeof INSERT_ON_OPEN

export function insertOnOpenText(key: string | null | undefined): string | null {
  return key && Object.prototype.hasOwnProperty.call(INSERT_ON_OPEN, key) ? INSERT_ON_OPEN[key as InsertOnOpenKey] : null
}
