// SEO batch 20: Texas violation notice and hearing request.
// Statute text only through the quote bank (txViol*, txHearRequest), checked
// word for word by georgia-guides.test.ts against tcss-pr209-2026-excerpt.htm.
// The excerpt holds § 209.006 whole. It does NOT hold § 209.007, which § 209.006
// only cites, so this page says nothing about the hearing itself: not its
// notice timing, who sits on it, or what happens after. Subsection (a) names
// certified mail and (b)(4) says verified mail; the page says so and does not
// reconcile them.
// Product claim: the generic follow-up violation letters on a violation
// (release 2026-10-19-1404-follow-up-letters). STATE_COVERAGE lists no Texas
// violation-letter support (Texas is the resale certificate and collections
// letters), so the page says Texas violation notices are not built in.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const TX_VIOLATION_NOTICE: Guide = {
  slug: 'texas-hoa-violation-notice-and-hearing-209-006',
  path: '/guides/texas-hoa-violation-notice-and-hearing-209-006',
  state: 'TX',
  title: 'Texas HOA violation notice and hearing request: Property Code § 209.006',
  metaTitle: 'Texas HOA violation notice and hearing',
  description:
    'What Tex. Prop. Code 209.006 requires in a Texas HOA violation notice before a fine: certified mail, a cure date and a hearing request.',
  eyebrow: 'Texas · Violations',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 209.006 of the Texas Property Code sets a notice that comes first. Before a property owners’ association fines an owner, suspends use of a common area, charges for property damage, sues (with exceptions) or reports a delinquency to a credit reporting service, it must give the owner written notice by certified mail.',
    'The notice has required contents: what the violation is, any amount owed, a reasonable time to cure when the violation can be cured, the owner’s right to ask for a hearing within 30 days of mailing, and a line about military service. A violation cured in time cannot be fined.',
    'The hearing itself is governed by § 209.007. We do not hold that section, so this page does not describe the hearing. Read it with your attorney.',
    'This is a plain-language guide to the text we hold, not legal advice. Your attorney decides how it applies to your association.',
  ],
  sections: [
    {
      heading: 'When the notice is required',
      body: [
        'The notice comes before the enforcement step, not after it. The list is long: a suspension of common area rights, most lawsuits, a charge for property damage, a fine, or a report to a credit reporting service. A suit to collect a regular or special assessment, or to foreclose under the association’s lien, is carved out of the lawsuit item.',
      ],
      quotes: ['txViolNotice'],
    },
    {
      heading: 'What the notice must say',
      body: [
        'Start with the facts. The notice must describe the violation or the damage and state any amount the owner owes the association. A line such as "you are in violation of the rules" does not do that. Say what was seen, where and on what date, and name the rule.',
      ],
      quotes: ['txViolContents'],
    },
    {
      heading: 'The cure period',
      body: [
        'If the violation is of a curable nature and does not threaten public health or safety, the owner is entitled to a reasonable period to cure it and avoid the fine or suspension. The notice must say so, and it must give the date by which the owner has to cure.',
        'The statute sets no number of days, only a reasonable period. Write down why you chose the date.',
      ],
      quotes: ['txViolCure', 'txViolCureDate'],
    },
    {
      heading: 'Curable and uncurable violations',
      body: [
        'The statute defines both terms and gives examples of each. A violation that has already happened and is not an ongoing condition is uncurable, and not repeating it does not count as a cure. A threat to public health or safety is a separate category: one that could materially affect the physical health or safety of an ordinary resident.',
        'The statute also lists examples of each kind. If a violation fits neither list, the definitions decide it, and that is a question for your attorney.',
      ],
      quotes: ['txViolUncurable', 'txViolThreat'],
    },
    {
      heading: 'The right to ask for a hearing',
      body: [
        'The notice must tell the owner that they may request a hearing under § 209.007 on or before the 30th day after the date the notice was mailed. The count starts at mailing, so keep the mailing record with the notice.',
        'Section 209.007 is not in the text we hold. We do not describe when the hearing must be held, who attends or what notice of it goes out. Take those questions to your attorney.',
      ],
      quotes: ['txHearRequest'],
    },
    {
      heading: 'Military service',
      body: [
        'The notice must also say the owner may have special rights or relief under federal law if serving on active military duty.',
      ],
      quotes: ['txViolMilitary'],
    },
    {
      heading: 'Certified mail, verified mail and the address',
      body: [
        'Subsection (a) says the notice is given by certified mail. Subsection (b)(4) says it must be sent by verified mail to the owner’s last known address as shown on the association records. Both words appear in the text and we do not reconcile them. Ask your attorney what your association will use, and keep the receipt.',
      ],
      quotes: ['txViolMailed'],
    },
    {
      heading: 'When a fine is off the table',
      body: [
        'If the owner cures the violation before the cure period ends, a fine may not be assessed for it. That is why the cure date matters.',
        'There is also an exception for repeat notices. Subsections (a) and (b) do not apply to a violation if the owner was already given notice under this section, with the chance to use the rights it describes, in the preceding six months.',
      ],
      quotes: ['txViolCured', 'txViolRepeat'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold § 209.006 and nothing from § 209.007, so this page does not cover the hearing, the board’s decision or any fine amount. The text we hold gives no number of days for a reasonable cure period. Check the current statute before the board relies on a date.',
      ],
    },
  ],
  steps: [
    'Confirm the rule in your declaration, bylaws or rules that the owner broke, and decide whether the violation is curable.',
    'Decide whether the violation threatens public health or safety. If it might, ask your attorney before you send anything.',
    'Draft the notice: the violation, any amount owed, a reasonable cure date (when curable), the 30-day hearing request line and the military service line.',
    'Send it by certified mail to the owner’s last known address in your records, and keep the receipt and the mailing date.',
    'Calendar the 30th day after mailing. Read § 209.007 with your attorney before any hearing is scheduled.',
    'If the owner cures by the date, record it and do not assess a fine.',
  ],
  faqs: [
    {
      q: 'Does a Texas HOA have to send a notice before it fines an owner?',
      a: 'Yes. Section 209.006(a) requires written notice by certified mail before the association levies a fine for a violation of the restrictions, bylaws or rules.',
    },
    {
      q: 'How long does the owner have to ask for a hearing?',
      a: 'The notice must say the owner may request a hearing on or before the 30th day after the date the notice was mailed.',
    },
    {
      q: 'How long must the cure period be?',
      a: 'The statute gives no number of days. The date in the notice must provide a reasonable period to cure, for a violation that can be cured and is not a threat to health or safety.',
    },
    {
      q: 'Can the board fine an owner who fixed the problem?',
      a: 'No. If the owner cures the violation before the cure period ends, a fine may not be assessed for it.',
    },
    {
      q: 'Does the notice have to mention military service?',
      a: 'Yes. The notice must say the owner may have special rights or relief under federal law, including the Servicemembers Civil Relief Act, if serving on active military duty.',
    },
  ],
  related: [
    'texas-hoa-violation-notice-checklist',
    'texas-hoa-flag-display-rules',
    'texas-hoa-third-party-collections-notice',
    'ai-hoa-violation-letters-board-approval',
    'violation-notice-checklist',
  ],
  hoaDoes: [
    {
      text: 'On a violation, the board can draft a second notice, a hearing notice, a fine notice or a decision letter. Each draft waits in Approvals and nothing is sent to the homeowner until a board member approves it.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
  ],
  hoaDoesNot:
    'Texas violation notices are not built into HomeownerHub. Texas coverage today is the resale certificate and collections letters. HomeownerHub does not write a § 209.006 notice to the statute’s wording, send or track certified mail, count the 30 days or keep a Texas hearing record. Use your attorney’s form and keep your own calendar.',
}
