// SEO batch 16, two state templates.
// California: the written decision after a fine hearing. Statute text: Civ.
// Code §§ 5850, 5855 from ca-civ-davis-stirling-2026.txt, through the existing
// ca* quotes. Caveats from docs/research/2026-10-ca-rules-verification.md: the
// 10-day notice, the 14-day decision and the cure rules are as verified there;
// the fill-in quotes no law. Product claim: the Fined gate for California
// (release 2026-10-21-1130-budget-hearings-directors) and nothing about drafting
// the decision letter.
// Florida: a board's response checklist for a written records request. Statute
// text: Fla. Stat. § 720.303(5) from flsenate-ch720-2026.html, through the
// flRec* quotes. Records request tracking in the app is Georgia's five-business-day
// rule, and the page says so. Chapter 720 only.

import type { Checklist } from './checklists'

export const CA_HEARING_RESOLUTION: Checklist = {
  slug: 'california-hoa-hearing-resolution-letter',
  path: '/templates/california-hoa-hearing-resolution-letter',
  title: 'California HOA hearing resolution and decision letter',
  metaTitle: 'California HOA hearing decision letter',
  description:
    'A free, printable checklist and fill-in written decision after a California HOA fine hearing: cure, agreement, the 14-day notice and dispute resolution.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this after a California board has held the meeting at which it considered discipline for a member. It covers what happens next: whether the member cured, whether the two sides agree, and the written decision the member must receive. The guide to California fines explains the whole rule. This page is the working list for the days after the hearing.',
    'Each item is tagged: statute means the quoted Civil Code text calls for it, practice means it is our suggestion. The quoted text is Davis-Stirling §§ 5850 and 5855. This is not legal advice, and your attorney should read the final decision before it goes out.',
  ],
  items: [
    { text: 'Before anything is decided, check the meeting was noticed in writing at least 10 days ahead.', detail: 'Delivery is personal or individual delivery under § 4040. If the notice was late or missing a required item, stop and ask your attorney.', basis: 'statute' },
    { text: 'Check the penalty is on the schedule the board gave members in the annual policy statement.', basis: 'statute' },
    { text: 'Check the amount against the cap.', detail: 'It cannot exceed the lesser of the schedule amount in effect at the time of the violation and $100 per violation. Above $100 needs a written finding of an adverse health or safety impact, made in a board meeting open to the members.', basis: 'statute' },
    { text: 'Record whether the member cured the violation before the meeting.', detail: 'If the member cured before the meeting, the board does not impose discipline.', basis: 'statute' },
    { text: 'If the cure would take longer than the time between the notice and the meeting, record whether the member gave a financial commitment to cure.', detail: 'A financial commitment also bars discipline. Write down what the member committed to and the date.', basis: 'statute' },
    { text: 'Record that the member was told of the right to attend and address the board, and whether the member asked for executive session.', detail: 'If the member asks, the board meets in executive session.', basis: 'statute' },
    { text: 'If the board and the member are in agreement after the meeting, draft a written resolution.', detail: 'Write down what was agreed, who does what and by when.', basis: 'statute' },
    { text: 'If they do not agree, tell the member in writing that they can ask for internal dispute resolution.', detail: 'The right is in § 5855(d), through § 5910. The member makes the request.', basis: 'statute' },
    { text: 'If the board imposes discipline, write the decision: the violation, what was imposed, the amount if any, and the date of the vote.', detail: 'Take the wording from the minutes of the meeting.', basis: 'practice' },
    { text: 'Send the decision by personal delivery or individual delivery within 14 days following the action.', detail: 'Count from the date the board acted, and put the last day on the calendar.', basis: 'statute' },
    { text: 'Do not add a late charge or interest to the penalty.', basis: 'statute' },
    { text: 'Do not treat the discipline as in force until each step above is done.', detail: 'The statute says discipline is not effective against a member unless the board fulfills the section.', basis: 'statute' },
    { text: 'Keep the notice, proof of delivery, minutes, any cure or commitment, and the decision together in one file.', basis: 'practice' },
    { text: 'Have your attorney read the decision, especially where a fine is above $100 or the member disputes it.', basis: 'practice' },
  ],
  letter: {
    heading: 'Notice of board decision after a disciplinary hearing (fill-in)',
    intro: 'Fill the blanks in brackets. This form quotes no law and is a starting point only. Send it by personal delivery or individual delivery, and have your attorney review it against your governing documents.',
    lines: [
      '[Association name]',
      '[Date of this notice]',
      '',
      'To: [member name]',
      'Property: [address or lot]',
      '',
      'NOTICE OF BOARD DECISION',
      '',
      'On [date of the meeting], the board of directors met to consider [the alleged violation, in plain words, or the damage to the common area]. You were given written notice of the meeting on [date notice delivered] by [personal delivery / individual delivery].',
      '',
      'Cure: [You did not cure before the meeting. / You cured on [date]. / You gave a financial commitment to cure on [date].]',
      'Decision: [Describe what the board decided. If discipline was imposed, state it: fine of $[amount], suspension of [privilege] for [period], or charge of $[amount] for damage to [common area item].]',
      'Vote: [number] for, [number] against, [number] abstaining. Recorded in the minutes of [meeting date].',
      '',
      'If you disagree with this decision, you may ask for internal dispute resolution with the association. To ask, contact [name, office, address, e-mail] in writing.',
      '',
      'Questions: [name, office, phone, e-mail]',
      '',
      'Delivered on [date] by [personal delivery / individual delivery]. Board action date: [date]. Last day to deliver this notice: [date, 14 days after the action].',
    ],
  },
  quotes: ['caSchedule', 'caCap1', 'caCap2', 'caNotice', 'caNoticeContents', 'caCure1', 'caCure2', 'caAgreement', 'caIdr', 'caDecision', 'caNoLate', 'caEffective'],
  quotesHeading: 'The California text behind these fields',
  faqs: [
    {
      q: 'How soon must a California HOA send the decision after a fine hearing?',
      a: 'If the board imposes discipline, the member must get written notice of the decision, by personal delivery or individual delivery, within 14 days following the action. See § 5855(f) above.',
    },
    {
      q: 'What if the member fixes the problem before the hearing?',
      a: 'The statute says the board does not impose discipline if the member cures the violation before the meeting. A financial commitment to cure covers a cure that takes longer than the notice period.',
    },
    {
      q: 'What if the board and the member agree afterward?',
      a: 'The board drafts a written resolution. The statute does not print a form for it, so write down what was agreed and keep it with the file.',
    },
    {
      q: 'What if they cannot agree?',
      a: 'The member has the opportunity to request internal dispute resolution under § 5910.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute sets what the notice of decision must do and how it must be delivered, and does not print a form. This template is our suggestion and is not legal advice.',
    },
  ],
  related: ['california-hoa-fine-hearing-and-penalty-rules', 'california-hoa-internal-dispute-resolution', 'florida-hoa-fine-hearing-notice', 'hoa-board-meeting-minutes', 'violation-notice-checklist'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'In California, a violation can only move to Fined once the hearing record shows the notice sent in time, the hearing held, and the outcome recorded. "Attorney advised" is the only override, and it is recorded. HomeownerHub does not write the decision letter for you.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
  ],
}

