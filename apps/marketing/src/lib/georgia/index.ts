// The Georgia section: hub, guides, free printable checklists and the
// readiness check. One registry so links, the sitemap and the tests agree.

import { ATTORNEY_FEE_NOTICE, FORECLOSURE_THRESHOLD, OWNERS_RIGHTS, REGISTRATION } from './guides-a'
import { COMPLAINT_PROCESS, CONDO_VS_HOA, LATE_FEES } from './guides-b'
import { FIRST_90_DAYS, TREASURER_DUTIES } from './guides-c'
import { FINES_HEARINGS, QUORUM_PROXIES, RECORDS_REQUESTS } from './guides-d'
import { SPECIAL_ASSESSMENTS, SWITCH_FROM_MANAGER } from './guides-e'
import { AI_MEETING_MINUTES, AI_VIOLATION_LETTERS } from './guides-f'
import { CERTIFIED_MAIL_COLLECTIONS, CPA_ATTORNEY_ACCESS } from './guides-g'
import { OVERPAYMENTS_CREDITS, PAYMENT_ORDER } from './guides-h'
import { AMEND_COVENANTS, LIEN_RULES, WRITTEN_BALLOTS } from './guides-i'
import { CA_FINE_HEARING, FL_ESTOPPEL, FL_FINE_HEARING, TX_PAYMENT_PLANS } from './guides-j'
import { CA_RECORDS, FL_RECORDS, TX_MANAGEMENT_CERT } from './guides-k'
import { GA_ESTOPPEL, TX_RESALE } from './guides-l'
import { GA_BOARD_POWERS } from './guides-m'
import { CA_IDR } from './guides-n'
import { CA_COLLECTIONS, TX_COLLECTIONS } from './guides-o'
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
export const GENERAL_GUIDES: readonly Guide[] = [TREASURER_DUTIES, SWITCH_FROM_MANAGER, AI_VIOLATION_LETTERS, AI_MEETING_MINUTES, CPA_ATTORNEY_ACCESS, CERTIFIED_MAIL_COLLECTIONS, OVERPAYMENTS_CREDITS, PAYMENT_ORDER, WRITTEN_BALLOTS, AMEND_COVENANTS, LIEN_RULES, FL_FINE_HEARING, FL_ESTOPPEL, TX_PAYMENT_PLANS, CA_FINE_HEARING, FL_RECORDS, CA_RECORDS, TX_MANAGEMENT_CERT, GA_ESTOPPEL, TX_RESALE, GA_BOARD_POWERS, CA_IDR, TX_COLLECTIONS, CA_COLLECTIONS]
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
  {
    slug: AI_VIOLATION_LETTERS.slug,
    path: pathOf(AI_VIOLATION_LETTERS),
    title: 'AI HOA violation letters, with the board approving each one',
    blurb: AI_VIOLATION_LETTERS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: AI_MEETING_MINUTES.slug,
    path: pathOf(AI_MEETING_MINUTES),
    title: 'AI HOA meeting minutes from a transcript',
    blurb: AI_MEETING_MINUTES.summary[0]!,
    kind: 'guide',
  },
  {
    slug: CPA_ATTORNEY_ACCESS.slug,
    path: pathOf(CPA_ATTORNEY_ACCESS),
    title: 'Give your HOA’s CPA and attorney limited access',
    blurb: CPA_ATTORNEY_ACCESS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: CERTIFIED_MAIL_COLLECTIONS.slug,
    path: pathOf(CERTIFIED_MAIL_COLLECTIONS),
    title: 'Georgia HOA collections: certified mail and notice clocks',
    blurb: CERTIFIED_MAIL_COLLECTIONS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: OVERPAYMENTS_CREDITS.slug,
    path: pathOf(OVERPAYMENTS_CREDITS),
    title: 'Georgia HOA overpayments and credits on an owner’s account',
    blurb: OVERPAYMENTS_CREDITS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: PAYMENT_ORDER.slug,
    path: pathOf(PAYMENT_ORDER),
    title: 'Georgia HOA payment order under SB 406',
    blurb: PAYMENT_ORDER.summary[0]!,
    kind: 'guide',
  },
  {
    slug: 'apply-hoa-credit-to-owner-balance-checklist',
    path: '/templates/apply-hoa-credit-to-owner-balance-checklist',
    title: 'Apply a credit to an owner’s balance: checklist (printable)',
    blurb: 'A one-page checklist for a board putting an owner’s credit on account against a charge, with the Georgia payment order quoted.',
    kind: 'tool',
  },
  {
    slug: WRITTEN_BALLOTS.slug,
    path: pathOf(WRITTEN_BALLOTS),
    title: 'Georgia HOA written ballots: voting without a meeting',
    blurb: WRITTEN_BALLOTS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: AMEND_COVENANTS.slug,
    path: pathOf(AMEND_COVENANTS),
    title: 'Amending HOA covenants in Georgia: the two-thirds rule',
    blurb: AMEND_COVENANTS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: LIEN_RULES.slug,
    path: pathOf(LIEN_RULES),
    title: 'Georgia HOA assessment lien rules explained',
    blurb: LIEN_RULES.summary[0]!,
    kind: 'guide',
  },
  {
    slug: FL_FINE_HEARING.slug,
    path: pathOf(FL_FINE_HEARING),
    title: 'Florida HOA fine hearings: the 14-day notice and the committee',
    blurb: FL_FINE_HEARING.summary[0]!,
    kind: 'guide',
  },
  {
    slug: FL_ESTOPPEL.slug,
    path: pathOf(FL_ESTOPPEL),
    title: 'Florida HOA estoppel certificates: deadline, fees and validity',
    blurb: FL_ESTOPPEL.summary[0]!,
    kind: 'guide',
  },
  {
    slug: TX_PAYMENT_PLANS.slug,
    path: pathOf(TX_PAYMENT_PLANS),
    title: 'Texas HOA payment plans and the order payments are applied',
    blurb: TX_PAYMENT_PLANS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: CA_FINE_HEARING.slug,
    path: pathOf(CA_FINE_HEARING),
    title: 'California HOA fines: the $100 cap and the hearing before discipline',
    blurb: CA_FINE_HEARING.summary[0]!,
    kind: 'guide',
  },
  {
    slug: FL_RECORDS.slug,
    path: pathOf(FL_RECORDS),
    title: 'Florida HOA official records: how an owner inspects them',
    blurb: FL_RECORDS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: CA_RECORDS.slug,
    path: pathOf(CA_RECORDS),
    title: 'California HOA records: what members can inspect and how fast',
    blurb: CA_RECORDS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: TX_MANAGEMENT_CERT.slug,
    path: pathOf(TX_MANAGEMENT_CERT),
    title: 'Texas HOA management certificate: what to record and when to update it',
    blurb: TX_MANAGEMENT_CERT.summary[0]!,
    kind: 'guide',
  },
  {
    slug: GA_ESTOPPEL.slug,
    path: pathOf(GA_ESTOPPEL),
    title: 'Georgia HOA estoppel letter at resale: the five-business-day statement',
    blurb: GA_ESTOPPEL.summary[0]!,
    kind: 'guide',
  },
  {
    slug: TX_RESALE.slug,
    path: pathOf(TX_RESALE),
    title: 'Texas HOA resale certificate: contents, deadline and fee cap',
    blurb: TX_RESALE.summary[0]!,
    kind: 'guide',
  },
  {
    slug: GA_BOARD_POWERS.slug,
    path: pathOf(GA_BOARD_POWERS),
    title: 'What a Georgia HOA board can do under O.C.G.A. § 44-3-231',
    blurb: GA_BOARD_POWERS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: 'georgia-hoa-proxy-and-written-ballot-form',
    path: '/templates/georgia-hoa-proxy-and-written-ballot-form',
    title: 'Georgia HOA proxy and written ballot form fields (printable)',
    blurb: 'The fields a proxy appointment form and a written ballot should carry, with the Georgia Nonprofit Code text behind each.',
    kind: 'tool',
  },
  {
    slug: 'georgia-hoa-payment-plan-agreement',
    path: '/templates/georgia-hoa-payment-plan-agreement',
    title: 'Georgia HOA payment plan agreement fields (printable)',
    blurb: 'The fields a written payment plan agreement can carry, with the Georgia late charge, interest and payment order text that may bear on it.',
    kind: 'tool',
  },
  {
    slug: CA_IDR.slug,
    path: pathOf(CA_IDR),
    title: 'California HOA internal dispute resolution: what Civil Code 5900 to 5920 require',
    blurb: CA_IDR.summary[0]!,
    kind: 'guide',
  },
  {
    slug: 'texas-hoa-payment-plan-agreement',
    path: '/templates/texas-hoa-payment-plan-agreement',
    title: 'Texas HOA payment plan agreement fields (printable)',
    blurb: 'The fields a written payment plan agreement can carry, with the Texas Property Code text on plan terms and payment order behind each.',
    kind: 'tool',
  },
  {
    slug: TX_COLLECTIONS.slug,
    path: pathOf(TX_COLLECTIONS),
    title: 'Texas HOA notice before collections: what Property Code 209.0064 requires',
    blurb: TX_COLLECTIONS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: CA_COLLECTIONS.slug,
    path: pathOf(CA_COLLECTIONS),
    title: 'California HOA pre-lien notice and collections: what Civil Code 5650 to 5665 require',
    blurb: CA_COLLECTIONS.summary[0]!,
    kind: 'guide',
  },
  {
    slug: 'florida-hoa-notice-of-intent-to-lien',
    path: '/templates/florida-hoa-notice-of-intent-to-lien',
    title: 'Florida HOA notice of intent to record a claim of lien (printable)',
    blurb: 'A checklist and a fill-in 45-day notice of intent to record a claim of lien, with the Florida text behind each field.',
    kind: 'tool',
  },
  {
    slug: 'florida-hoa-fine-hearing-notice',
    path: '/templates/florida-hoa-fine-hearing-notice',
    title: 'Florida HOA fine hearing notice (printable)',
    blurb: 'A checklist and a fill-in notice of the right to a hearing before a fine or suspension, with the Florida text behind each field.',
    kind: 'tool',
  },
  {
    slug: 'hoa-annual-budget-worksheet',
    path: '/templates/hoa-annual-budget-worksheet',
    title: 'HOA annual budget and reserve contribution worksheet (printable)',
    blurb: 'A one-page worksheet for income and expense lines, the reserve contribution, the dues math and the summary owners get.',
    kind: 'tool',
  },
  {
    slug: 'hoa-board-conflict-of-interest-disclosure-checklist',
    path: '/templates/hoa-board-conflict-of-interest-disclosure-checklist',
    title: 'HOA board conflict-of-interest disclosure checklist (printable)',
    blurb: 'A one-page checklist for recording each director’s conflict disclosure before a bid or vendor decision, with the Georgia SB 406 text quoted.',
    kind: 'tool',
  },
  {
    slug: 'georgia-annual-meeting-report-checklist',
    path: '/templates/georgia-annual-meeting-report-checklist',
    title: 'Georgia annual meeting report to owners checklist (printable)',
    blurb: 'A one-page checklist for the affairs, finances and budget report Georgia boards make at the annual meeting.',
    kind: 'tool',
  },
  {
    slug: 'hoa-announcement-templates',
    path: '/templates/hoa-announcement-templates',
    title: 'HOA announcement templates: Halloween, holidays, pets (printable)',
    blurb: 'A send checklist and a fill-in event notice for the community announcements every board sends each year.',
    kind: 'tool',
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
