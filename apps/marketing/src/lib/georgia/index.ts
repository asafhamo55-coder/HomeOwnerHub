// The Georgia section: hub, guides, free printable checklists and the
// readiness check. One registry so links, the sitemap and the tests agree.

import { ATTORNEY_FEE_NOTICE, FORECLOSURE_THRESHOLD, OWNERS_RIGHTS, REGISTRATION } from './guides-a'
import { COMPLAINT_PROCESS, CONDO_VS_HOA, LATE_FEES } from './guides-b'
import { FIRST_90_DAYS, TREASURER_DUTIES } from './guides-c'
import { FINES_HEARINGS, QUORUM_PROXIES, RECORDS_REQUESTS } from './guides-d'
import { SPECIAL_ASSESSMENTS, SWITCH_FROM_MANAGER } from './guides-e'
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
  FIRST_90_DAYS,
  QUORUM_PROXIES,
  RECORDS_REQUESTS,
  FINES_HEARINGS,
  SPECIAL_ASSESSMENTS,
]

/** Guides that live outside /georgia (BL-172 batches 2 and 4). */
export const GENERAL_GUIDES: readonly Guide[] = [TREASURER_DUTIES, SWITCH_FROM_MANAGER]
export const ALL_GUIDES: readonly Guide[] = [...GUIDE_LIST, ...GENERAL_GUIDES]

export const GUIDES: Readonly<Record<string, Guide>> = Object.fromEntries(ALL_GUIDES.map((g) => [g.slug, g]))

export const GEORGIA_HUB_PATH = '/georgia'
export const guidePath = (slug: string) => `/georgia/${slug}`
/** A guide's or checklist's own path: /georgia/<slug> unless it sets one. */
export const pathOf = (x: { slug: string; path?: string }) => x.path ?? guidePath(x.slug)

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
    slug: 'violation-notice-checklist',
    path: guidePath('violation-notice-checklist'),
    title: 'Violation notice checklist (printable)',
    blurb: 'A one-page checklist for a fair HOA violation notice, with each item tagged as statute or best practice.',
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

/** Self-managed-HOA pages outside /georgia (BL-172 batch 2): linkable like the rest. */
export const GENERAL_LINKS: readonly GeorgiaLink[] = [
  {
    slug: TREASURER_DUTIES.slug,
    path: pathOf(TREASURER_DUTIES),
    title: 'HOA treasurer duties: a plain-language checklist',
    blurb: TREASURER_DUTIES.summary[0]!,
    kind: 'guide',
  },
  {
    slug: 'hoa-board-meeting-agenda',
    path: '/templates/hoa-board-meeting-agenda',
    title: 'HOA board meeting agenda template (printable)',
    blurb: 'A one-page agenda for any state: quorum, conflicts, treasurer’s report, violations, action items.',
    kind: 'tool',
  },
  {
    slug: 'hoa-violation-letter-georgia',
    path: '/templates/hoa-violation-letter-georgia',
    title: 'HOA violation letter template for Georgia (printable)',
    blurb: 'A calm first-notice letter with a check-before-you-send list. Every legal detail is a blank for your own documents.',
    kind: 'tool',
  },
  {
    slug: 'georgia-hoa-collections-notice',
    path: '/templates/georgia-hoa-collections-notice',
    title: 'Georgia HOA collections notice template (printable)',
    blurb: 'A checklist and a fill-in first notice for an owner who is behind, built on the SB 406 fee-notice text. Every amount is a blank.',
    kind: 'tool',
  },
  {
    slug: 'hoa-board-meeting-minutes',
    path: '/templates/hoa-board-meeting-minutes',
    title: 'HOA board meeting minutes template (printable)',
    blurb: 'A one-page minutes form for any state: attendance, quorum, motions and votes, and action items.',
    kind: 'tool',
  },
  {
    slug: SWITCH_FROM_MANAGER.slug,
    path: pathOf(SWITCH_FROM_MANAGER),
    title: 'Switch from a management company to a self-managed HOA',
    blurb: SWITCH_FROM_MANAGER.summary[0]!,
    kind: 'guide',
  },
]
export const GENERAL_PATHS: readonly string[] = GENERAL_LINKS.map((l) => l.path)

/** Every content page that RelatedLinks can point to. */
export const SITE_LINKS: readonly GeorgiaLink[] = [...GEORGIA_LINKS, ...GENERAL_LINKS]

export function linkFor(slug: string): GeorgiaLink {
  const l = SITE_LINKS.find((x) => x.slug === slug)
  if (!l) throw new Error(`Unknown Georgia page: ${slug}`)
  return l
}

/** Last-modified date for the sitemap: the guide's own date, else the section date. */
export const GEORGIA_UPDATED = '2026-10-26'
