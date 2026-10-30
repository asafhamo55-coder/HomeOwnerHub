// SEO batch 13, guide: California internal dispute resolution (IDR), Civ. Code
// §§ 5900 to 5920 (Davis-Stirling Article 2). Statute text only through the
// quote bank; every caIdr* and caMeet* quote is from
// ca-civ-davis-stirling-2026.txt.
//
// Caveats from docs/research/2026-10-ca-rules-verification.md, kept on the page:
//  - IDR is reference only. The app encodes none of §§ 5900 to 5920 as a rule.
//    The only place it appears in the product is the California fine and
//    suspension letters, which cite § 5910 as the owner's route after a
//    disputed hearing. The page therefore claims no IDR tracking or drafting.
//  - California letters cite sections but quote no statute text.
//  - Section 5855(d) (quoted already as caIdr) is the link from a fine hearing.
//  - Alternative dispute resolution before an enforcement action is Article 3
//    (§ 5925 on). The page names it once, from § 5900(b), and does not describe it.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const CA_IDR: Guide = {
  slug: 'california-hoa-internal-dispute-resolution',
  path: '/guides/california-hoa-internal-dispute-resolution',
  state: 'CA',
  title: 'California HOA internal dispute resolution: what Civil Code 5900 to 5920 require',
  metaTitle: 'California HOA dispute resolution rules',
  description:
    'California Civil Code 5900 to 5920 make an association offer a fair way to settle member disputes. The minimum rules, the meet and confer fallback, quoted.',
  eyebrow: 'California · Disputes',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under the Davis-Stirling Act, a California association must provide a fair, reasonable and expeditious procedure for resolving a dispute with a member. Sections 5900 to 5920 call it internal dispute resolution, or IDR.',
    'Section 5910 sets the minimum: either side can start it in writing, the board must take part when a member does, there are prompt deadlines, and the member pays no fee.',
    'If the association has no procedure of its own, the meet and confer steps in § 5915 apply. A member may refuse to meet. The association may not.',
    'This is a plain-language guide to current statute text, not legal advice. Your attorney decides how it applies to your documents.',
  ],
  sections: [
    {
      heading: 'Which disputes it covers',
      body: [
        'The article applies to a dispute between the association and a member about their rights, duties or liabilities. The source can be the Davis-Stirling Act, the Nonprofit Mutual Benefit Corporation Law, or your governing documents.',
        'Section 5900 says this article adds to the separate rules on alternative dispute resolution before an enforcement action. This guide covers IDR only.',
      ],
      quotes: ['caIdrScope'],
    },
    {
      heading: 'The duty to offer a fair procedure',
      body: [
        'The association must have a procedure that is fair, reasonable and expeditious. In building it, the statute tells the association to make maximum, reasonable use of local programs that bring in a neutral third party, such as low-cost mediation.',
        'If the association does not provide a procedure that meets the standard, the statute supplies one. The meet and confer steps in § 5915 then apply, and they count as meeting the requirement.',
      ],
      quotes: ['caIdrFair'],
    },
    {
      heading: 'The minimum a procedure must have',
      body: [
        'Section 5910 lists what any IDR procedure must satisfy. You can offer more than this. You cannot offer less.',
        'Two points trip up small boards. The procedure must state the maximum time the association has to act on a request, so the written policy needs a number. And the member pays nothing to take part.',
      ],
      quotes: ['caIdrMinimum', 'caIdrInvoke', 'caIdrDeadlines', 'caIdrNoFee'],
    },
    {
      heading: 'Who can start it, and who has to show up',
      body: [
        'Either side can invoke the procedure, but the consequences differ. If a member invokes it, the association must take part. If the association invokes it, the member may decline. A member who does take part and loses has a right of appeal to the board.',
      ],
      quotes: ['caIdrMemberInvokes', 'caIdrAssocInvokes'],
    },
    {
      heading: 'A signed resolution binds',
      body: [
        'A signed written resolution that does not conflict with the law or the governing documents binds the association and can be enforced in court. Read any proposed settlement against the documents before the board signs.',
      ],
      quotes: ['caIdrBinding'],
    },
    {
      heading: 'The fallback: meet and confer',
      body: [
        'Section 5915 applies to an association that does not otherwise provide a fair procedure. Either side may ask the other to meet and confer, in writing. The asymmetry is deliberate: a member can say no, the association cannot.',
        'The board names one director to meet with the member. The two sides meet promptly, at a time and place that suits both, explain their positions and try in good faith to settle. A settlement is written down and signed by the member and the board’s designee.',
      ],
      quotes: ['caMeetRequest', 'caMeetRefuse', 'caMeetDirector', 'caMeetWritten'],
    },
    {
      heading: 'When a meet and confer agreement binds the board',
      body: [
        'An agreement reached this way is enforceable if both sides sign it, it does not conflict with the law or the documents, and it is either within the authority the board gave its designee or the board ratifies it. A director who goes beyond the board’s instructions should say the agreement needs ratification.',
      ],
      quotes: ['caMeetBinding'],
    },
    {
      heading: 'Tell members about it every year',
      body: [
        'The annual policy statement must describe the IDR process. If yours does not, add it at the next mailing. The same statement carries the fine schedule, so the two are usually updated together.',
      ],
      quotes: ['caIdrPolicy'],
    },
    {
      heading: 'Where it meets a fine hearing',
      body: [
        'Section 5855(d) says that when the board and the member do not agree after a discipline hearing, the member can ask for IDR under § 5910. Our guide to California fines and hearings covers the rest of that process.',
      ],
      quotes: ['caIdr'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of §§ 5900 to 5920 and the surrounding sections of the Act. We cannot tell you what your governing documents add or whether your current procedure meets § 5910. Have your attorney read it once.',
      ],
    },
  ],
  steps: [
    'Find your current IDR description in the annual policy statement. If there is none, that is the first gap to fix.',
    'Write the procedure: how a request is made in writing, who receives it, and the maximum time the board has to act.',
    'Check it against the § 5910 list, including the no-fee rule and the member’s right to decline when the association invokes it.',
    'Decide which director meets with members, and what authority the board gives that director to settle.',
    'Have your attorney review the procedure, then adopt it by board resolution.',
    'Describe it in the next annual policy statement.',
    'When a request arrives, log the date, answer within the stated time, and keep the signed outcome on file.',
  ],
  faqs: [
    {
      q: 'What is internal dispute resolution in a California HOA?',
      a: 'It is the association’s own procedure for settling a dispute with a member, required by Civil Code §§ 5900 to 5920. It must be fair, reasonable and expeditious, and it must meet the minimums in § 5910.',
    },
    {
      q: 'Can a member refuse to take part?',
      a: 'Yes, when the association is the one that invokes the procedure. If the member invokes it, the association must take part. Under the meet and confer fallback, a member may refuse a request and the association may not.',
    },
    {
      q: 'Can the association charge a fee for IDR?',
      a: 'No. Both § 5910 and § 5915 say a member shall not be charged a fee to participate.',
    },
    {
      q: 'What if our association has no written IDR procedure?',
      a: 'The statute says the § 5915 meet and confer procedure applies and satisfies the requirement. The annual policy statement should still describe the process the association uses.',
    },
  ],
  related: ['california-hoa-fine-hearing-and-penalty-rules', 'california-hoa-records-inspection-rules', 'fines-and-violation-hearings', 'violation-notice-checklist', 'california-hoa-pre-lien-notice-and-collections'],
  hoaDoes: [
    {
      text: 'In California, the fine and suspension letters mention the 14-day written decision and the owner’s right to ask for internal dispute resolution under § 5910 after a disputed hearing.',
      route: '/violations/[id]',
      release: '2026-10-19-1235-spanish-ca-rules',
    },
    {
      text: 'In California, a violation can only move to Fined once the hearing record shows the notice sent in time, the hearing held, and the outcome recorded. "Attorney advised" is the only override, and it is recorded.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not run an IDR request, track its deadlines or write your IDR procedure. California letters cite the section but do not quote the statute text.',
}
