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
    bag[q.id] = value
  }

  return bag
}
