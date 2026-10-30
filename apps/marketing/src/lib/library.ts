// The /guides and /templates index pages, built from the registry in
// ./georgia so a new guide or checklist shows up without touching a page.
// Pure data, so the tests can walk it. Relative imports only: the tests
// import this module and "@" maps to apps/hoa there.

import { ALL_GUIDES, CHECKLISTS, pathOf, type Guide } from './georgia'

export const GUIDES_PATH = '/guides'
export const TEMPLATES_PATH = '/templates'

export type GuideGroupId = 'georgia' | 'florida' | 'california' | 'texas' | 'general'

export interface LibraryItem {
  slug: string
  path: string
  title: string
  description: string
}

export interface GuideGroup {
  id: GuideGroupId
  label: string
  items: LibraryItem[]
}

const STATE_GROUPS: readonly { id: GuideGroupId; label: string }[] = [
  { id: 'georgia', label: 'Georgia' },
  { id: 'florida', label: 'Florida' },
  { id: 'california', label: 'California' },
  { id: 'texas', label: 'Texas' },
  { id: 'general', label: 'Any state' },
]

const STATE_TO_GROUP = { FL: 'florida', CA: 'california', TX: 'texas' } as const

/** A guide's group: its `state` field, else Georgia when it lives under /georgia or is a Georgia-law guide, else general. */
export function groupOf(g: Pick<Guide, 'state' | 'slug' | 'path'>): GuideGroupId {
  if (g.state) return STATE_TO_GROUP[g.state]
  return /^\/(georgia\/|guides\/georgia-)/.test(pathOf(g)) ? 'georgia' : 'general'
}

const item = (x: { slug: string; title: string; description: string; path?: string }): LibraryItem => ({
  slug: x.slug,
  path: pathOf(x),
  title: x.title,
  description: x.description,
})

/** Every guide, grouped by state. Empty groups are dropped. */
export function guideGroups(guides: readonly Guide[] = ALL_GUIDES): GuideGroup[] {
  return STATE_GROUPS.map(({ id, label }) => ({
    id,
    label,
    items: guides.filter((g) => groupOf(g) === id).map(item),
  })).filter((g) => g.items.length > 0)
}

export interface TemplateGroup {
  id: 'templates' | 'georgia-checklists'
  label: string
  blurb: string
  items: LibraryItem[]
}

/** Every template and checklist: those at /templates/*, then the Georgia checklists. */
export function templateGroups(): TemplateGroup[] {
  const all = Object.values(CHECKLISTS)
  const inTemplates = (c: { slug: string; path?: string }) => pathOf(c).startsWith(`${TEMPLATES_PATH}/`)
  const groups: TemplateGroup[] = [
    {
      id: 'templates',
      label: 'Templates and checklists for any board',
      blurb: 'Printable one-pagers and fill-in letters. Every legal detail is a blank for your own documents.',
      items: all.filter(inTemplates).map(item),
    },
    {
      id: 'georgia-checklists',
      label: 'Georgia notice checklists',
      blurb: 'Checklists for notices Georgia law spells out, with the statute quoted.',
      items: all.filter((c) => !inTemplates(c)).map(item),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** One section of a library index page: a heading and its cards. */
export interface LibrarySection {
  id: string
  label: string
  blurb?: string
  items: LibraryItem[]
}

/** Words typed into the filter box, lowercased. Empty when there is nothing to match. */
export function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Items whose title and description contain every typed word, in any order. No query keeps all. */
export function filterItems<T extends { title: string; description: string }>(items: readonly T[], query: string): T[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return [...items]
  return items.filter((i) => {
    const hay = `${i.title} ${i.description}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** Sections narrowed to the matching items. While a query is active, sections left empty are dropped. */
export function filterSections(sections: readonly LibrarySection[], query: string): LibrarySection[] {
  const active = queryTerms(query).length > 0
  const out = sections.map((s) => ({ ...s, items: filterItems(s.items, query) }))
  return active ? out.filter((s) => s.items.length > 0) : out
}

export interface LibraryEntry extends LibraryItem {
  kind: 'guide' | 'template'
  group: string
}

/** Every guide and template, for the Cmd-K palette. Built from the same registry as the index pages, so a new page shows up in both. */
export function libraryEntries(): LibraryEntry[] {
  return [
    ...guideGroups().flatMap((g) => g.items.map((i) => ({ ...i, kind: 'guide' as const, group: g.label }))),
    ...templateGroups().flatMap((g) => g.items.map((i) => ({ ...i, kind: 'template' as const, group: g.label }))),
  ]
}
