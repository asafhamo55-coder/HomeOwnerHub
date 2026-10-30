// SEO batch 12, guide: what O.C.G.A. § 44-3-231 lets a Georgia property owners'
// association (and so its board) do. Statute text only through the quote bank;
// every pow* quote is § 44-3-231 from ga-ocga-44-3-art6-2026.txt.
//
// Fixture limits, stated on the page: the fixture holds the Property Owners'
// Association Act (Article 6). Condominiums are under a different article that
// the page does not describe. The page does not describe subsection (g), the
// tort-action rule, beyond saying it exists. Product claims are limited to
// shipped features: meeting minutes, the motion log, ARC deadlines and the
// budget against actual report.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const GA_BOARD_POWERS: Guide = {
  slug: 'georgia-hoa-board-powers-44-3-231',
  path: '/guides/georgia-hoa-board-powers-44-3-231',
  title: 'What a Georgia HOA board can do under O.C.G.A. § 44-3-231',
  metaTitle: 'Georgia HOA board powers under § 44-3-231',
  description:
    'What O.C.G.A. § 44-3-231 lets a Georgia property owners’ association do: hire, improve, approve changes, enforce, borrow and keep records. Quoted text.',
  eyebrow: 'Georgia · Governance',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Section 44-3-231 of the Georgia Property Owners’ Association Act lists powers the association has: to hire and dismiss agents, to improve the common area, to approve or refuse changes to a lot, and to enforce the governing documents.',
    'Every power in subsection (a) is subject to the association’s own instrument, which can prohibit or limit it.',
    'Subsection (f) says the board, acting through the officers, can exercise these powers without asking owners, unless the Act, Title 14, the instrument, the articles or the bylaws say otherwise.',
    'This is a plain-language guide to one section, not legal advice. Condominium associations are under a different article that this page does not cover.',
  ],
  sections: [
    {
      heading: 'The starting rule: the instrument comes first',
      body: [
        'Subsection (a) opens with a condition. The association has the listed powers except to the extent the instrument prohibits them, and subject to any restrictions and limitations the instrument sets. The instrument is the declaration and the other recorded documents that govern your community.',
        'In practice that means two reads. First read the statute to see that a power exists. Then read your declaration, articles and bylaws to see whether they take it away or put conditions on it, such as a spending cap above which owners must vote.',
      ],
      quotes: ['powIntro'],
    },
    {
      heading: 'Hire, retain, dismiss and replace',
      body: [
        'The association can employ, retain, dismiss and replace agents and employees, such as a management company, a bookkeeper or a landscaper.',
        'Under subsection (f) the board exercises the power, so record the vote in the minutes.',
      ],
      quotes: ['powEmploy'],
    },
    {
      heading: 'Improve the common area',
      body: [
        'The association can make, or have made, additional improvements on and as a part of the common area. The words "additional improvements" point at new work, such as a new playground or a gate, rather than routine upkeep.',
        'Whether the board can approve one alone depends on your instrument. The statute sets no spending cap, so read yours.',
      ],
      quotes: ['powImprove'],
    },
    {
      heading: 'Approve or refuse changes to a lot',
      body: [
        'The association can grant or withhold approval of an owner’s action that would change the exterior appearance of a lot, a structure on it, or any other part of the development. It can also elect or provide for an architectural control committee to make those calls.',
        'How long the committee has to answer, and what happens if it stays silent, comes from your declaration, not from this section.',
      ],
      quotes: ['powArc'],
    },
    {
      heading: 'Enforce the instrument',
      body: [
        'The association can enforce all lawful provisions of the instrument. The text names an action to recover sums due, an action for damages, an action for injunctive relief, and any other remedy at law or in equity.',
        'The injunctive-relief remedy comes with a condition: Code Section 44-3-223 and the instrument have to be complied with.',
      ],
      quotes: ['powEnforce'],
    },
    {
      heading: 'Own property, borrow and pledge',
      body: [
        'Subsection (b) lets the association grant and accept easements, leases and licenses, acquire and lease property in its own name, borrow money, and pledge or mortgage association property for any lawful purpose within its powers.',
        'The same subsection lets a third party rely in good faith on a certified resolution of the board as evidence of the association’s authority to act, so lenders usually ask for one.',
      ],
          },
    {
      heading: 'Amend the documents to match the law',
      body: [
        'Subsection (c) is narrow. The association can amend the instrument, the articles and the bylaws to conform to mandatory provisions of the Act or other applicable law, without a vote of the owners.',
        'Anything else needs the vote your documents require. See our guide to amending covenants.',
      ],
          },
    {
      heading: 'The board acts through the officers',
      body: [
        'Subsection (f) is the section most boards rely on. Unless the Act, Title 14, the instrument, the articles or the bylaws require otherwise, the association’s powers can be exercised by the board of directors, acting through the officers, with no further consent or action by the lot owners.',
        'Before a board acts alone on a large decision, check each of those five sources for a member-vote requirement.',
      ],
      quotes: ['powBoard'],
    },
    {
      heading: 'Duties: minutes and financial records',
      body: [
        'Subsection (d) is a duty, not a power. In addition to what the Act and the instrument impose, the association must keep detailed minutes of all meetings of the members and of the board, detailed and accurate financial records with itemized receipts and expenditures, and any other books and records required by law or needed to reflect its affairs.',
        'When an owner challenges a decision, the minutes and the ledger are the first documents anyone asks for.',
      ],
      quotes: ['powMinutes', 'powFinancial'],
    },
    {
      heading: 'Standing to sue and be sued',
      body: [
        'Subsection (h) gives the association the capacity, power and standing to bring or defend proceedings in its own name about matters relating to the lots or common area it must administer, repair or maintain.',
        'Subsection (g) addresses tort actions against the association. We do not summarize it here. Ask your attorney.',
      ],
          },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of Article 6, the Property Owners’ Association Act, and checked the quotes word for word against it. Confirm current text on the official Code before relying on a quote. We do not cover the condominium article.',
      ],
    },
  ],
  steps: [
    'Pull your declaration, articles and bylaws and mark every limit on spending, borrowing and leasing.',
    'For any large decision, check whether a member vote is required.',
    'Make the decision at a noticed board meeting and record the motion, the vote and the reason in the minutes.',
    'For a loan, lease or easement, have the board adopt a resolution, and have the secretary certify it for the other party.',
    'Keep the minutes, the ledger and the supporting documents in the permanent record.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA board act without a vote of the owners?',
      a: 'Subsection (f) says the powers may be exercised by the board, acting through the officers, without further consent of the lot owners, unless the Act, Title 14, the instrument, the articles or the bylaws expressly require otherwise.',
    },
    {
      q: 'Can the board borrow money?',
      a: 'Subsection (b) gives the association the power to borrow money and to pledge or mortgage its property for any lawful purpose within its powers. Check your instrument for limits.',
    },
    {
      q: 'Can the board approve or refuse an owner’s exterior change?',
      a: 'Yes, or it can appoint an architectural control committee to do so, under subsection (a)(3), subject to the instrument.',
    },
    {
      q: 'Does this apply to a condominium?',
      a: 'No. This page covers the Property Owners’ Association Act. Condominium associations are under a different article of the Code.',
    },
  ],
  related: ['georgia-hoa-amend-covenants-two-thirds', 'hoa-board-meeting-minutes', 'georgia-hoa-assessment-lien-rules', 'hoa-board-conflict-of-interest-disclosure-checklist'],
  hoaDoes: [
    {
      text: 'New meeting turns a pasted transcript into draft minutes. The board edits and approves them, and you can write the minutes yourself on the same screen if the AI is offline.',
      route: '/meetings/new',
      release: '2026-10-17-2100-user-guide',
    },
    {
      text: 'Meetings, then Motion log, lists every motion from your minutes with who moved, who seconded and the result, so the board’s decisions are searchable.',
      route: '/meetings/motions',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'ARC applications carry a decide-by deadline you set, and a chip turns red when one is overdue.',
      route: '/arc',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'The budget against actual report shows the year’s plan next to what was spent, from the ledger of receipts and expenditures.',
      route: '/accounting/reports/budget-vs-actual',
      release: '2026-10-18-0425-books-limits',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not draft board resolutions, certify them for a lender or tell you what your instrument allows. Your attorney does that part.',
}
