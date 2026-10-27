// BL-172 batch 2: two more free printable checklists.
//
// The violation notice checklist tags every item "statute" (traces to a
// section quoted word for word on the page) or "practice" (our plain-language
// suggestion, not a legal requirement). The agenda template is generic and
// every item is practice.

import type { Checklist } from './checklists'

export const VIOLATION_NOTICE_CHECKLIST: Checklist = {
  slug: 'violation-notice-checklist',
  title: 'Georgia HOA violation notice checklist',
  metaTitle: 'Free Georgia HOA violation notice checklist',
  description:
    'A free, printable checklist for a fair HOA violation notice in Georgia. Each item is tagged statute (O.C.G.A. § 44-3-223) or best practice. No sign-up.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this before a violation letter or a fine goes out. Every item is tagged. “Statute” means it traces to a section quoted word for word at the bottom of the page. “Best practice” is our plain-language suggestion for a fair, easy-to-defend notice. It is not a legal requirement.',
    'Georgia’s statute leaves most of the detail to your own declaration and bylaws, so the first job is to read them. This is a checklist, not a form letter, and not legal advice. Have your attorney review your notice template once.',
  ],
  items: [
    {
      basis: 'statute',
      text: 'Your declaration or bylaws authorize fines.',
      detail: 'Under § 44-3-223 the association may impose fines “if and to the extent provided in the instrument.” If the documents are silent, ask your attorney before fining.',
    },
    {
      basis: 'statute',
      text: 'The rule being enforced is in the instrument, or is a reasonable rule adopted under it and provided to the owners.',
      detail: 'A rule the owners were never given is a weak basis for a notice.',
    },
    {
      basis: 'statute',
      text: 'The notice period, the fine amount and any hearing step follow your instrument.',
      detail: 'The sections quoted here set no dollar amount for a fine and no waiting period before one. Take both from your documents.',
    },
    {
      basis: 'statute',
      text: 'Before going to court for an injunction, you have given the notice your instrument requires.',
      detail: 'If the instrument is silent, the statute says ten days’ written notice, with exceptions for a clear and imminent danger or where waiting would make the request moot.',
    },
    {
      basis: 'statute',
      text: 'The consequence does not take away access to the home or the vote in board elections.',
      detail: 'Fines do not impact voting rights, and no suspension for unpaid fines may deny access to the lot or the right to vote in board elections.',
    },
    {
      basis: 'statute',
      text: 'From January 1, 2027: the association is registered with the Secretary of State.',
      detail: 'An unregistered association may not collect fines or fees from an owner.',
    },
    {
      basis: 'statute',
      text: 'From January 1, 2027: no complaint to the Secretary of State is pending on the same matter.',
      detail: 'A complaint acts as an automatic stay on collecting fines or fees that are the subject of the complaint or related to it.',
    },
    {
      basis: 'practice',
      text: 'The notice names the owner and the lot as they appear in your records, and the date of the letter.',
    },
    {
      basis: 'practice',
      text: 'It describes what was seen: the date, the place, and a photo or a witness.',
      detail: 'Stick to facts. “Trash cans were visible from the street on March 3” beats “you never follow the rules.”',
    },
    {
      basis: 'practice',
      text: 'It cites the exact section of the declaration, bylaws or rules.',
    },
    {
      basis: 'practice',
      text: 'It says what the owner can do to fix the problem, and by what date.',
    },
    {
      basis: 'practice',
      text: 'It says what happens next if nothing changes, and what any fine will be, only if your documents allow one.',
    },
    {
      basis: 'practice',
      text: 'It tells the owner how to respond: a contact, a deadline, and any hearing or appeal your instrument provides.',
    },
    {
      basis: 'practice',
      text: 'The tone is neutral. It does not threaten legal action unless your attorney has approved that language.',
    },
    {
      basis: 'practice',
      text: 'It is delivered the way your instrument says, and you keep a dated copy and proof of delivery.',
    },
    {
      basis: 'practice',
      text: 'Similar violations are treated alike, and a director with a personal stake in the matter steps out of the decision.',
    },
    {
      basis: 'practice',
      text: 'The board’s decision is in the minutes, and a follow-up date is on the calendar.',
    },
  ],
  quotes: ['fineAuth', 'reasonableRules', 'injunctNotice', 'regBar', 'stay', 'actEffective'],
  faqs: [
    {
      q: 'Does Georgia law say how much notice an owner gets before a fine?',
      a: 'Not in the sections quoted on this page. Section 44-3-223 points to your instrument for fines. It sets ten days’ written notice, if the instrument is silent, before the association pursues injunctive relief, with exceptions for danger and for requests that would become moot.',
    },
    {
      q: 'Can we shut off an owner’s access to the home or their vote because of unpaid fines?',
      a: 'No. The statute says no suspension may deny any lot owner or occupant access to the lot or the right to vote in board elections based on failure to pay outstanding fines. It does allow suspending certain common-area use, if and to the extent your instrument provides.',
    },
    {
      q: 'Do these items apply to a condominium?',
      a: 'The checklist cites the Property Owners’ Association Act. Condominiums are under a different statute, so ask your attorney which sections apply to you.',
    },
    {
      q: 'Is this a form letter?',
      a: 'No. It is a list of what a fair notice should cover. Your attorney can turn it into a template that matches your documents.',
    },
  ],
  related: ['complaint-process', 'late-fee-limits', 'readiness', 'fines-and-violation-hearings', 'hoa-violation-letter-georgia'],
  datePublished: '2026-10-26',
  dateModified: '2026-10-26',
}

