/**
 * BL-160: the Georgia Secretary of State's PROPOSED Chapter 590-13 rules
 * (owners' association registration and complaint process). Pure data and
 * pure functions, client-safe.
 *
 * THE RULE. These rules are not in force. Nothing here is a duty today, and
 * the card says so. Every quote is copied word for word from
 * scripts/fixtures/state-law/ga-sos-590-13-proposed-2026.txt, and
 * proposed-ga.test.ts checks each one inside the rule block its citation
 * names. The summaries are ours and never put in quotation marks. Dates are
 * the ones the Secretary of State's eight notices print, also checked there.
 */

export const GA_PROPOSED_FIXTURE = 'ga-sos-590-13-proposed-2026.txt'

/** Last day to send written comments (the notices: "Monday, November 2, 2026"). */
export const GA_PROPOSED_COMMENT_DEADLINE = '2026-11-02'
/** The notices' own sentence, checked against the fixture. */
export const GA_PROPOSED_COMMENT_SENTENCE = 'Written comments must be received by Monday, November 2, 2026.'
export const GA_PROPOSED_COMMENT_EMAIL = 'hoa@sos.ga.gov'
/** "Proposed Adoption Date" in every notice. */
export const GA_PROPOSED_ADOPTION_LABEL = 'Friday, January 1, 2027'
export const GA_PROPOSED_ADOPTION_LINE = `Proposed Adoption Date: ${GA_PROPOSED_ADOPTION_LABEL}.`
export const GA_PROPOSED_SOURCE_URL = 'https://sos.ga.gov/page/hoa-rules'

export interface ProposedQuote {
  /** As printed under the quote. */
  cite: string
  /** The rule block in the fixture the quote sits in, e.g. '590-13-3-.01'. */
  rule: string
  /** Word for word from that block (whitespace-insensitive). */
  quote: string
}

export interface ProposedHearing {
  /** Rules the notice covers at this time. */
  rules: string[]
  /** As the notice prints it. */
  when: string
}

export interface ProposedPart {
  /** '590-13-1' */
  id: string
  title: string
  /** Rule numbers, as the notices print them. */
  rules: string
  /** Our words, plain language. Not a quote. */
  summary: string
  quotes: ProposedQuote[]
  hearings: ProposedHearing[]
}

