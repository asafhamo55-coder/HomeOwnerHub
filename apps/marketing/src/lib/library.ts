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