export const BOARD_AGENDA_TEMPLATE: Checklist = {
  slug: 'hoa-board-meeting-agenda',
  path: '/templates/hoa-board-meeting-agenda',
  title: 'HOA board meeting agenda template',
  metaTitle: 'Free HOA board meeting agenda template',
  description:
    'A free, printable agenda for an HOA board meeting in any state: quorum, conflicts, treasurer’s report, violations, business, action items. No sign-up.',
  eyebrow: 'Free template · Print it',
  intro: [
    'A good agenda keeps a volunteer board to an hour. This one works in any state: print it, cross out what does not apply, and add the items your own bylaws require.',
    'Notice rules, executive-session rules and who may attend differ by state and by association, so check your bylaws and ask your attorney. The Georgia notes at the bottom quote the statute word for word. This is general information, not legal advice.',
  ],
  items: [
    { text: 'Call to order. Note the time and who is chairing.' },
    { text: 'Confirm the meeting was noticed as your bylaws require.', detail: 'Record the date and method of the notice in the minutes.' },
    { text: 'Roll call, and confirm there is a quorum.', detail: 'Your bylaws set the number. Write down who is present and who joined by phone or video, if allowed.' },
    { text: 'Conflict-of-interest check.', detail: 'Ask whether any director has a personal stake in an item today. Record the answer and have that director step out of the vote.' },
    { text: 'Adopt the agenda.', detail: 'Add or move items by a quick vote.' },
    { text: 'Approve the minutes of the last meeting.', detail: 'Send them out ahead so this takes two minutes.' },
    { text: 'Treasurer’s report.', detail: 'Bank balances, income and spending against the budget, the reserve balance, and a summary of overdue accounts.' },
    { text: 'Violations and architectural requests.', detail: 'Open items, decisions needed, hearings scheduled. Keep owner names out of the open record unless your process requires them.' },
    { text: 'Maintenance, vendors and bids.', detail: 'Work in progress, bids to approve, contracts coming up for renewal.' },
    { text: 'Old business.', detail: 'Go through last meeting’s action items: done, or carried forward with a new date.' },
    { text: 'New business.', detail: 'One motion at a time. A second, a discussion, a vote, and the result recorded.' },
    { text: 'Owner comments.', detail: 'Set a time limit per speaker. Follow your bylaws on whether owners may attend and speak.' },
    { text: 'Executive session, only if your bylaws and state law allow it.', detail: 'Say the general reason before closing the door, such as legal advice or a personnel matter, and reconvene to vote in public if required.' },
    { text: 'Read back the action items.', detail: 'Each one has a name, a task and a date.' },
    { text: 'Set the next meeting. Adjourn, and note the time.' },
  ],
  quotesHeading: 'Georgia notes: what the statute says',
  quotes: ['meetingNotice', 'boardQuorum', 'right10', 'meetingReports'],
  faqs: [
    {
      q: 'How long should an HOA board meeting be?',
      a: 'Most volunteer boards aim for an hour. Sending the treasurer’s report and last meeting’s minutes in advance keeps the meeting for decisions.',
    },
    {
      q: 'Does the agenda have to go to the owners?',
      a: 'It depends on your bylaws and your state. Many associations send the agenda with the meeting notice. Check your documents, and ask your attorney if they are silent.',
    },
    {
      q: 'What can we discuss in executive session?',
      a: 'Rules vary by state and by association. Legal advice, pending litigation and personnel matters are common examples. Check your bylaws and ask your attorney before you close a meeting.',
    },
    {
      q: 'What counts as a quorum for a board meeting?',
      a: 'Your bylaws decide. In Georgia, for a property owners’ association, the statute sets one-half of the votes of the board unless the instrument or bylaws specify a larger percentage, as quoted below.',
    },
  ],
  related: ['annual-meeting-notice-checklist', 'hoa-treasurer-duties', 'self-managed-hoa-georgia-first-90-days', 'annual-meeting-quorum-proxies', 'hoa-board-meeting-minutes'],
  datePublished: '2026-10-26',
  dateModified: '2026-10-26',
}

