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
  related: ['complaint-process', 'late-fee-limits', 'readiness'],
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
  related: ['annual-meeting-notice-checklist', 'hoa-treasurer-duties', 'self-managed-hoa-georgia-first-90-days'],
  datePublished: '2026-10-26',
  dateModified: '2026-10-26',
}
