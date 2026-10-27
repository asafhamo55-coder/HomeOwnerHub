// The Georgia section: hub, guides, free printable checklists and the
// readiness check. One registry so links, the sitemap and the tests agree.

import { ATTORNEY_FEE_NOTICE, FORECLOSURE_THRESHOLD, OWNERS_RIGHTS, REGISTRATION } from './guides-a'
import { COMPLAINT_PROCESS, CONDO_VS_HOA, LATE_FEES } from './guides-b'
import type { Guide, GeorgiaLink } from './types'

export type { Guide, GeorgiaLink, GuideSection, HoaDoes } from './types'
export { CHECKLISTS, type Checklist } from './checklists'
export { READINESS_QUESTIONS, scoreReadiness, type ReadinessQuestion } from './readiness'

export const GUIDE_LIST: readonly Guide[] = [
  REGISTRATION,
  ATTORNEY_FEE_NOTICE,
  FORECLOSURE_THRESHOLD,
  OWNERS_RIGHTS,
  LATE_FEES,
  CONDO_VS_HOA,
  COMPLAINT_PROCESS,
]

export const GUIDES: Readonly<Record<string, Guide>> = Object.fromEntries(GUIDE_LIST.map((g) => [g.slug, g]))

export const GEORGIA_HUB_PATH = '/georgia'
export const guidePath = (slug: string) => `/georgia/${slug}`

/** Every page under /georgia, for link lists and the sitemap. */
export const GEORGIA_LINKS: readonly GeorgiaLink[] = [
  ...GUIDE_LIST.map((g) => ({
    slug: g.slug,
    path: guidePath(g.slug),
    title: g.metaTitle,
    blurb: g.summary[0]!,
    kind: 'guide' as const,
  })),
  {
    slug: 'readiness',
    path: guidePath('readiness'),
    title: 'SB 406 readiness check',
    blurb: 'Ten yes/no questions. A score and a checklist. Nothing is stored or sent.',
    kind: 'tool',
  },
  {
    slug: 'attorney-fee-notice-checklist',
    path: guidePath('attorney-fee-notice-checklist'),
    title: 'Attorney’s-fee notice checklist (printable)',
    blurb: 'A one-page checklist for the notice Georgia requires before an association can collect attorney’s fees.',
    kind: 'tool',
  },
  {
    slug: 'annual-meeting-notice-checklist',
    path: guidePath('annual-meeting-notice-checklist'),
    title: 'Annual meeting notice checklist (printable)',
    blurb: 'A one-page checklist for noticing a Georgia HOA annual meeting.',
    kind: 'tool',
  },
]

export const GEORGIA_PATHS: readonly string[] = [GEORGIA_HUB_PATH, ...GEORGIA_LINKS.map((l) => l.path)]

export function linkFor(slug: string): GeorgiaLink {
  const l = GEORGIA_LINKS.find((x) => x.slug === slug)
  if (!l) throw new Error(`Unknown Georgia page: ${slug}`)
  return l
}

/** Last-modified date for the sitemap: the guide's own date, else the section date. */
export const GEORGIA_UPDATED = '2026-10-26'