// SEO batch 3: a printable violation letter. The letter text states facts and
// leaves every legal detail (fine amount, response period, hearing step) as a
// blank to take from the association's own documents. It quotes no law; the
// statute behind the checklist is quoted below it, word for word.
export const VIOLATION_LETTER_TEMPLATE: Checklist = {
  slug: 'hoa-violation-letter-georgia',
  path: '/templates/hoa-violation-letter-georgia',
  title: 'HOA violation letter template for Georgia',
  metaTitle: 'Free HOA violation letter template, Georgia',
  description:
    'A free, printable first-notice violation letter for a Georgia HOA, with a check-before-you-send list. Fill in the blanks from your own documents. No sign-up.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this for a first notice about a rule violation. Print the page, fill in the bracketed blanks, and have the board approve the letter before it goes out. The letter is written to be calm and factual, and it leaves every legal detail blank on purpose.',
    'Georgia’s Property Owners’ Association Act leaves the fine amount, the response period and any hearing step to your own declaration and bylaws. Copy those from your documents, not from this page. This is a template, not legal advice. Have your attorney review it once and keep that version as your master copy.',
  ],
  howTo: true,
  items: [
    { basis: 'practice', text: 'Read the rule in your declaration, bylaws or rules, and note the section number.', detail: 'Cite the section in the letter. A notice that names no rule is hard to defend.' },
    { basis: 'statute', text: 'Confirm the rule is in the instrument, or is a reasonable rule adopted under it and provided to the owners.', detail: 'The statute requires compliance with reasonable rules adopted under the instrument that have been provided to the lot owners.' },
    { basis: 'practice', text: 'Record what you saw: the date, the place, and who saw it.', detail: 'Attach a dated photo if you have one. Describe the facts, not your opinion of the owner.' },
    { basis: 'statute', text: 'Check that your documents authorize fines before the letter mentions one.', detail: 'Fines are allowed if and to the extent the instrument provides. If the letter is only a warning, leave the fine line out.' },
    { basis: 'practice', text: 'Take the response period, the fine amount and any hearing step from your documents and write them in the blanks.', detail: 'This template sets none. If your documents are silent, ask your attorney.' },
    { basis: 'practice', text: 'Address it to the owner of record at the address in your records, and add the lot and the date.' },
    { basis: 'practice', text: 'Offer a way to resolve it: a named contact, a phone number or email, and a date to reply by.' },
    { basis: 'practice', text: 'Have the board approve the letter, and record the approval in the minutes.' },
    { basis: 'practice', text: 'Send it the way your documents require, and keep a copy with the proof of delivery.', detail: 'If your documents are silent, use a method you can prove, such as certified mail.' },
    { basis: 'statute', text: 'From January 1, 2027: make sure the association is registered before any fine is collected.', detail: 'An unregistered association may not collect fines or fees from an owner.' },
  ],
  letter: {
    heading: 'The letter',
    intro: 'Replace each [bracket]. Delete any line your documents do not support.',
    lines: [
      '[Association name]',
      '[Association mailing address]',
      '[Date]',
      '',
      '[Owner name(s) as they appear in your records]',
      '[Lot or property address] ([Lot number])',
      '',
      'Re: Notice of possible violation of [section number and name of the declaration, bylaws or rule]',
      '',
      'Dear [Owner name],',
      '',
      'The board of [Association name] is writing about the property at [address]. On [date of observation], [name or title] observed [plain description of what was seen, with the place]. [Photo attached, if you have one.]',
      '',
      'Section [number] of [the declaration / the bylaws / the rules and regulations] says: [copy the exact words of the rule from your document].',
      '',
      'We ask that you [what the owner should do] by [date taken from your documents]. If you believe this notice is mistaken, or you need more time, please write to [name and title] at [email or address], or call [phone], by [reply date], and tell us.',
      '',
      '[Include only if your documents provide for it: If the matter is not resolved, the board may [the step your documents allow, such as a fine of the amount your documents set]. You may [ask for a hearing / respond in writing] as described in [section number].]',
      '',
      'This letter is not a final decision. It is a request to talk about the issue. Thank you for helping us keep the community a good place to live.',
      '',
      'Sincerely,',
      '[Name], [title]',
      'On behalf of the Board of Directors of [Association name]',
    ],
  },
  quotesHeading: 'The statute behind the checklist',
  quotes: ['fineAuth', 'reasonableRules', 'nonRegBar'],
  faqs: [
    {
      q: 'Is this the letter every Georgia HOA must send?',
      a: 'No. Georgia’s statute does not prescribe a form for a violation letter. Your declaration and bylaws decide what a notice must say and how it must be delivered. This template leaves those details blank so you can take them from your documents.',
    },
    {
      q: 'Can the letter threaten a fine?',
      a: 'Only if your documents provide for fines. The statute allows fines if and to the extent the instrument provides. If the documents are silent, a warning with no fine is the safer first step; ask your attorney.',
    },
    {
      q: 'Is a hearing required before a fine in Georgia?',
      a: 'The sections of the Property Owners’ Association Act that we hold do not require one. Your documents may. Our fines and hearings guide explains the difference.',
    },
    {
      q: 'Should the first letter be sent by certified mail?',
      a: 'The statute sets no delivery method for a first violation notice. Follow your documents. If they are silent, certified mail gives you proof of delivery.',
    },
  ],
  related: ['fines-and-violation-hearings', 'violation-notice-checklist', 'late-fee-limits', 'hoa-board-meeting-agenda'],
  hoaDoes: [
    {
      text: 'Board members can walk the community with a phone, choose what is wrong at each home and take photos. Each one becomes a draft violation letter for the board to review, and nothing goes to the owner.',
      route: '/inspect',
      release: '2026-10-18-0535-inspect-inbox',
    },
    {
      text: 'On a violation’s page, the board can draft a second notice, a hearing notice, a fine notice or a decision letter. Every letter waits in Approvals, and nothing is sent to the homeowner.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
  ],
  datePublished: '2026-10-27',
  dateModified: '2026-10-27',
}
