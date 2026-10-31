// Content for the /features/* pages (one shared template:
// components/site/feature-page.tsx). Truth rule (BL-002, BL-042): every claim
// below is a feature a board can use in apps/hoa today. Wording is taken from
// the shipped lists in app/pricing/page.tsx, lib/features.ts and app/hoa/page.tsx.
// No "@/..." imports: tests import this module.

export type FeatureScreen = 'approvals' | 'dues' | 'violations' | 'announcements' | 'ask'

export interface FeaturePageData {
  slug: string
  /** Breadcrumb and nav label. */
  label: string
  /** H1 is `before` + tinted `keyword` + `after`. */
  h1: { before: string; keyword: string; after?: string }
  subhead: string
  screen: FeatureScreen
  benefits: Array<{ title: string; body: string }>
  /** Slugs of other feature pages. */
  related: string[]
  /** apps/hoa routes that prove the page (checked by a test). */
  routes: string[]
}

export const FEATURE_PAGES: readonly FeaturePageData[] = [
  {
    slug: 'dues-and-accounting',
    label: 'Dues and accounting',
    h1: { before: 'Dues and books for ', keyword: 'volunteer boards', after: ', in one place' },
    subhead: 'Balances, late fees, vendor bills and the month-end report, kept in one ledger your whole board can read.',
    screen: 'dues',
    routes: ['/dues', '/accounting', '/settings/late-fees'],
    benefits: [
      {
        title: 'Know who has paid',
        body: 'See each home’s balance and credits. The board records payments in the ledger, and owners see their own balance and statement in the resident portal.',
      },
      {
        title: 'Late fees held to the state cap',
        body: 'The board sets the late-fee policy. It is held to the state cap, so a fee never goes out above what the law allows.',
      },
      {
        title: 'Bills scanned into Approvals',
        body: 'Scan a vendor bill. The AI reads the vendor, invoice number, dates, total and account into Approvals. Fix anything before you approve; nothing is entered until then.',
      },
      {
        title: 'A report on the 1st',
        body: 'The month-end board report is emailed on the 1st, from the books. Accounting, bank feeds and the report are on the Complete plan.',
      },
    ],
    related: ['violations', 'announcements', 'ask-your-documents'],
  },
  {
    slug: 'violations',
    label: 'Violations',
    h1: { before: 'Handle ', keyword: 'violations', after: ' from photo to letter' },
    subhead: 'Take a photo, add a caption. A letter with the rule cited waits in Approvals for the board.',
    screen: 'violations',
    routes: ['/violations/new', '/approvals'],
    benefits: [
      {
        title: 'Drafted from a photo',
        body: 'Photo and caption in, a drafted letter out, with the rule from your documents cited. The board can edit it.',
      },
      {
        title: 'Approve or reject in one click',
        body: 'Every letter waits in Approvals. Approving never emails the homeowner by itself, so nothing leaves without a board member’s decision.',
      },
      {
        title: 'Collections letters for four states',
        body: 'Collections letters follow Georgia, Florida, California or Texas law. They are approved in Approvals and printed. Collections letters are on the Complete plan.',
      },
      {
        title: 'A trail you can show',
        body: 'The board sees what the AI drafted and what was approved, so a homeowner’s question has an answer.',
      },
    ],
    related: ['architecture-requests', 'ask-your-documents', 'announcements'],
  },
  {
    slug: 'announcements',
    label: 'Announcements',
    h1: { before: 'Send ', keyword: 'announcements', after: ' that reach every home' },
    subhead: 'Write a sentence. The AI drafts the message, the audience and the timing. You press Send.',
    screen: 'announcements',
    routes: ['/communications/new', '/communications/[id]'],
    benefits: [
      {
        title: 'Drafted from a sentence',
        body: 'Type what you want to tell residents in plain words. The AI fills in the audience, subject and message, and flags missing facts.',
      },
      {
        title: 'Pick who gets it',
        body: 'Send to all homes, owners, renters, homes behind on dues, one home or a single street. Preview it on a phone and send a test to yourself.',
      },
      {
        title: 'Spanish, reviewed first',
        body: 'Add an AI-drafted Spanish version. The board reads it, can edit it, and confirms it before anything is sent.',
      },
      {
        title: 'See who opened it',
        body: 'Results by home show who received and opened a message. A reminder email to those who haven’t is ready for you to review.',
      },
    ],
    related: ['dues-and-accounting', 'violations', 'ask-your-documents'],
  },
  {
    slug: 'architecture-requests',
    label: 'Architecture requests',
    h1: { before: 'Review ', keyword: 'architecture requests', after: ' against your rules' },
    subhead: 'Residents check a project before they submit. The board gets a cited review and decides.',
    screen: 'approvals',
    routes: ['/arc', '/resident/arc/new'],
    benefits: [
      {
        title: 'A pre-check for residents',
        body: 'Residents can check a request against your guidelines before submitting, so fewer incomplete requests reach the board.',
      },
      {
        title: 'A cited review for the board',
        body: 'The board gets a review with the guideline cited and findings from the photos. The board decides.',
      },
      {
        title: 'Decision letters, editable',
        body: 'Decision letters are drafted for you to edit. They wait in Approvals like every other AI draft.',
      },
    ],
    related: ['violations', 'ask-your-documents', 'announcements'],
  },
  {
    slug: 'ask-your-documents',
    label: 'Ask your documents',
    h1: { before: 'Ask your ', keyword: 'governing documents', after: ' and get cited answers' },
    subhead: 'Plain-English rule questions, answered with the section cited. When your documents don’t cover it, it says so.',
    screen: 'ask',
    routes: ['/ai/ask', '/resident/ask'],
    benefits: [
      {
        title: 'Answers with the section cited',
        body: 'Ask any rule question in plain English. The answer cites the CC&R section, so a board member can check it.',
      },
      {
        title: 'Honest when it doesn’t know',
        body: 'If your documents don’t cover a question, the answer says so instead of guessing.',
      },
      {
        title: 'State law built in',
        body: 'HOA-law questions are answered with citations to the statute, for Georgia, Florida, California and Texas. It is not legal advice.',
      },
      {
        title: 'Residents can ask too',
        body: 'On the resident portal, owners ask about their balance, requests, announcements and the rules, with the document section cited. The board turns it on.',
      },
    ],
    related: ['violations', 'architecture-requests', 'dues-and-accounting'],
  },
]

export const featurePath = (slug: string) => `/features/${slug}`
