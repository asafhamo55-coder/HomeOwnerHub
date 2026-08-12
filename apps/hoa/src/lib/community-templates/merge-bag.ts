/**
 * Turns the board member's answers into the merge bag the template renders
 * against.
 *
 * This is the fix for the bug the seeded transactional templates still have:
 * send.ts built a hardcoded four-key bag and renderTemplate blanked anything
 * else silently, so 71 merge fields across the library rendered as empty
 * string and the dues reminder went out reading "your dues of  are due on ."
 *
 * Every declared question produces a key here — including optional ones,
 * which fall back rather than being omitted. That guarantee is what lets the
 * send path use renderTemplateStrict, which throws on a missing field, so a
 * half-baked message can never leave the system.
 */

import type { TemplateQuestion } from './types'
import type { MergeBag } from '@/lib/communications/templates'

export type AnswerMap = Record<string, string | string[] | undefined>

/** "A", "A and B", "A, B and C" — reads like a person wrote it. */
export function joinHumanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * `<input type="date">` hands back an unformatted 'YYYY-MM-DD' string, which
 * reaches resident copy verbatim otherwise ("repaving: 2026-08-17"). Formats
 * to "Monday, August 17" — fixed 'en-US'-shaped output, computed by hand
 * rather than via Intl/toLocaleDateString so it never depends on the host's
 * ICU data or default locale. Date.UTC is used only to get a deterministic
 * day-of-week from the (year, month, day) triple — it does not read the
 * current clock, so this stays pure.
 */
function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  // Guard against a value that doesn't round-trip (e.g. 2026-02-30) rather
  // than silently reformatting to a different day.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return value
  }
  return `${WEEKDAYS[utc.getUTCDay()]}, ${MONTHS[month - 1]} ${day}`
}

/**
 * `<input type="time">` hands back 24-hour 'HH:MM' ("between 08:00 and
 * 17:00" otherwise). Formats to "8:00 AM" — pure string arithmetic, no
 * Date/Intl involved at all, so there is nothing here that could vary by
 * host clock or timezone.
 */
function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return value
  const hour24 = Number(m[1])
  const minute = m[2]
  if (hour24 < 0 || hour24 > 23) return value
  const period = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute} ${period}`
}

function formatByType(value: string, type: TemplateQuestion['type']): string {
  if (type === 'date') return formatDate(value)
  if (type === 'time') return formatTime(value)
  return value
}

export function buildMergeBag(
  questions: readonly TemplateQuestion[],
  answers: AnswerMap,
  ambient: Record<string, string>,
): MergeBag {
  const declared = new Set(questions.map((q) => q.id))
  for (const key of Object.keys(answers)) {
    if (!declared.has(key)) {
      throw new Error(`answer supplied for undeclared question "${key}"`)
    }
  }

  const bag: MergeBag = { ...ambient }

  for (const q of questions) {
    const raw = answers[q.id]
    const value = Array.isArray(raw) ? joinHumanList(raw) : (raw ?? '').trim()

    if (!value) {
      if (q.required) {
        throw new Error(`missing required answer: ${q.id} (${q.label})`)
      }
      bag[q.id] = q.fallback ?? ''
      continue
    }
    bag[q.id] = formatByType(value, q.type)
  }

  return bag
}
