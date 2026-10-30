// What the HOA app does for each state's law, as the marketing site says it.
// ONE source for the "State law built in" section on the home page and /hoa, the
// state list on /about, and the state lines on /demo and /pricing.
//
// Truth rule (BL-002, BL-042, BL-157): every entry is something a board can
// use in apps/hoa today and names the apps/hoa page that proves it;
// marketing-truth.test.ts checks each route (and each release note) exists.
// Figures and citations are the ones the app itself uses
// (apps/hoa/src/lib/late-fees/law.ts, lib/collections/letters/law.ts,
// lib/properties/estoppel/law.ts). Nothing here is legal advice, and the
// copy never says the app makes an association compliant: it prepares the
// paperwork and cites the law; the board and its attorney decide.
//
// Georgia rules are from the Property Owners' Association Act (O.C.G.A.
// § 44-3-220 et seq.) plus SB 406 (2026). The app does not yet branch for
// Georgia condominiums (Condo Act, backlog), so the site says so.
//
// No "@/..." imports: marketing-truth.test.ts imports this module, and the
// root vitest config maps "@" to apps/hoa.

export interface StateLawFeature {
  title: string
  /** Plain language, for a volunteer board. */
  body: string
  /** The law the feature follows, as the app cites it. */
  citation: string
  /** apps/hoa page a board uses. Dynamic segments as [id]. */
  route: string
  /** docs/releases/<release>.md that announced it, where there is one. */
  release?: string
}

const GA_RELEASE_LETTERS = '2026-10-21-2255-dues-rates-late-fees-georgia'
const GA_RELEASE_COMPLIANCE = '2026-10-21-1930-elections-compliance'

export const GEORGIA_FEATURES: readonly StateLawFeature[] = [
  {
    title: 'SB 406 registration kit',
    body:
      'Decide whether to register with the Secretary of State or opt out in writing. The kit fills in the filing sheet from your records, prints a checklist, and keeps each filing, renewal and amendment on record. It doesn’t file for you.',
    citation: 'Ga. L. 2026, SB 406',
    route: '/compliance/ga-registration',
  },
  {
    title: 'Collections notices Georgia requires',
    body:
      'The notice before attorney’s fees (30 days from receipt) and the notice before foreclosure, with the $2,000 threshold and 10% interest cap checked. A letter that claims attorney’s fees stays blocked until the fee notice has gone out.',
    citation: 'SB 406 § 7 · O.C.G.A. § 44-3-232(c)',
    route: '/properties/[id]/collections-letter',
    release: GA_RELEASE_LETTERS,
  },
  {
    title: 'Quorum and proxies',
    body:
      'The annual meeting kit shows Georgia’s default quorum (more than one-third, unless your bylaws say otherwise), counts check-ins and proxies live, and prints a proxy form that meets Georgia’s rules.',
    citation: 'O.C.G.A. §§ 44-3-228, 44-3-224',
    route: '/meetings/[id]/quorum/proxies',
    release: GA_RELEASE_LETTERS,
  },
  {
    title: 'Annual report for owners',
    body:
      'From the annual meeting, print the year’s finances, budget, reserves, insurance, meetings and elections for owners. It never shows a home’s balance or an owner’s name.',
    citation: 'O.C.G.A. § 44-3-230(a)',
    route: '/meetings/[id]/annual-report',
    release: GA_RELEASE_LETTERS,
  },
  {
    title: 'Late fees within the state cap',
    body:
      'No late fee is charged until the board saves a policy. Georgia allows the greater of $10 or 10% of the late installment, and only if your declaration provides for a late charge. A policy over the cap can’t be saved.',
    citation: 'O.C.G.A. § 44-3-232(b)(1)',
    route: '/settings/late-fees',
    release: GA_RELEASE_LETTERS,
  },
  {
    title: 'Deadlines on one Compliance page',
    body:
      'Secretary of State registration, the members’ meeting notice (21 days for an annual meeting, 7 for a special one), records, and the statement of amounts due within 5 business days, with an overdue banner.',
    citation: 'O.C.G.A. §§ 44-3-230(a), 44-3-232(d)',
    route: '/compliance',
    release: GA_RELEASE_COMPLIANCE,
  },
]

