/**
 * The community template library.
 *
 * Validation runs at module load, so a malformed template fails the build
 * and the test suite rather than shipping a broken email. The two rules
 * that matter most:
 *
 *   - Every {{ placeholder }} in the body must be answerable. Either a
 *     question produces it or the send pipeline always provides it. This is
 *     what stops the bug the seeded transactional templates still have,
 *     where 71 merge fields silently render as empty string.
 *   - Single-property templates use cure_window, never deadline_date. The
 *     naming split keeps courtesy nudges linguistically separate from
 *     enforcement deadlines, so a board cannot accidentally send what reads
 *     as a defective formal notice.
 */

import { assertAccent } from '@/lib/email/palette'
import type { CommunityTemplate, BodyBlock } from './types'

/** Fields the send pipeline supplies for every message. */
export const AMBIENT_FIELDS = new Set([
  'association_name',
  'recipient_name',
  'owner_name',
  'unit_id',
])

const MAX_QUESTIONS = 5
const SNAKE = /^[a-z][a-z0-9_]*$/

function blockText(b: BodyBlock): string {
  switch (b.type) {
    case 'paragraph':
    case 'callout':
      return b.text
    case 'list':
      return b.items.join(' ')
    case 'visual':
      return ''
  }
}

function placeholdersIn(t: CommunityTemplate): Set<string> {
  const source = [t.subject, ...t.body.map(blockText)].join(' ')
  const found = new Set<string>()
  for (const m of source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(m[1])
  if (t.cta) found.add(t.cta.urlField)
  return found
}

export function validateTemplate(t: CommunityTemplate): void {
  // assertAccent knows the colour but not whose it is. With seven templates
  // "accent #A8E6C4 has luminance 0.85" does not tell you where to look, and
  // every other error in this function is slug-prefixed.
  try {
    assertAccent(t.accentColor)
  } catch (err) {
    throw new Error(`${t.slug}: ${(err as Error).message}`)
  }

  if (t.questions.length > MAX_QUESTIONS) {
    throw new Error(
      `${t.slug}: ${t.questions.length} questions, limit is five — the composer must stay under a minute`,
    )
  }

  for (const q of t.questions) {
    if (!SNAKE.test(q.id)) {
      throw new Error(`${t.slug}: question id "${q.id}" must be snake_case`)
    }
    if ((q.type === 'select' || q.type === 'multiselect') && !q.options?.length) {
      throw new Error(`${t.slug}: question "${q.id}" is ${q.type} and needs options`)
    }
    if (t.audience === 'single_property' && q.id === 'deadline_date') {
      throw new Error(
        `${t.slug}: single-property templates use cure_window, not deadline_date — ` +
          'a soft courtesy window must not be worded as an enforcement deadline',
      )
    }
  }

  const used = placeholdersIn(t)
  const answered = new Set(t.questions.map((q) => q.id))

  for (const field of used) {
    if (!answered.has(field) && !AMBIENT_FIELDS.has(field)) {
      throw new Error(
        `${t.slug}: body uses {{${field}}} but no question produces it and it is not ambient. ` +
          'It would render as empty string.',
      )
    }
  }

  for (const q of t.questions) {
    if (!used.has(q.id)) {
      throw new Error(`${t.slug}: question "${q.id}" is never used in the subject or body`)
    }
  }
}

// Task 11 populates this array.
const ALL: CommunityTemplate[] = []

for (const t of ALL) validateTemplate(t)

export const COMMUNITY_TEMPLATES: readonly CommunityTemplate[] = Object.freeze(ALL)

export function getTemplate(slug: string): CommunityTemplate | undefined {
  return COMMUNITY_TEMPLATES.find((t) => t.slug === slug)
}
