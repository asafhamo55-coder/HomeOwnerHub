// Title and description for every hand-written marketing page, in one place
// so seo-audit.test.ts can check length and uniqueness without importing
// pages (the root vitest config maps "@" to apps/hoa). Guide and checklist
// pages take theirs from lib/georgia instead.
//
// Titles are WITHOUT the " · HomeownerHub" suffix the layout adds (15
// characters). Keep title + suffix at 30-60 characters and descriptions at
// 70-160, so they are not truncated in search results.
//
// No "@/..." imports: the tests import this module.

import { HOA_PRICE_COPY } from './hoa-pricing'
import { HOA_PRODUCT_NAME, OTHER_HUBS_ENABLED } from './hubs'
import { PROFESSIONALS_META } from './professionals'
import { STATE_HUBS } from './state-law'
import { SITE_NAME } from './site'

export interface PageMetaEntry {
  title: string
  description: string
  /** The page sets an absolute title (no suffix), like the home page. */
  absoluteTitle?: boolean
}

export const TITLE_SUFFIX = ` · ${SITE_NAME}`

export const HOME_TITLE = 'HomeownerHub: AI workspace for HOA boards'

export const PAGE_META: Readonly<Record<string, PageMetaEntry>> = {
  '/': {
    title: HOME_TITLE,
    absoluteTitle: true,
    description:
      'The self-service AI workspace for self-managed HOA boards: dues, violations, announcements, books and documents in one place. AI drafts, the board approves.',
  },
  '/hoa': {
    // The layout template appends " · HomeownerHub", so with the other hubs
    // hidden the product name would just repeat.
    title: OTHER_HUBS_ENABLED ? `${HOA_PRODUCT_NAME}: AI workspace for HOA boards` : 'AI workspace for volunteer HOA boards',
    description:
      'Run a self-managed HOA without a management company: AI drafts letters, notices, minutes and replies from your records, the board approves. State law built in.',
  },
  '/pricing': {
    title: `Pricing | ${HOA_PRICE_COPY.title}`,
    // BL-097: PM and Eviction are not offered right now.
    description: OTHER_HUBS_ENABLED
      ? `${HOA_PRODUCT_NAME}: ${HOA_PRICE_COPY.metaSummary} PM free tier or $19–$49/mo. Eviction $99–$199 per case.`
      : `${HOA_PRODUCT_NAME}: ${HOA_PRICE_COPY.metaSummary}`,
  },
  '/compare': {
    title: 'HomeownerHub vs managers, Vantaca and DIY',
    description:
      'The comparison your board can send around: AI workflows, HomeownerHub’s checkout price, and what the alternatives publish.',
  },
  '/demo': {
    title: 'Book a demo: 20 minutes for your board',
    description:
      'Send us your CC&R. We pre-load it. We show Covenant Brain answering your actual rules. Your board decides.',
  },
  '/states': {
    title: 'State HOA laws built in: GA, FL, CA and TX',
    description:
      'The HomeownerHub workspace follows state HOA law for Georgia, Florida, California and Texas: notices, certificates, deadlines and caps, with the statute cited.',
  },
  ...Object.fromEntries(STATE_HUBS.map((h) => [`/states/${h.slug}`, h.meta])),
  '/georgia': {
    title: 'Georgia HOA law guides (SB 406) for boards',
    description:
      'Plain-language guides to Georgia’s SB 406 for boards: registration, attorney’s-fee notice, the 2027 foreclosure threshold, owners’ rights and free checklists.',
  },
  '/georgia/readiness': {
    title: 'Free SB 406 readiness check for Georgia HOAs',
    description:
      'Ten yes/no questions to see how ready your Georgia HOA is for SB 406. You get a score and a checklist with plain-language guides. Nothing is stored or sent.',
  },
  '/guides': {
    title: 'HOA guides for boards, by state',
    description:
      'Plain-language HOA guides for volunteer boards, grouped by Georgia, Florida, California and Texas, plus guides that apply in any state.',
  },
  '/templates': {
    title: 'Free HOA templates and checklists',
    description:
      'Printable HOA board templates and checklists: meeting agendas, minutes, violation and collections letters, and Georgia notice checklists. No sign-up.',
  },
  '/professionals': {
    title: PROFESSIONALS_META.title,
        description: PROFESSIONALS_META.description,
  },
  '/about': {
    title: 'About: AI for volunteer HOA boards',
    description:
      'Why HomeownerHub exists, what we believe, and how we work. Built in Atlanta for the volunteer board members doing the unpaid hours.',
  },
  '/roadmap': {
    title: 'Public roadmap: every workflow and bar',
    description:
      'The public HomeownerHub roadmap. Every workflow with its current quality bar, shipped/building/planned status, and target month.',
  },
  '/honesty-bars': {
    title: 'AI honesty bars: what Bar A, B, and C mean',
    description:
      'Every HomeownerHub workflow ships with a quality bar label. Here’s what each bar means, what it requires, and how workflows move between them.',
  },
  '/case-studies': {
    title: 'Customer case studies (coming soon)',
    description: 'HomeownerHub case studies will be published once a customer approves them.',
  },
  '/security': {
    title: 'Security: how we protect your data',
    description:
      'Encryption at rest and in transit. Postgres row-level security by tenant. Named AI providers, owner contact details kept out of prompts. AI runs logged.',
  },
  '/docs': {
    title: 'Product documentation and user guide',
    description:
      'Product documentation for HomeownerHub. The step-by-step user guide lives inside the app; API reference and runbooks come later.',
  },
  '/blog': {
    title: 'HOA governance blog for volunteer boards',
    // BL-097: no landlord or eviction topics while those hubs are not offered.
    description: OTHER_HUBS_ENABLED
      ? 'Jurisdiction-specific writing on HOA governance, landlord operations, and the AI work that’s replacing them.'
      : 'Jurisdiction-specific writing on HOA governance for volunteer boards, and the AI work that helps with it.',
  },
  '/status': {
    title: 'Service status and incident reporting',
    description: 'How to check on HomeownerHub services, and how to report an incident to our support team.',
  },
  '/privacy': {
    title: 'Privacy policy and data practices',
    description:
      'The HomeownerHub privacy policy: how we collect, use, and protect your information when you use our site and service.',
  },
  '/terms': {
    title: 'Terms of service for using the product',
    description: 'The terms of service under which you use HomeownerHub, the AI platform for self-managed HOA boards.',
  },
  '/dpa': {
    title: 'Data Processing Agreement',
    description: 'HomeownerHub’s DPA for customers needing a formal data-processing addendum.',
  },
}