export const GEORGIA_SCOPE_NOTE =
  'Georgia rules follow the Property Owners’ Association Act, the Georgia Condominium Act for condominiums, and SB 406. The app prepares the paperwork and cites the law; it isn’t legal advice, and your board and your attorney decide.'

export interface StateCoverage {
  state: string
  name: string
  /** Short items, each shipped in apps/hoa. */
  items: readonly string[]
}

/**
 * What follows each state's law today, Georgia first. Kept short: one line
 * per state on /about and the "Georgia first" section.
 */
export const STATE_COVERAGE: readonly StateCoverage[] = [
  {
    state: 'GA',
    name: 'Georgia',
    items: [
      'SB 406 registration kit',
      'Collections notices',
      'Quorum and proxies',
      'Annual report for owners',
      'Late-fee cap',
      'Statement of amounts due',
      'State-law answers',
    ],
  },
  {
    state: 'FL',
    name: 'Florida',
    items: [
      'Estoppel certificates',
      'Collections letters',
      'Budget notice and adoption checklist',
      'Fine hearings',
      'Director certification',
      'Late-fee cap',
    ],
  },
  {
    state: 'CA',
    name: 'California',
    items: [
      'Estoppel packet',
      'Collections letters',
      'Budget notice window',
      'Fine hearings',
      'Election print kit',
      'Late-fee cap',
    ],
  },
  {
    state: 'TX',
    name: 'Texas',
    items: ['Resale certificate', 'Collections letters'],
  },
]

/**
 * One card per state for the "State law built in" section (home, /hoa) and
 * the /states page. Product first (2026-10-27 positioning): states are a
 * benefit, so each gets one line. Georgia's card links to the SB 406 hub;
 * the others link to their /states/[state] hub. Every
 * line only restates STATE_COVERAGE items.
 */
export interface StateCard {
  state: string
  name: string
  benefit: string
  href: string
  cta: string
}

export const STATE_CARDS: readonly StateCard[] = [
  {
    state: 'GA',
    name: 'Georgia',
    benefit: 'SB 406 registration kit, the notices Georgia requires before attorney’s fees and foreclosure, quorum and proxies, and the late-fee cap.',
    href: '/georgia',
    cta: 'Georgia SB 406 hub',
  },
  {
    state: 'FL',
    name: 'Florida',
    benefit: 'Estoppel certificates, collections letters, the budget notice, fine hearings and the late-fee cap.',
    href: '/states/florida',
    cta: 'See Florida',
  },
  {
    state: 'CA',
    name: 'California',
    benefit: 'Estoppel packet, collections letters, the budget notice window, fine hearings and the election print kit.',
    href: '/states/california',
    cta: 'See California',
  },
  {
    state: 'TX',
    name: 'Texas',
    benefit: 'The resale certificate and collections letters.',
    href: '/states/texas',
    cta: 'See Texas',
  },
]

/**
 * Guides about each non-Georgia state's law (BL-172 batch 9), listed on that
 * state's /states card. Slugs are guides in lib/georgia (state-quotes.ts holds
 * the verbatim statute text).
 */
