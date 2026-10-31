// SEO batch 15, Georgia template: a certified board resolution.
// Statute text: O.C.G.A. §§ 44-3-228 and 44-3-231 from ga-ocga-44-3-art6-2026.txt,
// through the existing powResolution, powBorrow, powAmend, powLitigate, powBoard,
// powMinutes and boardQuorum quotes. The fill-in quotes no law. Property Owners'
// Association Act only. Product claims: the meeting agenda, the quorum kit, the
// motion log and minutes approval. HomeownerHub does not draft or certify the
// resolution, and the page says so.

import type { Checklist } from './checklists'

export const GA_BOARD_RESOLUTION: Checklist = {
  slug: 'georgia-hoa-board-resolution-template',
  path: '/templates/georgia-hoa-board-resolution-template',
  title: 'Georgia HOA certified board resolution template',
  metaTitle: 'Georgia HOA board resolution template',
  description:
    'A free, printable certified board resolution for a Georgia HOA, with fields for the meeting, quorum, motion, vote and secretary certification.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when a bank, a lender, a vendor or a court asks for proof that your board authorized an act or a transaction, such as a loan, a lawsuit or a contract. Section 44-3-231(b) lets a third party rely in good faith on a certified resolution of the board. This page lists the fields that resolution needs and gives a fill-in form.',
    'Each item is tagged: statute means the quoted Georgia text calls for it, practice means it is our suggestion. The quoted text is the Property Owners’ Association Act. Condominiums are under a different article. HomeownerHub keeps the meeting record, and it does not draft or certify the resolution. This is not legal advice, and your attorney should read the final resolution before it goes out.',
  ],
  items: [
    { text: 'Write the association’s full legal name and the date and place of the meeting.', detail: 'Use the name on your articles of incorporation, so the lender sees the same name as the loan papers.', basis: 'practice' },
    { text: 'Confirm the meeting was a board meeting and that the item was on the agenda.', detail: 'Name the item in the agenda, with the amount or the claim stated.', basis: 'practice' },
    { text: 'Record the quorum.', detail: 'The default is the presence of persons entitled to cast one-half of the votes of the board, unless the instrument or bylaws specify a larger percentage. Write down who was present.', basis: 'statute' },
    { text: 'Write the motion text in full, as it was voted on.', detail: 'State the act or transaction the board is authorizing: the amount borrowed and from whom, the property pledged, the parties to the lawsuit, or the amendment adopted.', basis: 'practice' },
    { text: 'Check that the act is one the association has the power to do.', detail: 'The statute lists borrowing, pledging property, litigation and amending the documents to conform to mandatory law. A lawful purpose within the association’s powers is part of the borrowing grant.', basis: 'statute' },
    { text: 'Check your instrument, articles and bylaws for any owner vote the act needs.', detail: 'The board acts without further owner consent unless the Act, Title 14, the instrument, the articles or the bylaws expressly require otherwise.', basis: 'statute' },
    { text: 'Record who moved, who seconded, and the vote count: for, against and abstaining.', basis: 'practice' },
    { text: 'Note any director who stepped out or abstained because of a conflict.', detail: 'Our conflict of interest disclosure checklist covers the disclosure itself.', basis: 'practice' },
    { text: 'State what the resolution authorizes an officer to sign.', detail: 'Name the office, such as the president or treasurer, and the document.', basis: 'practice' },
    { text: 'Have the secretary, or the officer who keeps the records, certify the copy.', detail: 'The certification says the resolution is a true copy, was adopted at a meeting with a quorum, and has not been changed or revoked.', basis: 'practice' },
    { text: 'Attach the minutes, or note the date they will be approved.', detail: 'The Act lists detailed minutes of board meetings among the records the association keeps.', basis: 'statute' },
    { text: 'Give the lender or other party the signed original or a scanned copy, and keep one in the minute book.', basis: 'practice' },
    { text: 'Have your attorney review the wording of any loan, pledge or lawsuit resolution before the vote.', basis: 'practice' },
  ],
  letter: {
    heading: 'Certified resolution of the board of directors (fill-in)',
    intro: 'Fill the blanks in brackets. This form quotes no law and is a starting point only. Have your attorney review it against your governing documents and the other party’s requirements.',
    lines: [
      '[Association full legal name]',
      'CERTIFIED RESOLUTION OF THE BOARD OF DIRECTORS',
      '',
      'Meeting date and place: [date], [place or video link]',
      'Directors present: [names]',
      'Quorum: [number] of [number] directors were present. The quorum rule that applies is [section of the bylaws, or the statutory default].',
      '',
      'Motion: [Full text of the motion as voted. State the act or transaction, the amount, the other party, and the officer authorized to sign.]',
      'Moved by: [name]    Seconded by: [name]',
      'Vote: [number] for, [number] against, [number] abstaining. [Names of any director who did not vote, and why.]',
      'Result: [Adopted / Not adopted]',
      '',
      'Secretary’s certification',
      'I, [name], the [Secretary / officer keeping the records] of [association name], certify that the above is a true copy of a resolution adopted by the board of directors at a meeting at which a quorum was present, and that it has not been amended or revoked.',
      '',
      'Signature: [signature]    Date: [date]',
      'Printed name and office: [name], [office]',
    ],
  },
  quotes: ['powResolution', 'powBorrow', 'powLitigate', 'powAmend', 'powBoard', 'boardQuorum', 'powMinutes'],
  quotesHeading: 'The Georgia text behind these fields',
  faqs: [
    {
      q: 'What does a certified board resolution do for a Georgia HOA?',
      a: 'Section 44-3-231(b) says a third party dealing with the association may rely in good faith on it as conclusive evidence of the association’s authority and of full compliance with any restraints on that authority.',
    },
    {
      q: 'Who certifies the resolution?',
      a: 'The statute says a certified resolution of the board, and does not name the officer. Most associations use the secretary or whoever keeps the records. Check your bylaws.',
    },
    {
      q: 'Does the board need an owner vote to borrow or sue?',
      a: 'The statute lets the board act without further owner consent unless the Act, Title 14, the instrument, the articles or the bylaws expressly require otherwise. Check your documents.',
    },
    {
      q: 'What quorum should the resolution show?',
      a: 'Unless the instrument or bylaws specify a larger percentage, the presence of persons entitled to cast one-half of the votes of the board is a quorum under § 44-3-228.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute asks for a certified resolution and does not print a form. This template is our suggestion and is not legal advice. Have your attorney review it.',
    },
  ],
  related: ['georgia-hoa-board-borrowing-and-lawsuits', 'georgia-hoa-board-powers-44-3-231', 'hoa-board-meeting-agenda', 'hoa-board-meeting-minutes', 'hoa-board-conflict-of-interest-disclosure-checklist'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'The meeting scheduler can insert a standard agenda in one click, with quorum, minutes, reports, old and new business.',
      route: '/meetings/schedule',
      release: '2026-10-30-1945-receipts-agenda-setup-hub',
    },
    {
      text: 'The annual meeting kit has a live quorum counter, check-in and proxy tracking, for meetings where owners vote.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'Meetings, then Motion log, lists every motion from your minutes with who moved, who seconded and the result, so you can pull the wording for the resolution.',
      route: '/meetings/motions',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'Approve minutes appears on a past meeting once minutes are saved. It asks you to confirm first.',
      route: '/meetings/[id]',
      release: '2026-10-31-0230-minutes-letters-statement-email',
    },
  ],
}
