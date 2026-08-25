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

// ─── Board insights ──────────────────────────────────────────────────
//
// The digest's second AI half: which of the community's firing signals
// actually need the BOARD, and why.
//
// The division of labour is the same one the suggestion line established,
// applied to a list. The caller computes every candidate signal in SQL and
// hands the model only `kind` + a finished headline. The model returns
// `kind` + one clause of reasoning; the caller re-attaches its own
// headline, link and severity by `kind`. No figure the board reads was
// ever inside the model's output, so no figure can be wrong.

/** The card shows four. More than that is a report, not a digest. */
export const MAX_INSIGHTS = 4

/** Roughly one line under the headline at the card's width. */
export const MAX_INSIGHT_WHY_CHARS = 140

export interface DigestInsight {
  /** Must be one of the kinds the caller offered — it is the join key. */
  kind: string
  /** One clause on why the board specifically must act. */
  why: string
}

/**
 * Models wrap JSON in ```json fences unprompted. Rejecting an otherwise
 * perfect response over its packaging costs the board the whole section,
 * so strip a leading/trailing fence before parsing.
 */
function stripCodeFence(text: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(text.trim())
  return fenced ? fenced[1].trim() : text.trim()
}

/**
 * Gate the model's insight list. Returns at most `MAX_INSIGHTS` entries,
 * or an empty array — never throws, because an absent insight list is a
 * non-event exactly like an absent suggestion. Order is preserved: the
 * model was asked for most-urgent-first, and re-sorting here would discard
 * the only judgement it was asked to make.
 */
export function acceptInsights(
  raw: string | null | undefined,
  allowedKinds: readonly string[],
): DigestInsight[] {
  if (raw === null || raw === undefined) return []
  const text = stripCodeFence(raw)
  if (text === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const allowed = new Set(allowedKinds)
  const seen = new Set<string>()
  const accepted: DigestInsight[] = []

  for (const entry of parsed) {
    if (accepted.length >= MAX_INSIGHTS) break
    if (typeof entry !== 'object' || entry === null) continue

    const { kind, why } = entry as { kind?: unknown; why?: unknown }
    if (typeof kind !== 'string' || typeof why !== 'string') continue
    if (!allowed.has(kind) || seen.has(kind)) continue

    const trimmed = why.trim()
    if (trimmed === '' || trimmed.length > MAX_INSIGHT_WHY_CHARS) continue
    // No digit, ever. `why` renders directly beneath a headline whose
    // figures came from SQL, so a model-authored number there reads as
    // equally authoritative and is indistinguishable from a checked one.
    // The prompt asks for no numbers; this is what makes it true. A real
    // clause that cites "section 4.2" is collateral, and losing it costs
    // one line of prose — far less than one wrong figure quoted in a
    // board meeting.
    if (/\d/.test(trimmed)) continue

    seen.add(kind)
    accepted.push({ kind, why: trimmed })
  }

  return accepted
}

/**
 * Ask the model to rank the firing signals and say why each needs the
 * board. Returns the raw response; run it through `acceptInsights`.
 */
export async function generateBoardInsights(params: {
  hoaName: string
  /** Every signal currently firing, most severe first. */
  signals: Array<{ kind: string; headline: string }>
}): Promise<string> {
  const catalogue = params.signals.map((s) => `- ${s.kind}: ${s.headline}`).join('\n')

  return runCloud(
    'You are the HOA Hub assistant. You help a board of directors decide ' +
      'which community issues need a board decision this week.',
    `HOA: ${params.hoaName}

Signals currently firing in this community:
${catalogue}

Choose at most ${MAX_INSIGHTS} of these that genuinely require the BOARD —
a vote, a policy call, a budget decision, or a legal exposure they are
personally accountable for. Skip anything the property manager handles as
routine work. Order them most urgent first.

For each one write "why", a single clause of at most
${MAX_INSIGHT_WHY_CHARS} characters explaining what is at stake for the
board. Do NOT restate the headline and do NOT write any number — the
headline is already shown above your text.

Reply with JSON only, no prose and no code fence:
[{"kind":"<one of the kinds above>","why":"<clause>"}]`,
    { max_tokens: 400 },
  )
}