export const STATE_GUIDE_LINKS: Readonly<Record<string, readonly { href: string; label: string }[]>> = {
  FL: [
    { href: '/guides/florida-hoa-fine-hearing-committee', label: 'Florida fine hearings and the committee' },
    { href: '/guides/florida-hoa-estoppel-certificate-rules', label: 'Florida estoppel certificates' },
    { href: '/guides/florida-hoa-official-records-inspection', label: 'Florida official records inspection' },
    { href: '/templates/florida-hoa-fine-hearing-notice', label: 'Florida fine hearing notice template' },
  ],
  CA: [
    { href: '/guides/california-hoa-fine-hearing-and-penalty-rules', label: 'California fines and the discipline hearing' },
    { href: '/guides/california-hoa-records-inspection-rules', label: 'California records inspection' },
    { href: '/guides/california-hoa-internal-dispute-resolution', label: 'California internal dispute resolution' },
  ],
  TX: [
    { href: '/guides/texas-hoa-payment-plans-and-payment-priority', label: 'Texas payment plans and payment priority' },
    { href: '/guides/texas-hoa-management-certificate', label: 'Texas management certificate' },
    { href: '/guides/texas-hoa-resale-certificate-chapter-207', label: 'Texas resale certificate' },
    { href: '/templates/texas-hoa-payment-plan-agreement', label: 'Texas payment plan agreement template' },
  ],
}

/**
 * Content for the /states/[state] hubs (Florida, California, Texas). Georgia
 * keeps its own /georgia hub. Truth rule: `features` has exactly one entry per
 * STATE_COVERAGE item for that state, in the same words (marketing-truth.test.ts
 * checks this), so a hub can never claim more than the app ships. `statutes`
 * are act names and chapters only. No em dashes, no outcomes promised.
 */
export type TourScreenKey = 'approvals' | 'dues' | 'violations'

export interface StateHub {
  state: string
  slug: string
  name: string
  /** Act names and chapters the app cites. */
  statutes: readonly string[]
  /** One sentence under the headline. */
  lead: string
  features: readonly { item: string; body: string }[]
  /** Tour screens shown on the hub, with a caption each. */
  tour: readonly { screen: TourScreenKey; title: string; caption: string }[]
  /** Honest limits for this state, shown under the features. */
  caveats: readonly string[]
  meta: { title: string; description: string }
}

