// Per-section include/exclude for a community template.
//
// The composer previously handed a board member the fully-rendered
// body_html in a textarea, so dropping a paragraph meant hand-editing HTML.
// This module lets the composer offer the template as a list of sections
// with checkboxes instead, and re-render from the survivors.
//
// Pure and free of React, Next and Supabase imports so it runs under
// vitest's node-only harness, same as severity.ts and merge-bag.ts.

import type { BodyBlock, CommunityTemplate, TemplateQuestion } from './types'

export interface TemplateSection {
  /** Index into the template's `body` array. Stable for a given template
   *  version and is what the caller excludes by. */
  index: number
  kind: BodyBlock['type']
  /** Short noun for the section list — "Paragraph", "Highlighted box". */
  label: string
  /** First line of the actual copy, so the board member can tell two
   *  paragraphs apart without opening a preview. Merge placeholders are
   *  left visible on purpose: they are how you recognise which paragraph
   *  carries your answer. */
  preview: string
}

const KIND_LABEL: Record<BodyBlock['type'], string> = {
  paragraph: 'Paragraph',
  callout: 'Highlighted box',
  list: 'Bulleted list',
  visual: 'Illustration',
  raw: 'Embedded panel',
}

const PREVIEW_LIMIT = 90

function truncate(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length <= PREVIEW_LIMIT ? flat : `${flat.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`
}

function previewOf(block: BodyBlock, t: CommunityTemplate): string {
  switch (block.type) {
    case 'paragraph':
    case 'callout':
      return truncate(block.text)
    case 'list':
      return truncate(block.items.join(' · '))
    case 'visual':
      // Three shapes, not two: an image carries alt text (already required
      // to be meaningful by the visual-block guard, so it is the honest
      // description), a meter is generated from live data and has no alt,
      // and 'none' renders nothing at all.
      switch (t.visual.kind) {
        case 'illustration':
        case 'map':
        case 'photo':
          return truncate(t.visual.alt)
        case 'meter':
          return truncate(`${t.visual.label} (generated from live data)`)
        case 'none':
          return 'No illustration'
      }
    case 'raw':
      return 'Generated panel (rendered at send time)'
  }
}

/** The template as a list of togglable sections, in body order. */
export function describeSections(t: CommunityTemplate): TemplateSection[] {
  return t.body.map((block, index) => ({
    index,
    kind: block.type,
    label: KIND_LABEL[block.type],
    preview: previewOf(block, t),
  }))
}

/**
 * A copy of the template with the excluded sections removed.
 *
 * Returns a new object; the registry's templates are frozen and shared
 * across requests, so mutating one would leak a board member's choices
 * into every other send.
 *
 * Out-of-range and duplicate indices are ignored rather than throwing —
 * they mean a stale form posted against a template whose body changed, and
 * dropping the whole send for that is worse than rendering what still
 * exists.
 */
export function withoutSections(
  t: CommunityTemplate,
  excluded: readonly number[],
): CommunityTemplate {
  const drop = new Set(excluded)
  return { ...t, body: t.body.filter((_, i) => !drop.has(i)) }
}

/**
 * Whether at least one section survives.
 *
 * An empty body renders as a shell with a headline and footer and no
 * message, which is not something anyone means to send. The composer
 * blocks it rather than letting strict rendering succeed on nothing.
 */
export function hasContent(t: CommunityTemplate, excluded: readonly number[]): boolean {
  return withoutSections(t, excluded).body.length > 0
}

/** Merge placeholders referenced by a template's subject and body. */
export function placeholdersUsed(t: CommunityTemplate): Set<string> {
  const source = [
    t.subject,
    ...t.body.map((b) => {
      switch (b.type) {
        case 'paragraph':
        case 'callout':
          return b.text
        case 'list':
          return b.items.join(' ')
        case 'raw':
          return b.html
        case 'visual':
          return ''
      }
    }),
  ].join(' ')
  const found = new Set<string>()
  for (const m of source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(m[1])
  if (t.cta) found.add(t.cta.urlField)
  return found
}

/**
 * The questions still worth asking once sections are excluded.
 *
 * If the only paragraph mentioning {{station_locations}} is switched off,
 * asking the board member where the bag stations are collects an answer
 * that cannot appear anywhere — busywork at best, and at worst it reads as
 * a promise that the information will be in the email.
 *
 * Note this is about the QUESTION, not the merge bag: buildMergeBag is
 * driven by whichever question list the composer submits, so dropping a
 * question here also keeps its now-unused field out of extraFields.
 */
export function questionsFor(
  t: CommunityTemplate,
  excluded: readonly number[],
): readonly TemplateQuestion[] {
  const used = placeholdersUsed(withoutSections(t, excluded))
  return t.questions.filter((q) => used.has(q.id))
}
