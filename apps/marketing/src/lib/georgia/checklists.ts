import type { QuoteId } from '../georgia-quotes'
import type { HoaDoes } from './types'
import { BOARD_AGENDA_TEMPLATE, VIOLATION_LETTER_TEMPLATE, VIOLATION_NOTICE_CHECKLIST } from './checklists-b'
import { COLLECTIONS_NOTICE_TEMPLATE, MINUTES_TEMPLATE } from './checklists-c'
import { ANNOUNCEMENT_TEMPLATES } from './checklists-d'
import { ANNUAL_REPORT_CHECKLIST } from './checklists-e'
import { APPLY_CREDIT_CHECKLIST } from './checklists-f'
import { CONFLICT_DISCLOSURE_CHECKLIST } from './checklists-g'

export interface Checklist {
  slug: string
  title: string
  metaTitle: string
  description: string
  eyebrow: string
  intro: string[]
  /** The checklist, in the order a board works through it. */
  items: { text: string; detail?: string; /** Where the item comes from: a quoted statute section, or our plain-language suggestion. */ basis?: 'statute' | 'practice' }[]
  /** The statute text the checklist is built from. */
  quotes: QuoteId[]
  faqs: { q: string; a: string }[]
  related: string[]
  datePublished: string
  dateModified: string
  /** Pages outside /georgia: the page's own path. Default /georgia/<slug>. */
  path?: string
  /** Heading above the quotes. Default: "The statute behind this checklist". */
  quotesHeading?: string
  /** A fill-in letter, printed after the checklist. Blanks are [in brackets]; it quotes no law. */
  letter?: { heading: string; intro: string; lines: string[] }
  /** Emit HowTo JSON-LD built from the checklist items. */
  howTo?: boolean
  /** What HomeownerHub does about this: only what has shipped. */
  hoaDoes?: HoaDoes[]
}

export const FEE_NOTICE_CHECKLIST: Checklist = {
  slug: 'attorney-fee-notice-checklist',
  title: 'Georgia attorney’s-fee notice checklist',
  metaTitle: 'Free Georgia attorney’s fee notice checklist',
  description:
    'A free, printable checklist for the written notice Georgia associations must send before collecting attorney’s fees (SB 406 § 7). No sign-up.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this before any delinquent account is handed to an attorney or a fee is claimed. It follows the three requirements in SB 406 § 7, which applies to actions filed on or after July 1, 2026.',
    'It is a checklist, not a form letter, and not legal advice. Have your attorney review the notice you send.',
  ],
  items: [
    { text: 'The account is delinquent and the amounts are confirmed against the ledger.', detail: 'Check every fine and fee for an authorizing rule or document section.' },
    { text: 'Is this an emergency involving public safety or preserving the association’s property?', detail: 'If so, ask the attorney whether the emergency exception applies. Otherwise continue.' },
    { text: 'The initial notice is written and identifies each outstanding fine or delinquent fee.', detail: 'Name each item, its amount and the date it came due.' },
    { text: 'It is sent by certified mail or statutory overnight delivery.', detail: 'Ordinary mail does not match the statute’s words.' },
    { text: 'It is sent to the lot owner from the association or its agent.' },
    { text: 'The notice tells the owner they have 30 days from receipt to pay.', detail: 'Count from receipt, not from the day you mailed.' },
    { text: 'The proof of delivery is saved with the account.', detail: 'Receipt date, tracking number, who signed.' },
    { text: 'Day 30 after receipt is on the calendar. No attorney’s fees are claimed before then.' },
    { text: 'If the balance is still unpaid, an itemized list of the reasonable attorney’s fees claimed is prepared.', detail: 'Hours, rates and tasks, not a lump sum.' },
    { text: 'The attorney has reviewed the notice and the fee list.' },
  ],
  quotes: ['feeIntro', 'feeNotice1', 'feeNotice2', 'feeNotice3'],
  faqs: [
    { q: 'Is there a required form for the fee notice?', a: 'The statute text we quote sets the content and delivery method but does not supply a form. Your attorney may have one.' },
    { q: 'When does the rule start?', a: 'The Act says Section 7 applies to actions filed on or after July 1, 2026.' },
  ],
  related: ['attorney-fee-notice', 'foreclosure-threshold-2027', 'readiness', 'georgia-hoa-collections-notice'],
  datePublished: '2026-10-26',
  dateModified: '2026-10-26',
}