export const STATE_HUBS: readonly StateHub[] = [
  {
    state: 'FL',
    slug: 'florida',
    name: 'Florida',
    statutes: ['Florida Homeowners’ Association Act, Fla. Stat. chapter 720'],
    lead: 'For Florida associations, the drafts and deadlines follow chapter 720 and cite the section.',
    features: [
      { item: 'Estoppel certificates', body: 'Prepare an estoppel certificate for a home from your records. The board reviews it before it goes out.' },
      { item: 'Collections letters', body: 'Draft a collections letter for a late account, with the Florida section cited. A board member approves every letter.' },
      { item: 'Budget notice and adoption checklist', body: 'Draft the budget notice and follow a checklist through adoption of the budget.' },
      { item: 'Fine hearings', body: 'Work through the notice and hearing steps before a fine, including the committee review.' },
      { item: 'Director certification', body: 'Keep each director’s certification on record in the member settings.' },
      { item: 'Late-fee cap', body: 'A late-fee policy is checked against the Florida cap before it can be saved.' },
    ],
    tour: [
      { screen: 'violations', title: 'Violations and fine hearings', caption: 'Each case keeps its notice, hearing and decision in one place.' },
      { screen: 'dues', title: 'Dues and credits', caption: 'Who has paid, who has a credit, and letters drafted from the ledger.' },
    ],
    caveats: ['State-law answers for Florida are built and being loaded next. Until then, drafts cite the section but the Ask feature does not yet quote Florida’s statute.'],
    meta: {
      title: 'Florida HOA law tools for boards',
      description: 'How the HomeownerHub workspace follows Florida HOA law (chapter 720) for boards: estoppel certificates, collections letters, budget notice and fine hearings.',
    },
  },
  {
    state: 'CA',
    slug: 'california',
    name: 'California',
    statutes: ['Davis-Stirling Common Interest Development Act, Civil Code sections 4000 to 6150'],
    lead: 'For California associations, the drafts and deadlines follow the Davis-Stirling Act and cite the section.',
    features: [
      { item: 'Estoppel packet', body: 'Prepare the estoppel packet for a home from your records. The board reviews it before it goes out.' },
      { item: 'Collections letters', body: 'Draft a collections letter for a late account, with the California section cited. A board member approves every letter.' },
      { item: 'Budget notice window', body: 'See the budget notice window and draft the notice, so the dates are not left to memory.' },
      { item: 'Fine hearings', body: 'Work through the notice and hearing steps before a fine or suspension. Fine and suspension letters are refused until the notice and hearing steps are done.' },
      { item: 'Election print kit', body: 'Print the election materials from the meeting page.' },
      { item: 'Late-fee cap', body: 'A late-fee policy is checked against the California cap before it can be saved.' },
    ],
    tour: [
      { screen: 'violations', title: 'Violations and fine hearings', caption: 'Each case keeps its notice, hearing and decision in one place.' },
      { screen: 'approvals', title: 'Approvals', caption: 'Every AI draft waits here until a board member approves it.' },
    ],
    caveats: [
      'California letters cite the section but do not quote the statute text, because no California statute text is loaded for the app to check a quote against yet.',
      'A fine over the amount on your published penalty schedule is the board’s decision to confirm; the app warns about it and does not set it for you.',
      'State-law answers for California are built and being loaded next.',
    ],
    meta: {
      title: 'California HOA law tools for boards',
      description: 'How the HomeownerHub workspace follows the Davis-Stirling Act for California boards: estoppel packet, collections letters, budget notice and fine hearings.',
    },
  },
  {
    state: 'TX',
    slug: 'texas',
    name: 'Texas',
    statutes: ['Texas Property Code chapter 207 (resale certificate)', 'Texas Property Code chapter 209 (Residential Property Owners Protection Act)'],
    lead: 'For Texas associations, two documents follow the Property Code today: the resale certificate and collections letters.',
    features: [
      { item: 'Resale certificate', body: 'Prepare the resale certificate for a home from your records. The board reviews it before it goes out.' },
      { item: 'Collections letters', body: 'Draft a collections letter for a late account, with the Texas section cited. A board member approves every letter.' },
    ],
    tour: [
      { screen: 'dues', title: 'Dues and credits', caption: 'Who has paid, who has a credit, and letters drafted from the ledger.' },
      { screen: 'approvals', title: 'Approvals', caption: 'Every AI draft waits here until a board member approves it.' },
    ],
    caveats: [
      'Texas coverage is the narrowest of the four states. Fines, budgets and elections work as they do in any state, without Texas-specific rules.',
      'State-law answers for Texas are built and being loaded next.',
    ],
    meta: {
      title: 'Texas HOA law tools for boards',
      description: 'How the HomeownerHub workspace follows the Texas Property Code for boards: the resale certificate and collections letters, with the section cited on each draft.',
    },
  },
]

export const STATE_HUB_SLUGS: readonly string[] = STATE_HUBS.map((h) => h.slug)
export const STATE_HUB_PATHS: readonly string[] = STATE_HUBS.map((h) => `/states/${h.slug}`)

/** Routes behind STATE_COVERAGE items outside Georgia, for the truth test. */
export const OTHER_STATE_ROUTES: readonly string[] = [
  '/properties/[id]/estoppel',
  '/properties/[id]/collections-letter',
  '/accounting/budget/[id]/notice',
  '/accounting/budget/[id]',
  '/violations/[id]',
  '/settings/members',
  '/settings/late-fees',
  '/meetings/[id]/election/print',
]

/** One sentence for /demo and the /pricing FAQ. */
export const STATE_COVERAGE_SENTENCE =
  'State law is built in. Georgia gets the SB 406 registration kit, the collections notices Georgia requires, quorum and proxy rules, the annual report for owners and the late-fee cap; Florida and California get estoppel certificates, collections letters, the budget notice, fine hearings and late-fee caps; Texas gets the resale certificate and collections letters.'

/** State-law answers: Georgia's statute is loaded in production today. */
export const STATE_LAW_ANSWERS_NOTE =
  'Georgia today. Florida, California and Texas are built and being loaded next.'
