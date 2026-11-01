/**
 * HOA software market data for /compare.
 *
 * Truth rules:
 * - A competitor cell states only what that company publishes on its own site.
 *   Each cell carries the URL it came from. Pages were read on CHECKED_ON.
 * - If we could not confirm something, the cell is 'not-confirmed'. We never
 *   write 'no' for a competitor unless their own material shows it, and then
 *   the cell must carry a note saying so (competitors.test.ts enforces this).
 * - Prices we could not find on their site are 'Ask them for a price'.
 * - Our own cells describe only what apps/hoa ships today. Online dues payment
 *   by card and bank transfer is NOT live. There is no two-factor sign-in and
 *   no online voting yet.
 * - No logos, no copied text, no ratings, no claims about their customers.
 */

export const CHECKED_ON = '2026-11-01'
export const CHECKED_LABEL = 'November 1, 2026'

export type FeatureKey =
  | 'payments'
  | 'accounting'
  | 'portal'
  | 'violationsArc'
  | 'ai'
  | 'lawCitations'
  | 'trial'

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  payments: 'Online payments',
  accounting: 'Accounting',
  portal: 'Resident portal',
  violationsArc: 'Violations and ARC',
  ai: 'AI help',
  lawCitations: 'AI answers that cite the law',
  trial: 'Free trial',
}

export type CellState = 'yes' | 'partial' | 'not-confirmed' | 'no'

export interface CompetitorCell {
  state: CellState
  /** Short plain-words detail shown under the badge. */
  note?: string
  /** URL on the competitor's own site this cell was read from. */
  source: string
}

export type Audience = 'self-managed' | 'management-companies' | 'both'

export interface Competitor {
  id: string
  name: string
  audience: Audience
  /** One plain line on who they sell to, as their site presents it. */
  audienceNote: string
  /** What the starting price cell shows. */
  startingPrice: string
  /** True when a number was published on their site. */
  priceIsPublished: boolean
  priceNote?: string
  bestFor: string
  features: Record<FeatureKey, CompetitorCell>
  sources: { url: string; checkedOn: string }[]
}

const ASK = 'Ask them for a price'
const NC = (source: string, note?: string): CompetitorCell => ({ state: 'not-confirmed', note, source })

const PAYHOA = 'https://www.payhoa.com/pricing'
const HOAEXP = 'https://www.hoa-express.com/pricing'
const BUILDIUM_P = 'https://www.buildium.com/pricing/'
const BUILDIUM_A = 'https://www.buildium.com/association-management-software-lp/'
const APPFOLIO = 'https://www.appfolio.com/hoa/community-association-management'
const VANTACA = 'https://www.vantaca.com/'
const TOWNSQ = 'https://www.townsq.io/'
const TOWNSQ_P = 'https://www.townsq.io/pricing'
const CINC = 'https://www.cincsystems.com/'
const FRONTSTEPS = 'https://www.frontsteps.com/'
const CONDO_P = 'https://www.condocontrol.com/pricing/'
const CONDO = 'https://www.condocontrol.com/'
const HOALIFE = 'https://www.hoalife.com/'
const HOALIFE_P = 'https://www.hoalife.com/pricing'
const HOASTART = 'https://www.hoastart.com/'

const src = (...urls: string[]) => urls.map((url) => ({ url, checkedOn: CHECKED_ON }))