export const MEETING_NOTICE_CHECKLIST: Checklist = {
  slug: 'annual-meeting-notice-checklist',
  title: 'Georgia annual meeting notice checklist',
  metaTitle: 'Georgia HOA annual meeting notice checklist',
  description:
    'A free, printable checklist for noticing a Georgia HOA annual meeting: 21 days’ notice, what it must state, how to deliver it and the reports owed. No sign-up.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'This follows O.C.G.A. § 44-3-230(a) for associations under the Property Owners’ Association Act. Your bylaws may add requirements, so read them first.',
    'It is a checklist, not legal advice. Condominium associations are under a different statute and should check with their attorney.',
  ],
  items: [
    { text: 'The bylaws are open on the table. Anything stricter than the statute governs.' },
    { text: 'The meeting is set for a date at least 21 days after the notice goes out.', detail: 'Seven days is enough only for a meeting that is not annual or regularly scheduled.' },
    { text: 'The notice states the time and the place.' },
    { text: 'For a special meeting, the notice also states the purpose.' },
    { text: 'The owner list is current: every lot owner of record.' },
    { text: 'Each owner’s designated address is used. If none, the address of the lot.' },
    { text: 'Delivery is by one of the statute’s methods.', detail: 'Personal delivery, U.S. mail with postage prepaid, statutory overnight delivery, or electronic delivery under the Uniform Electronic Transactions Act.' },
    { text: 'The date and method of notice are recorded in the minutes or the meeting file.' },
    { text: 'Comprehensive reports of affairs, finances and budget projections are prepared for the meeting.' },
    { text: 'The meeting is held at least once a year.' },
  ],
  quotes: ['meetingAnnual', 'meetingNotice', 'meetingDelivery', 'meetingReports'],
  faqs: [
    { q: 'How much notice does a Georgia HOA annual meeting need?', a: 'At least 21 days in advance of any annual or regularly scheduled meeting, and at least seven days for any other meeting.' },
    { q: 'Can we email the notice?', a: 'The statute allows notice issued electronically in accordance with the Uniform Electronic Transactions Act. Check your bylaws and your owners’ consent practices with your attorney.' },
  ],
  related: ['owners-rights-2027', 'registration-2027', 'hoa-board-meeting-agenda', 'readiness', 'annual-meeting-quorum-proxies'],
  datePublished: '2026-10-26',
  dateModified: '2026-10-26',
}

export const CHECKLISTS: Readonly<Record<string, Checklist>> = {
  [FEE_NOTICE_CHECKLIST.slug]: FEE_NOTICE_CHECKLIST,
  [MEETING_NOTICE_CHECKLIST.slug]: MEETING_NOTICE_CHECKLIST,
  [VIOLATION_NOTICE_CHECKLIST.slug]: VIOLATION_NOTICE_CHECKLIST,
  [BOARD_AGENDA_TEMPLATE.slug]: BOARD_AGENDA_TEMPLATE,
  [VIOLATION_LETTER_TEMPLATE.slug]: VIOLATION_LETTER_TEMPLATE,
  [COLLECTIONS_NOTICE_TEMPLATE.slug]: COLLECTIONS_NOTICE_TEMPLATE,
  [MINUTES_TEMPLATE.slug]: MINUTES_TEMPLATE,
  [ANNOUNCEMENT_TEMPLATES.slug]: ANNOUNCEMENT_TEMPLATES,
  [ANNUAL_REPORT_CHECKLIST.slug]: ANNUAL_REPORT_CHECKLIST,
  [APPLY_CREDIT_CHECKLIST.slug]: APPLY_CREDIT_CHECKLIST,
  [CONFLICT_DISCLOSURE_CHECKLIST.slug]: CONFLICT_DISCLOSURE_CHECKLIST,
}