export const GA_PROPOSED_PARTS: readonly ProposedPart[] = [
  {
    id: '590-13-1',
    title: 'General provisions',
    rules: '590-13-1-.01, 590-13-1-.02',
    summary:
      'Definitions used by every other part, such as business day, filing fee, agent and registration, and a rule that lets the division director act for the Secretary of State.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-1-.01(20)',
        rule: '590-13-1-.01',
        quote:
          '"Registration Statement" or "Registration" means a functional document which, when active, permits Owners\' Associations to complete all acts permitted under the Act.',
      },
    ],
    hearings: [
      { rules: ['590-13-1-.01'], when: '9:00 A.M. EST, Wednesday, November 4, 2026' },
      { rules: ['590-13-1-.02'], when: '10:00 A.M. EST, Wednesday, November 4, 2026' },
    ],
  },
  {
    id: '590-13-2',
    title: 'Records',
    rules: '590-13-2-.01, 590-13-2-.02, 590-13-2-.03',
    summary:
      'How the State keeps its files, and what an association must keep and show owners. Owner requests are in writing, with set days to acknowledge and to produce, and charges limited to actual, reasonable and documented costs.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-2-.03(3)',
        rule: '590-13-2-.03',
        quote:
          "Requests for records or documents maintained by an Owners' Association pursuant to the Act shall be acknowledged in writing within five (5) business days and made available to a requesting Owner within ten (10) days of acknowledgement of the Owner's written request.",
      },
    ],
    hearings: [
      { rules: ['590-13-2-.01'], when: '10:00 A.M. EST, Wednesday, November 4, 2026' },
      { rules: ['590-13-2-.02', '590-13-2-.03'], when: '1:30 P.M. EST, Wednesday, November 4, 2026' },
    ],
  },
  {
    id: '590-13-3',
    title: 'Registrations',
    rules: '590-13-3-.01 to 590-13-3-.04',
    summary:
      'How an association applies, amends, withdraws and renews its registration. The notice states a $100 filing fee for each initial registration and each renewal. A renewal may be filed in the 90 days before the registration expires and carries a year-end financial statement.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-3-.01(1)(a)',
        rule: '590-13-3-.01',
        quote: 'Temporary registrations will be effective for thirty (30) days and may be extended at the discretion of the Director.',
      },
      {
        cite: 'Proposed Rule 590-13-3-.01, synopsis of economic impact',
        rule: '590-13-3-.01',
        quote: 'The filing fee for each initial registration statement is $100.00.',
      },
    ],
    hearings: [{ rules: ['590-13-3-.01', '590-13-3-.02', '590-13-3-.03', '590-13-3-.04'], when: '11:00 A.M. EST, Wednesday, November 4, 2026' }],
  },
  {
    id: '590-13-4',
    title: 'Enforcement',
    rules: '590-13-4-.01',
    summary:
      'The Secretary of State may investigate associations and their agents, keep examinations and audits of financial records out of public view unless releasing them is in the public interest, refer cases to other regulators, and appoint auditors.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-4-.01(1)',
        rule: '590-13-4-.01',
        quote:
          "The Secretary of State or designee may investigate the actions of any Owners' Association or Agent acting on behalf of an Owners' Association",
      },
    ],
    hearings: [{ rules: ['590-13-4-.01'], when: '10:00 A.M. EST, Wednesday, November 4, 2026' }],
  },
  {
    id: '590-13-5',
    title: 'Hearings on Secretary of State orders',
    rules: '590-13-5-.01 to 590-13-5-.09',
    summary:
      'The procedure when an association or owner asks for a hearing to challenge an order: who presides, notices, filings, time limits, subpoenas, who may represent a party, and a final order within 30 days.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-5-.01(1)',
        rule: '590-13-5-.01',
        quote:
          'Hearings, if requested, will be conducted before the Secretary of State, the Director, or a Referee appointed by the Secretary of State or Director.',
      },
    ],
    hearings: [{ rules: ['590-13-5-.01 to .09'], when: '1:00 P.M. EST, Thursday, November 5, 2026' }],
  },
  {
    id: '590-13-6',
    title: 'Complaints about an association',
    rules: '590-13-6-.01 to 590-13-6-.06',
    summary:
      'How an owner or resident files a complaint with the Secretary of State, when collection of the charges in it is paused, how a hearing officer is assigned and a hearing runs, and when written findings are due.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-6-.03(2)(a)',
        rule: '590-13-6-.03',
        quote: "Stays will become effective once the complaint is documented in writing and filed with the Secretary of State's Office.",
      },
    ],
    hearings: [{ rules: ['590-13-6-.01 to .06'], when: '3:00 P.M. EST, Thursday, November 5, 2026' }],
  },
  {
    id: '590-13-7',
    title: "Owners' bill of rights",
    rules: '590-13-7-.01, 590-13-7-.02',
    summary:
      'Meeting notices and open meetings, and what acting in good faith means for a board member: honest statements, written notice of charges, separate accounting of funds, consistent enforcement, conflict disclosure, and handing records and accounts to the next board.',
    quotes: [
      {
        cite: 'Proposed Rule 590-13-7-.01(1)(a)',
        rule: '590-13-7-.01',
        quote:
          "The Board of an Owners' Association notifies the Owners of the place, date, and time of each annual, regular, and special meeting no fewer than seven (7) days nor more than sixty (60) days before the meeting date;",
      },
    ],
    hearings: [
      { rules: ['590-13-7-.01'], when: '9:00 A.M. EST, Thursday, November 5, 2026' },
      { rules: ['590-13-7-.02'], when: '10:00 A.M. EST, Thursday, November 5, 2026' },
    ],
  },
]

export const ALL_PROPOSED_QUOTES: readonly ProposedQuote[] = GA_PROPOSED_PARTS.flatMap((p) => p.quotes)

/**
 * The comment line shows through the deadline day and is hidden after it.
 * `today` is the association's local YYYY-MM-DD.
 */
export function proposedCommentOpen(today: string): boolean {
  return today <= GA_PROPOSED_COMMENT_DEADLINE
}
