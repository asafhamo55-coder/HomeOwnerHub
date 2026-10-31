// SEO batch 20, Texas violation notice checklist.
// Statute text: Tex. Prop. Code § 209.006 from tcss-pr209-2026-excerpt.htm,
// through the txViol* and txHearRequest quotes (also used by the guide).
// Every statute-tagged item restates a quote. § 209.007 is not in the excerpt,
// so no item gives hearing timing, panel or procedure. Product claim: only the
// generic follow-up violation letters (release 2026-10-19-1404-follow-up-letters);
// Texas violation notices are not in STATE_COVERAGE and the page does not
// claim them.

import type { Checklist } from './checklists'

export const TX_VIOLATION_CHECKLIST: Checklist = {
  slug: 'texas-hoa-violation-notice-checklist',
  path: '/templates/texas-hoa-violation-notice-checklist',
  title: 'Texas HOA violation notice checklist',
  metaTitle: 'Texas HOA violation notice checklist',
  description:
    'A free, printable checklist for the notice a Texas HOA sends before a fine: contents, cure date, certified mail and hearing request (Tex. Prop. Code 209.006).',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this before a Texas property owners’ association sends a violation notice that could lead to a fine, a suspension of common area use or a charge for damage. Each item is tagged: statute means the quoted Tex. Prop. Code § 209.006 text calls for it, practice means it is our suggestion.',
    'Our guide to § 209.006 explains the section in prose. This page is the working list for one notice. It does not cover the hearing under § 209.007, which is not in the text we hold. This is not legal advice. Have your attorney review the notice before it goes out.',
  ],
  items: [
    { text: 'Name the rule the owner broke and where it appears in the declaration, bylaws or rules.', detail: 'Write the section number in your file. The notice has to describe the violation, so keep the rule in front of you.', basis: 'practice' },
    { text: 'Decide whether the violation is curable, uncurable or a threat to public health or safety.', detail: 'A violation that has happened and is not ongoing is uncurable. A threat to health or safety could materially affect the physical health or safety of an ordinary resident. Ask your attorney if it is unclear.', basis: 'statute' },
    { text: 'Check whether this owner was already sent a notice under § 209.006 for this violation in the last six months.', detail: 'Subsections (a) and (b) do not apply to a violation for which the owner was given notice and the opportunity to use the rights in the section in the preceding six months.', basis: 'statute' },
    { text: 'Describe the violation or the property damage in the notice: what, where and on what date.', detail: 'The notice must describe the violation or damage that is the basis for the fine, suspension or charge.', basis: 'statute' },
    { text: 'State any amount the owner owes the association.', detail: 'If there is none, say so, so the owner is not left guessing.', basis: 'statute' },
    { text: 'For a curable violation that is not a threat to health or safety, tell the owner they are entitled to a reasonable period to cure and avoid the fine or suspension.', basis: 'statute' },
    { text: 'Write the date by which the owner must cure.', detail: 'The date must give a reasonable period. The statute sets no number of days, so write down why this date is reasonable for this violation.', basis: 'statute' },
    { text: 'Tell the owner they may request a hearing under § 209.007 on or before the 30th day after the notice was mailed.', detail: 'Put the actual calendar date next to the 30-day sentence, counted from your mailing date.', basis: 'statute' },
    { text: 'Add the line about special rights under federal law, including the Servicemembers Civil Relief Act, for an owner on active military duty.', basis: 'statute' },
    { text: 'Address it to the owner at the last known address shown in the association records.', basis: 'statute' },
    { text: 'Send it by certified mail. Ask your attorney whether to send it as verified mail as well.', detail: 'Subsection (a) says certified mail and subsection (b)(4) says verified mail. Keep the receipt either way.', basis: 'statute' },
    { text: 'Record the mailing date and put the 30th day on the calendar the same day.', basis: 'practice' },
    { text: 'If the owner cures before the cure date, record it and do not assess a fine for that violation.', basis: 'statute' },
    { text: 'Before any hearing is scheduled, read § 209.007 with your attorney.', detail: 'It is not in the text we hold. Do not rely on this page for the hearing.', basis: 'practice' },
  ],
  letter: {
    heading: 'Violation notice worksheet (fill-in)',
    intro: 'Fill the blanks in brackets. This worksheet quotes no law and is not a notice to send as written. Have your attorney review it against § 209.006 and your governing documents.',
    lines: [
      '[Association name]',
      '',
      'Date mailed: [date]',
      'To: [owner name], [last known address in the association records]',
      'Sent by: [certified mail, tracking number]',
      '',
      'Property: [address]',
      'Rule: [document and section]',
      'Violation: [what was seen, where, date observed]',
      'Amount owed to the association: $[amount, or none]',
      '',
      'Curable and not a threat to health or safety: [yes / no]',
      'Cure by: [date], chosen because [reason]',
      'Hearing request deadline (30th day after mailing): [date]',
      'Military service paragraph included: [yes / no]',
      '',
      'Prior notice under this section in the last six months: [yes, date / no]',
      'Cured on: [date, or not cured]',
      'Fine assessed: [yes / no, only if not cured and your attorney has confirmed the steps]',
    ],
  },
  quotes: ['txViolNotice', 'txViolContents', 'txViolCure', 'txViolCureDate', 'txViolReasonable', 'txHearRequest', 'txViolMilitary', 'txViolMailed', 'txViolCured', 'txViolRepeat', 'txViolThreat', 'txViolUncurable'],
  quotesHeading: 'The Texas text behind these steps',
  faqs: [
    {
      q: 'What must a Texas HOA violation notice include?',
      a: 'A description of the violation and any amount owed, the owner’s right to a reasonable time to cure when that applies, the cure date, the right to request a hearing within 30 days of mailing, and a line on military service rights.',
    },
    {
      q: 'How is the notice sent?',
      a: 'Subsection (a) says by certified mail. Subsection (b)(4) says verified mail to the owner’s last known address in the association records. Ask your attorney.',
    },
    {
      q: 'What if the owner fixes the problem on time?',
      a: 'A fine may not be assessed for a violation cured before the cure period ends.',
    },
    {
      q: 'Does this checklist cover the hearing?',
      a: 'No. The hearing is governed by § 209.007, which is not in the text we hold.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute lists what the notice must say, not a form. This worksheet is our suggestion and is not legal advice.',
    },
  ],
  related: ['texas-hoa-violation-notice-and-hearing-209-006', 'texas-hoa-flag-display-rules', 'violation-notice-checklist', 'texas-hoa-third-party-collections-notice'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'On a violation, the board can draft a second notice, a hearing notice, a fine notice or a decision letter. Each draft waits in Approvals and nothing is sent to the homeowner until a board member approves it.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
  ],
}
