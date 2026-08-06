import { runCloud } from '../agents/cloud'

/**
 * The digest's AI half: ONE sentence naming what to start with.
 *
 * The model is never asked to produce a count. Every number on the card is
 * computed in SQL and rendered directly, so there is no opportunity for a
 * wrong figure to reach a board member — the previous version asked for a
 * prose briefing over eight counts and restated numbers the tiles below it
 * already showed.
 */

/**
 * Roughly two lines at the card's width. Beyond this the model has stopped
 * answering "what should I start with" and started writing prose.
 */
export const MAX_SUGGESTION_CHARS = 200

/**
 * Gate the model's response. Returns the cleaned line, or null to render
 * facts only — an absent suggestion is a non-event, not an error.
 */
export function acceptSuggestion(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.length > MAX_SUGGESTION_CHARS) return null
  return trimmed
}

export async function generateDigestSuggestion(params: {
  hoaName: string
  needsReply: number
  oldestWaitingDays: number | null
  approvalsPending: number
  /** At most five, so the model can name one specifically. */
  threadSubjects: string[]
}): Promise<string> {
  return runCloud(
    'You are the HOA Hub assistant. You help a board member decide what to do first.',
    `HOA: ${params.hoaName}
Resident emails awaiting a reply: ${params.needsReply}
Longest wait: ${params.oldestWaitingDays ?? 0} days
Items awaiting board approval: ${params.approvalsPending}
Oldest waiting threads (subjects): ${params.threadSubjects.join(' | ') || 'none'}

Write ONE sentence, under ${MAX_SUGGESTION_CHARS} characters, telling the board
member what to start with and why. Name a specific thread from the list above
when one is present. Do NOT list counts — they are already displayed. Plain
text only, no bullet, no preamble.`,
    { max_tokens: 120 },
  )
}
