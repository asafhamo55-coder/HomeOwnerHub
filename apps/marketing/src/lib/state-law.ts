// What the HOA app does for each state's law, as the marketing site says it.
// ONE source for the "Georgia first" section on the home page and /hoa, the
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
  'Georgia comes first: the SB 406 registration kit, the collections notices Georgia requires, quorum and proxy rules, the annual report for owners and the late-fee cap. Florida and California get estoppel certificates, collections letters, the budget notice, fine hearings and late-fee caps; Texas gets the resale certificate and collections letters.'

/** State-law answers: Georgia's statute is loaded in production today. */
export const STATE_LAW_ANSWERS_NOTE =
  'Georgia today. Florida, California and Texas are built and being loaded next.'