export const COMPETITORS: readonly Competitor[] = [
  {
    id: 'payhoa',
    name: 'PayHOA',
    audience: 'self-managed',
    audienceNote: 'Software for HOAs run by their own board.',
    startingPrice: 'From $49 a month',
    priceIsPublished: true,
    priceNote:
      'For 1 to 25 units, billed yearly ($54 billed monthly). Card payments cost 3.5% plus $0.50 and bank transfers cost $2.45, and the HOA can pass these to owners.',
    bestFor:
      'Boards that want to collect dues online this month. PayHOA does that today and we do not yet. Also a good fit if you want a community website and online voting.',
    features: {
      payments: { state: 'yes', note: 'Card and bank transfer.', source: PAYHOA },
      accounting: { state: 'yes', note: 'General ledger, bank sync and reconciliation.', source: PAYHOA },
      portal: { state: 'yes', note: 'An owner portal.', source: PAYHOA },
      violationsArc: {
        state: 'partial',
        note: 'Violation tracking and custom request forms. Architectural review is not named.',
        source: PAYHOA,
      },
      ai: { state: 'yes', note: 'Gable AI, free for 3 months, then $24.50 a month on the $49 plan.', source: PAYHOA },
      lawCitations: NC(PAYHOA, 'Their page says answers come with sources. It does not say state law.'),
      trial: { state: 'yes', note: '30 days, no card.', source: PAYHOA },
    },
    sources: src(PAYHOA),
  },
  {
    id: 'hoa-express',
    name: 'HOA Express',
    audience: 'self-managed',
    audienceNote: 'Small communities and clubs.',
    startingPrice: 'Free up to 50 households',
    priceIsPublished: true,
    priceNote: 'Paid plans list $15 and $21 a month billed yearly, for up to 25 households.',
    bestFor: 'A small neighborhood that mostly needs a simple website and announcements and wants to spend little.',
    features: {
      payments: { state: 'yes', note: 'On the $21 plan.', source: HOAEXP },
      accounting: NC(HOAEXP),
      portal: { state: 'partial', note: 'Residents can register and manage their own profile.', source: HOAEXP },
      violationsArc: NC(HOAEXP),
      ai: NC(HOAEXP),
      lawCitations: NC(HOAEXP),
      trial: { state: 'yes', note: '30 days, no card.', source: HOAEXP },
    },
    sources: src(HOAEXP),
  },
  {
    id: 'hoa-start',
    name: 'HOA Start',
    audience: 'self-managed',
    audienceNote: 'Condo, HOA and POA boards.',
    startingPrice: ASK,
    priceIsPublished: false,
    bestFor: 'Boards that want online voting, dues and violation tracking in one place and are fine requesting a quote.',
    features: {
      payments: { state: 'yes', note: 'Dues, recurring payments and late fees.', source: HOASTART },
      accounting: { state: 'yes', note: 'Reports and budget forecasting, plus a bookkeeping service.', source: HOASTART },
      portal: { state: 'yes', note: 'Member dashboards.', source: HOASTART },
      violationsArc: { state: 'yes', note: 'Violation tracking and architectural requests.', source: HOASTART },
      ai: NC(HOASTART),
      lawCitations: NC(HOASTART),
      trial: { state: 'yes', note: 'They offer a free trial. Length not stated.', source: HOASTART },
    },
    sources: src(HOASTART),
  },
  {
    id: 'hoalife',
    name: 'HOALife',
    audience: 'both',
    audienceNote: 'Self-managed HOAs and management companies, from about 100 homes up.',
    startingPrice: 'From $199 a month',
    priceIsPublished: true,
    priceNote: 'Their site says the final price is set after a demo.',
    bestFor:
      'Larger communities with heavy architectural review and inspection work, where a guided demo and set-up is welcome.',
    features: {
      payments: { state: 'yes', note: 'The HOA or the owner can pay the processing fee.', source: HOALIFE },
      accounting: { state: 'partial', note: 'Syncs with QuickBooks Online.', source: HOALIFE },
      portal: { state: 'yes', note: 'Owners view balances and submit requests.', source: HOALIFE },
      violationsArc: { state: 'yes', note: 'Inspections, notices and online architectural approval.', source: HOALIFE },
      ai: { state: 'partial', note: 'They list AI features and give no detail.', source: HOALIFE },
      lawCitations: NC(HOALIFE),
      trial: NC(HOALIFE_P, 'They offer a demo.'),
    },
    sources: src(HOALIFE, HOALIFE_P),
  },
  {
    id: 'condo-control',
    name: 'Condo Control',
    audience: 'both',
    audienceNote: 'Condos, co-ops and HOAs, run by a board or a manager.',
    startingPrice: ASK,
    priceIsPublished: false,
    priceNote: 'Their pricing page offers a custom quote by community size.',
    bestFor: 'Condo buildings that need package logs, amenity booking or visitor tracking alongside the basics.',
    features: {
      payments: { state: 'yes', note: 'Listed. Which plan includes it is not stated.', source: CONDO_P },
      accounting: { state: 'yes', note: 'Listed. Which plan includes it is not stated.', source: CONDO_P },
      portal: { state: 'yes', note: 'Listed.', source: CONDO_P },
      violationsArc: {
        state: 'yes',
        note: 'Architectural requests are listed. Violation tracking is an add-on.',
        source: CONDO_P,
      },
      ai: { state: 'yes', note: 'Capstan AI is an add-on.', source: CONDO },
      lawCitations: NC(CONDO),
      trial: NC(CONDO, 'They offer a demo.'),
    },
    sources: src(CONDO_P, CONDO),
  },
  {
    id: 'townsq',
    name: 'TownSq',
    audience: 'both',
    audienceNote: 'Management companies, boards and residents.',
    startingPrice: 'From $90 a month',
    priceIsPublished: true,
    priceNote:
      'The lowest price on their pricing page. The page does not make clear which community size each price is for, so confirm with them.',
    bestFor:
      'Communities already served by a management company that uses TownSq, so residents and the manager share one app.',
    features: {
      payments: NC(TOWNSQ, 'Mentioned only in general terms.'),
      accounting: { state: 'partial', note: 'An accounting service is listed.', source: TOWNSQ },
      portal: { state: 'partial', note: 'A homeowner mobile app with news and events.', source: TOWNSQ },
      violationsArc: {
        state: 'partial',
        note: 'Violation tracking and architectural review are listed as paid add-ons.',
        source: TOWNSQ_P,
      },
      ai: { state: 'yes', note: 'Suggests replies to resident requests using community documents.', source: TOWNSQ },
      lawCitations: NC(TOWNSQ),
      trial: NC(TOWNSQ, 'They offer a demo.'),
    },
    sources: src(TOWNSQ, TOWNSQ_P),
  },
  {
    id: 'buildium',
    name: 'Buildium',
    audience: 'management-companies',
    audienceNote:
      'Property managers, including some who manage associations. Small self-managed associations are also mentioned.',
    startingPrice: 'Plans from $65 a month',
    priceIsPublished: true,
    priceNote:
      'These are their general plan prices. Ask them what an association pays. Payment fees are extra.',
    bestFor:
      'A board that hires a small property manager who already uses Buildium, or one that wants a mature accounting system and accepts a steeper learning curve.',
    features: {
      payments: { state: 'yes', note: 'Online payments and autopay. Fees apply.', source: BUILDIUM_P },
      accounting: { state: 'yes', note: 'Bank reconciliation, approvals and reporting.', source: BUILDIUM_A },
      portal: { state: 'yes', note: 'A resident center.', source: BUILDIUM_A },
      violationsArc: {
        state: 'yes',
        note: 'Violations and architectural requests with committee voting.',
        source: BUILDIUM_A,
      },
      ai: { state: 'yes', note: 'AI assistant and AI tools, more on higher plans.', source: BUILDIUM_P },
      lawCitations: NC(BUILDIUM_P),
      trial: { state: 'yes', note: '14 days, no card.', source: BUILDIUM_P },
    },
    sources: src(BUILDIUM_P, BUILDIUM_A),
  },
  {
    id: 'appfolio',
    name: 'AppFolio',
    audience: 'management-companies',
    audienceNote: 'Companies that manage associations for a living.',
    startingPrice: ASK,
    priceIsPublished: false,
    bestFor: 'A management company running many properties. A volunteer board would not normally buy it directly.',
    features: {
      payments: { state: 'yes', note: 'Online payments in the portals.', source: APPFOLIO },
      accounting: NC(APPFOLIO, 'A financials section is linked but not described.'),
      portal: { state: 'yes', note: 'Homeowner and board portals.', source: APPFOLIO },
      violationsArc: { state: 'yes', note: 'Violation letters and architectural requests.', source: APPFOLIO },
      ai: NC(APPFOLIO, 'An AI page is linked but not described on the page we read.'),
      lawCitations: NC(APPFOLIO),
      trial: NC(APPFOLIO, 'They offer a demo.'),
    },
    sources: src(APPFOLIO),
  },
  {
    id: 'vantaca',
    name: 'Vantaca',
    audience: 'management-companies',
    audienceNote: 'Community management companies.',
    startingPrice: ASK,
    priceIsPublished: false,
    bestFor:
      'A management company that wants an operations platform with AI agents. It is built for firms, not for a volunteer board.',
    features: {
      payments: NC(VANTACA),
      accounting: NC(VANTACA, 'Managed accounting services are listed.'),
      portal: NC(VANTACA, 'A resident offering called Vantaca Home is listed without detail.'),
      violationsArc: NC(VANTACA),
      ai: { state: 'yes', note: 'HOAi Fleet, described as an AI workforce.', source: VANTACA },
      lawCitations: NC(VANTACA),
      trial: NC(VANTACA, 'They offer a demo.'),
    },
    sources: src(VANTACA),
  },
  {
    id: 'cinc',
    name: 'CINC Systems',
    audience: 'management-companies',
    audienceNote: 'Management companies, with boards and residents as users.',
    startingPrice: ASK,
    priceIsPublished: false,
    bestFor:
      'A management company that wants deep accounting and many bank integrations. Boards usually meet it through their manager.',
    features: {
      payments: { state: 'yes', note: 'Through CINC Connect.', source: CINC },
      accounting: { state: 'yes', note: 'Accounting and bank integrations.', source: CINC },
      portal: { state: 'yes', note: 'CINC Connect, on web and mobile.', source: CINC },
      violationsArc: {
        state: 'partial',
        note: 'An architectural request skill is listed. Violations are not described.',
        source: CINC,
      },
      ai: { state: 'partial', note: 'Cephai skills are listed without detail.', source: CINC },
      lawCitations: NC(CINC),
      trial: NC(CINC, 'They offer a demo.'),
    },
    sources: src(CINC),
  },
  {
    id: 'frontsteps',
    name: 'FRONTSTEPS',
    audience: 'management-companies',
    audienceNote: 'Community management companies. Their site also has pages for boards and homeowners.',
    startingPrice: ASK,
    priceIsPublished: false,
    bestFor: 'A management company that wants accounting plus a resident app in one package.',
    features: {
      payments: { state: 'yes', note: 'Owners pay assessments online.', source: FRONTSTEPS },
      accounting: { state: 'yes', note: 'Budgets, payables and receivables.', source: FRONTSTEPS },
      portal: { state: 'partial', note: 'A community mobile app and resident login.', source: FRONTSTEPS },
      violationsArc: NC(FRONTSTEPS),
      ai: { state: 'yes', note: 'An AI assistant and AI reporting.', source: FRONTSTEPS },
      lawCitations: NC(FRONTSTEPS),
      trial: NC(FRONTSTEPS, 'They offer a demo.'),
    },
    sources: src(FRONTSTEPS),
  },
]

