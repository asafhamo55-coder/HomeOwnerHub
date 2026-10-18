/**
 * "What's new" entries (spec §6.5): the `whats_new:` frontmatter block of
 * docs/releases/*.md, collected into WHATS_NEW by `pnpm guide:build`.
 *
 * Release notes are written for the owner; only entries a writer marked as
 * user-facing reach the app, so a note with no `whats_new` contributes
 * nothing. That is the default, and it keeps refactors and migrations out of
 * the feed. Pure: takes file contents, returns entries plus errors.
 */
import YAML from 'yaml'
import { z } from 'zod'
import type { WhatsNewEntry } from '../../apps/hoa/src/lib/guide/types'

export const MAX_WHATS_NEW_BODY = 280
const NO_URL = (v: string) => !/https?:\/\/|www\.|\]\(|mailto:/i.test(v)

const EntrySchema = z
  .object({
    title: z.string().trim().min(1).max(100).refine(NO_URL, 'no links; use `article:` to link a guide article'),
    body: z.string().trim().min(1).max(MAX_WHATS_NEW_BODY).refine(NO_URL, 'no links; use `article:` to link a guide article'),
    roles: z.array(z.enum(['admin', 'board', 'resident'])).min(1),
    article: z.string().regex(/^[a-z0-9-]+$/).optional(),
    label: z.enum(['new', 'improvement', 'fix']),
  })
  .strict()

/** `YYYY-MM-DD-HHMM-slug.md` (or `YYYY-MM-DD-slug.md`). `_template.md` and README are not notes. */
export function isReleaseNoteFile(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name)
}

function frontmatter(src: string): string | null {
  const m = /^---\n([\s\S]*?)\n---/.exec(src.replace(/^﻿/, '').replace(/\r\n/g, '\n'))
  return m ? m[1]! : null
}

export function compileWhatsNew(
  notes: { file: string; src: string }[],
  articleIds: ReadonlySet<string>,
): { entries: WhatsNewEntry[]; errors: string[] } {
  const entries: WhatsNewEntry[] = []
  const errors: string[] = []
  for (const { file, src } of notes) {
    const fm = frontmatter(src)
    if (!fm || !/^whats_new\s*:/m.test(fm)) continue
    let data: unknown
    try {
      data = YAML.parse(fm)
    } catch {
      errors.push(`${file}: frontmatter is not valid YAML (quote a title that contains ": ")`)
      continue
    }
    const list = (data as { whats_new?: unknown } | null)?.whats_new
    if (!Array.isArray(list)) {
      errors.push(`${file}: whats_new must be a list of entries`)
      continue
    }
    const slug = file.replace(/^.*\//, '').replace(/\.md$/, '')
    const date = slug.slice(0, 10)
    list.forEach((raw, i) => {
      const parsed = EntrySchema.safeParse(raw)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors.push(`${file}: whats_new[${i}].${issue.path.join('.') || '(entry)'}: ${issue.message}`)
        return
      }
      const e = parsed.data
      if (e.article && !articleIds.has(e.article)) {
        errors.push(`${file}: whats_new[${i}].article: unknown guide article "${e.article}"`)
        return
      }
      entries.push({ id: `${slug}#${i + 1}`, note: slug, date, title: e.title, body: e.body, roles: e.roles, article: e.article ?? null, label: e.label })
    })
  }
  // Newest note first (file names sort by deploy time), entries in written order.
  entries.sort((a, b) => (a.note === b.note ? a.id.localeCompare(b.id, 'en', { numeric: true }) : a.note < b.note ? 1 : -1))
  return { entries, errors }
}
