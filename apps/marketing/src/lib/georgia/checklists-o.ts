// SEO batch 19, Florida fine cap and daily fine checklist.
// Statute text: Fla. Stat. § 720.305(2) from flsenate-ch720-2026.html, through
// the flFineCap, flFineDaily, flFineSuspend and flHearing* quotes. What the
// quoted text says about caps: $100 per violation unless the governing
// documents provide otherwise (flFineCap); for a continuing violation a fine
// may be levied for each day with a single notice and hearing, not exceeding
// $1,000 in the aggregate unless the governing documents provide otherwise,
// and a fine of less than $1,000 may not become a lien (flFineDaily). The
// quotes do not say how the two figures combine, and the page says so instead
// of choosing. Product claim: the Florida fine hearing record and the State
// law check on Fined (releases 2026-10-21-1130-budget-hearings-directors and
// 2026-10-20-1935-law-check-opening-balances). The app flags a fine over $100
// per violation; it does not check the $1,000 aggregate, and the page does not
// say it does. Chapter 720 only.

import type { Checklist } from './checklists'

export const FL_FINE_CAP_CHECKLIST: Checklist = {
  slug: 'florida-hoa-fine-cap-and-daily-fine-checklist',
  path: '/templates/florida-hoa-fine-cap-and-daily-fine-checklist',
  title: 'Florida HOA fine cap and daily fine checklist',
  metaTitle: 'Florida HOA fine cap and daily fine checklist',
  description:
    'A free, printable checklist for a Florida HOA board setting a fine: the per-violation figure, the daily fine and the hearing (Fla. Stat. 720.305).',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this before a Florida homeowners’ association board votes on a fine. It sorts the caps in Fla. Stat. § 720.305(2) from the hearing steps, so the amount and the process are checked in one pass. Each item is tagged: statute means the quoted text calls for it, practice means it is our suggestion.',
    'The quoted text gives two figures. A fine may not exceed $100 per violation unless the governing documents say otherwise. For a continuing violation, the board may fine for each day, with a single notice and hearing, up to $1,000 in the aggregate unless the governing documents say otherwise. The quotes do not explain how those two figures work together, so this page does not either. Ask your attorney. Chapter 720 only, not condominiums. This is not legal advice.',
  ],
  items: [
    { text: 'Read the violation and the rule it breaks. Confirm the rule is in the declaration, the bylaws or a reasonable rule of the association.', detail: 'The fine cap applies to failure to comply with any provision of the declaration, the bylaws or reasonable rules.', basis: 'statute' },
    { text: 'Check whether your governing documents set a fine amount that differs from the statute’s $100 per violation.', detail: 'The $100 figure applies unless otherwise provided in the governing documents. Write down which document and section you relied on.', basis: 'statute' },
    { text: 'Decide whether this is one violation or a continuing violation.', detail: 'Only a continuing violation can be fined for each day. Do not guess. Describe it in the notice the same way the board will describe it at the hearing.', basis: 'practice' },
    { text: 'For a continuing violation, add up the daily fines and compare the total with $1,000.', detail: 'The statute says the fine may not exceed $1,000 in the aggregate unless the governing documents say otherwise.', basis: 'statute' },
    { text: 'Use a single notice and opportunity for hearing for the whole run of days.', detail: 'The statute allows a daily fine with a single notice and opportunity for hearing.', basis: 'statute' },
    { text: 'Ask your attorney how the per-violation figure and the daily fine fit together in your documents.', detail: 'The quoted text does not say. Do not set the daily amount until you have an answer in writing.', basis: 'practice' },
    { text: 'Note whether the total will be less than $1,000.', detail: 'A fine of less than $1,000 may not become a lien against a parcel. Do not describe such a fine as secured by a lien in any letter.', basis: 'statute' },
    { text: 'Send at least 14 days’ written notice of the right to a hearing, to the owner’s designated mailing or e-mail address in the official records.', detail: 'Send it to any occupant, licensee or invitee who is to be fined as well. A fine cannot be imposed unless the notice goes first.', basis: 'statute' },
    { text: 'Put in the notice: the alleged violation, the action needed to cure it, and the hearing date, location and access information.', detail: 'The owner has the right to attend by telephone or other electronic means.', basis: 'statute' },
    { text: 'Appoint a committee of at least three members who are not officers, directors or employees, or their close relatives, and hold the hearing within 90 days after the notice.', basis: 'statute' },
    { text: 'Record the committee’s vote.', detail: 'If the committee by majority vote does not approve the fine, it cannot be imposed. The committee only confirms or rejects what the board levied. It does not set a different amount.', basis: 'statute' },
    { text: 'Send the committee’s written findings within 7 days after the hearing.', detail: 'Say what fines or suspensions were approved or rejected, and how the violation can be cured or the date by which a fine must be paid.', basis: 'statute' },
    { text: 'If the violation was cured before the hearing or as the notice said, drop the fine.', basis: 'statute' },
    { text: 'Set a payment date at least 30 days after the findings are delivered.', detail: 'This applies if the violation is not cured and the committee approves the fine by majority vote.', basis: 'statute' },
    { text: 'If the board also proposes a suspension, check it leaves the owner and tenants access to the parcel.', detail: 'A suspension may not prohibit vehicular and pedestrian ingress and egress, including the right to park.', basis: 'statute' },
    { text: 'File the notice, the vote, the findings and proof of delivery together in the violation record.', detail: 'Keep one copy for the owner’s file and one for the board.', basis: 'practice' },
  ],
  letter: {
    heading: 'Fine worksheet (fill-in)',
    intro: 'Fill the blanks in brackets before the board votes. This worksheet quotes no law and is a starting point only. Have your attorney review it against your governing documents.',
    lines: [
      '[Association name]',
      '[Date]',
      '',
      'Parcel: [address]',
      'Owner: [name]',
      'Violation: [short description]',
      'Rule and where it appears: [document, section]',
      '',
      'Single violation or continuing violation: [one / continuing]',
      'Fine amount per violation in our governing documents, if different from the statute: $[amount], [document, section]',
      'Daily fine proposed, if any: $[amount] per day, starting [date]',
      'Total fine to date: $[amount]',
      'Aggregate limit in our governing documents, if different from the statute: $[amount], [document, section]',
      'Attorney confirmed the amounts on: [date]',
      '',
      'Hearing notice sent: [date, method]',
      'Hearing date: [date]',
      'Committee members (three, not on the board): [names]',
      'Committee vote: [confirm / reject]',
      'Written findings sent: [date, within 7 days]',
      'Payment due date: [date, at least 30 days after findings]',
    ],
  },
  quotes: ['flFineCap', 'flFineDaily', 'flFineSuspend', 'flHearingNotice', 'flHearingContents', 'flHearingPanel', 'flHearingVote', 'flHearingFindings', 'flHearingCured', 'flHearingPayDate'],
  quotesHeading: 'The Florida text behind these steps',
  faqs: [
    {
      q: 'How much can a Florida HOA fine per violation?',
      a: 'Under § 720.305(2), a fine may not exceed $100 per violation unless otherwise provided in the governing documents.',
    },
    {
      q: 'Can a Florida HOA fine for each day of a violation?',
      a: 'The statute allows a fine for each day of a continuing violation, with a single notice and opportunity for hearing. It may not exceed $1,000 in the aggregate unless the governing documents say otherwise.',
    },
    {
      q: 'Can a small fine become a lien?',
      a: 'The statute says a fine of less than $1,000 may not become a lien against a parcel.',
    },
    {
      q: 'Does the board need a hearing before every fine?',
      a: 'Yes. A fine cannot be imposed unless the owner first gets at least 14 days’ written notice of the right to a hearing, and a committee of at least three people who are not on the board must confirm it by majority vote.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute asks for the notice and the hearing, not for a form from the association. This worksheet is our suggestion and is not legal advice.',
    },
  ],
  related: ['florida-hoa-fine-hearing-committee', 'florida-hoa-fine-hearing-notice', 'florida-hoa-assessment-lien-and-foreclosure-timeline', 'violation-notice-checklist'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'In Florida, a violation can only move to Fined once the hearing record shows the notice sent in time, the hearing held, and the outcome recorded. The panel needs at least three people who are not on the board.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
    {
      text: 'A State law check panel appears when a violation moves to Fined. For Florida it lists a fine over $100 per violation (unless your documents allow more), and you can only go ahead by recording a reason.',
      route: '/violations/[id]',
      release: '2026-10-20-1935-law-check-opening-balances',
    },
  ],
}