/** Our own price: one plan with every feature. Hardcoded until hoa-pricing.ts exposes it. */
export const OUR_PRICE = {
  tiers: [
    { homes: '1 to 50 homes', monthlyUsd: 59 },
    { homes: '51 to 100 homes', monthlyUsd: 109 },
    { homes: '101 to 200 homes', monthlyUsd: 169 },
    { homes: '201 to 400 homes', monthlyUsd: 249 },
  ],
  overFourHundredPerHomeUsd: 0.65,
  yearlyFreeMonths: 2,
  trialDays: 30,
} as const

export interface OurCell {
  state: 'yes' | 'partial' | 'soon' | 'no'
  note: string
}

/** Verified against apps/hoa on 2026-11-01. */
export const OURS: Record<FeatureKey, OurCell> = {
  payments: { state: 'soon', note: 'Not live yet. Today: Zelle with automatic matching, and recorded checks.' },
  accounting: { state: 'yes', note: 'General ledger, bank reconciliation, budgets and period close.' },
  portal: { state: 'yes', note: 'An installable web app for owners, with alerts.' },
  violationsArc: { state: 'yes', note: 'Violations with hearings and fines, and architectural review with decision letters.' },
  ai: { state: 'yes', note: 'Ask your governing documents, and get drafted letters. Included in the price.' },
  lawCitations: { state: 'yes', note: 'Answers cite your CC&R section. Georgia law is built in.' },
  trial: { state: 'yes', note: '30 days, no card.' },
}

export const OUR_GAPS: readonly string[] = [
  'Card and bank-transfer dues payments are not live yet.',
  'No online voting yet. We provide a paper election kit.',
  'No two-factor sign-in yet.',
  'No community website builder or amenity booking.',
]

export function audienceLabel(a: Audience): string {
  if (a === 'self-managed') return 'Self-managed boards'
  if (a === 'management-companies') return 'Management companies'
  return 'Boards and managers'
}
