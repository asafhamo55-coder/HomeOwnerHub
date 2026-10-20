/**
 * BL-101 A9 — "similar open questions": group inbox threads that ask
 * essentially the same thing, so the board can answer them once.
 *
 * Deterministic and free. The plan's first sketch embedded every thread;
 * this ships the no-cost version instead: word overlap on the subject plus
 * the first lines of the newest inbound message (the list's `snippet`).
 * Nothing is persisted (a stored topic is plan item B6, migration 0065)
 * and nothing is sent from here — grouping only decides what the board is
 * OFFERED to answer together; the board still ticks every thread.
 *
 * Grouping is seed-based, not transitive: a thread joins a group only if it
 * is similar to that group's FIRST thread. Chaining (A~B, B~C, so A~C) is
 * how "pool hours" ends up batched with "pool fence repair".
 *
 * Pure: no imports, unit-tested.
 */

/** A batch never goes to more than this many threads (plan A9). */
export const MAX_BATCH = 25

export interface GroupableThread {
  id: string
  subject: string | null
  snippet: string | null
  status: string
  lastDirection: string | null
  fromEmail: string | null
}

export interface SimilarGroup {
  /** A short label: the first thread's subject without "Re:". */
  label: string
  threadIds: string[]
}

const STOPWORDS = new Set(
  (
    'the and for are was were our your you yours this that these those with have has had from there their they them ' +
    'can could would should will shall may might must any all not but just about when what where which who whom whose ' +
    'why how into onto out over under again also than then too very some such only own same here more most other ' +
    'hello dear thanks thank please regards best sincerely question questions quick wondering wonder know let like ' +
    'want wanted need needed get got going does did done doing been being its it\'s i\'m im hoa board team anyone ' +
    'someone something help hey asking ask tell email message reply sent send fyi info'
  ).split(/\s+/),
)

/** "Re: Fwd: Pool?" → "Pool?" */
export function stripReplyPrefixes(subject: string): string {
  let s = subject.trim()
  for (;;) {
    const next = s.replace(/^(re|fw|fwd|aw)\s*(\[\d+\])?\s*:\s*/i, '')
    if (next === s) return s
    s = next
  }
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function tokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const raw of (text ?? '').toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
    const word = raw.replace(/^'+|'+$/g, '')
    if (word.length < 3 || STOPWORDS.has(word)) continue
    out.add(stem(word))
  }
  return out
}

function overlap(a: Set<string>, b: Set<string>): { shared: number; jaccard: number } {
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  const union = a.size + b.size - shared
  return { shared, jaccard: union === 0 ? 0 : shared / union }
}

interface Shape {
  subject: Set<string>
  all: Set<string>
}

function shape(t: GroupableThread): Shape {
  const subject = tokens(stripReplyPrefixes(t.subject ?? ''))
  // First lines only: the opening states the question; signatures and
  // quoted text further down would make unrelated emails look alike.
  const opening = (t.snippet ?? '').split(/\r?\n/).slice(0, 3).join(' ').slice(0, 200)
  return { subject, all: new Set([...subject, ...tokens(opening)]) }
}

/**
 * Two threads ask the same thing when their subjects mostly match (at least
 * two real words each, and 60% overlap), or when subject and opening
 * together share at least three real words and 35% overlap.
 */
export function areSimilar(a: GroupableThread, b: GroupableThread): boolean {
  return shapesSimilar(shape(a), shape(b))
}

function shapesSimilar(a: Shape, b: Shape): boolean {
  if (a.subject.size >= 2 && b.subject.size >= 2 && overlap(a.subject, b.subject).jaccard >= 0.6) return true
  const all = overlap(a.all, b.all)
  return all.shared >= 3 && all.jaccard >= 0.35
}

/**
 * Threads a batch reply may go to: still waiting on the board (the resident
 * wrote last), not closed or parked, and with a sender to reply to.
 */
export function isBatchCandidate(t: GroupableThread): boolean {
  return (
    (t.status === 'needs_review' || t.status === 'open') &&
    t.lastDirection !== 'outbound' &&
    Boolean(t.fromEmail)
  )
}

/**
 * Groups of two or more similar candidate threads, largest first, each
 * capped at MAX_BATCH. Input order is kept within a group (the list is
 * newest-first), and a thread belongs to at most one group.
 */
export function groupSimilarThreads(threads: GroupableThread[]): SimilarGroup[] {
  const groups: Array<{ seed: Shape; label: string; ids: string[]; order: number }> = []
  for (const t of threads) {
    if (!isBatchCandidate(t)) continue
    const s = shape(t)
    if (s.all.size === 0) continue
    const home = groups.find((g) => g.ids.length < MAX_BATCH && shapesSimilar(g.seed, s))
    if (home) {
      home.ids.push(t.id)
    } else {
      groups.push({
        seed: s,
        label: stripReplyPrefixes(t.subject ?? '') || '(no subject)',
        ids: [t.id],
        order: groups.length,
      })
    }
  }
  return groups
    .filter((g) => g.ids.length >= 2)
    .sort((a, b) => b.ids.length - a.ids.length || a.order - b.order)
    .map((g) => ({ label: g.label, threadIds: g.ids }))
}