export const FL_RECORDS_RESPONSE: Checklist = {
  slug: 'florida-hoa-records-request-response-checklist',
  path: '/templates/florida-hoa-records-request-response-checklist',
  title: 'Florida HOA records request response checklist',
  metaTitle: 'Florida HOA records response checklist',
  description:
    'A free, printable checklist and fill-in reply for a board that has received a written official records request in a Florida HOA, from Fla. Stat. 720.303(5).',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this the day a written records request lands on a Florida homeowners’ association. It is a working list for the board or manager who has to answer, in the order the work happens. Our guide to Florida official records explains the rule and what an owner can claim.',
    'Each item is tagged: statute means the quoted Fla. Stat. § 720.303(5) text calls for it, practice means it is our suggestion. Chapter 720 only, not condominiums. HomeownerHub’s records request tracking runs on Georgia’s five-business-day rule and does not apply Florida’s 10-business-day deadline, so keep your own log and calendar. This is not legal advice.',
  ],
  items: [
    { text: 'Write down the date and time the request arrived and who received it.', detail: 'The clock runs from receipt by the board or its designee of a written request.', basis: 'statute' },
    { text: 'Check the request is in writing. If it came by certified mail, return receipt requested, keep the receipt.', detail: 'A missed deadline on a certified-mail request creates a rebuttable presumption that the association willfully failed to comply.', basis: 'statute' },
    { text: 'Count 10 business days from receipt and put the date on the board calendar.', detail: 'That is when the records must be available for inspection or photocopying.', basis: 'statute' },
    { text: 'Do not ask the owner why they want the records.', detail: 'The board may adopt reasonable written rules on frequency, time, location, notice, records and manner, but may not require a purpose or limit inspection to less than one 8-hour business day per month.', basis: 'statute' },
    { text: 'Decide how you will provide access: in the community, online, or on a screen with printing on request.', detail: 'The statute allows any of these.', basis: 'statute' },
    { text: 'Offer the owner a time and place within 45 miles of the community or within the county.', basis: 'statute' },
    { text: 'Tell the owner they may photograph or scan the records on their own device, at no fee.', detail: 'That includes a smartphone, tablet or portable scanner, used by the member or an authorized representative.', basis: 'statute' },
    { text: 'Identify which records the request covers, and pull them.', basis: 'practice' },
    { text: 'Have the person who holds the files remove records the statute puts out of reach.', detail: 'Personal identifying information such as phone numbers, email addresses and emergency contacts is protected. The owner’s name, parcel designation, mailing address and property address are not.', basis: 'statute' },
    { text: 'If the owner wants copies from you, work out the fee before you copy and send an itemized note.', detail: 'Check the 25-cent-per-page ceiling on your own copier, the half-hour threshold and the $20-per-hour cap on staff time. No staff time can be charged for 25 pages or fewer.', basis: 'statute' },
    { text: 'Reply to the owner in writing before the deadline, even if the records are not all ready.', detail: 'Use the fill-in below. Say what is available, when and where.', basis: 'practice' },
    { text: 'Record what was shown or copied, to whom and when, and keep the owner’s request with it.', basis: 'practice' },
    { text: 'If the request is stuck, or a director wants to refuse it, call your attorney before the deadline passes.', detail: 'A director, board member or manager who knowingly, willfully and repeatedly violates the access rule with intent to harm the association or its members commits a second-degree misdemeanor.', basis: 'statute' },
  ],
  letter: {
    heading: 'Reply to a written request to inspect official records (fill-in)',
    intro: 'Fill the blanks in brackets. This form quotes no law and is a starting point only. Send it before the deadline and have your attorney review it if any record is being withheld.',
    lines: [
      '[Association name]',
      '[Date of reply]',
      '',
      'To: [owner name]',
      'Property: [address or parcel]',
      '',
      'RE: Your written request of [date received] to inspect official records',
      '',
      'We received your written request on [date received]. The records you asked for are available as follows.',
      '',
      'Records available: [list the records]',
      'How: [in the community at [place] / online at [address] / on a screen, with printing on request]',
      'When: [date and time], which is within the 10 business days after we received your request.',
      'Where: [place], within [45 miles of the community / the county].',
      'You may photograph or scan the records with your own device at no charge.',
      '',
      'Copies from the association: [no charge / $[amount], itemized as [pages x rate; staff time, if any]]',
      '',
      'Records not provided: [none / description of the category and the reason, as your attorney advises]',
      '',
      'Questions: [name, office, phone, e-mail]',
    ],
  },
  quotes: ['flRecInspect', 'flRecPresumption', 'flRecRules', 'flRecElectronic', 'flRecDevice', 'flRecPersonal', 'flRecFees', 'flRecCriminal'],
  quotesHeading: 'The Florida text behind these steps',
  faqs: [
    {
      q: 'How long does a Florida HOA have to respond to a records request?',
      a: 'The records must be made available within 10 business days after receipt by the board or its designee of a written request from the parcel owner, under § 720.303(5)(a).',
    },
    {
      q: 'Can the association put the records online instead of a paper copy?',
      a: 'Yes. The statute says it may comply by having a copy available in the community, by making the records available electronically via the Internet, or by letting them be viewed in electronic format on a computer screen and printed on request.',
    },
    {
      q: 'Can the board ask why the owner wants the records?',
      a: 'No. The board may adopt reasonable written rules but may not require a proper purpose or any stated reason.',
    },
    {
      q: 'Can a director be personally liable?',
      a: 'The statute makes it a second-degree misdemeanor for a director, board member or manager to knowingly, willfully and repeatedly violate the access paragraph with the intent of causing harm. Ask your attorney if you are worried about a particular request.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute sets the deadline and the access rules and does not print a form. This template is our suggestion and is not legal advice.',
    },
  ],
  related: ['florida-hoa-official-records-inspection', 'florida-hoa-fine-hearing-committee', 'records-inspection-requests', 'california-hoa-records-inspection-rules', 'hoa-board-meeting-minutes'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [],
}
