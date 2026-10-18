// The property page's sections, in page order. On a desktop they are one
// scrolling page with an anchor nav; on a phone, tabs (`?tab=`) show one
// at a time. Pure, for vitest.

export const SECTIONS = ['people', 'money', 'compliance', 'leases', 'communications', 'activity'] as const
export type SectionKey = (typeof SECTIONS)[number]

export const SECTION_LABEL: Record<SectionKey, string> = {
  people: 'People',
  money: 'Money',
  compliance: 'Compliance',
  leases: 'Leases',
  communications: 'Communications',
  activity: 'Activity',
}

/** Shorter labels for the phone tab strip. */
export const SECTION_TAB_LABEL: Record<SectionKey, string> = { ...SECTION_LABEL, communications: 'Comms' }

/**
 * `?tab=` → section. The page used to have seven tabs; their links (in
 * the guide, in bookmarks) land on the section that took each one over.
 */
const LEGACY: Record<string, SectionKey> = {
  overview: 'people',
  residents: 'people',
  dues: 'money',
  collections: 'money',
  violations: 'compliance',
  mail: 'communications',
  history: 'activity',
}

export function parseSection(raw: string | undefined): SectionKey {
  if (!raw) return 'people'
  if ((SECTIONS as readonly string[]).includes(raw)) return raw as SectionKey
  return LEGACY[raw] ?? 'people'
}
