// SEO batch 6: the Georgia annual meeting report checklist. Statute text only
// through the quote bank (O.C.G.A. § 44-3-230(a)). The statute says "reports of
// the affairs, finances, and budget projections" and nothing more specific, so
// the items below are tagged as best practice, not as requirements.

import type { Checklist } from './checklists'

export const ANNUAL_REPORT_CHECKLIST: Checklist = {
  slug: 'georgia-annual-meeting-report-checklist',
  path: '/templates/georgia-annual-meeting-report-checklist',
  title: 'Georgia HOA annual meeting report to owners: a checklist',
  metaTitle: 'Georgia HOA annual meeting report checklist',
  description:
    'A free, printable checklist for the report Georgia boards make to owners at the annual meeting (§ 44-3-230(a)): affairs, finances and budget.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Georgia’s Property Owners’ Association Act says that at the annual meeting, comprehensive reports of the affairs, finances and budget projections of the association shall be made to the lot owners. The statute does not list what each report must contain.',
    'So this checklist marks what comes from the statute and what is our suggestion. Best practice items are not a legal requirement. It is not legal advice, and condominium associations are under a different statute. Check your bylaws and ask your attorney.',
  ],
  items: [
    { text: 'The annual meeting is on the calendar, with notice going out at least 21 days ahead.', detail: 'See the annual meeting notice checklist for the notice rules.', basis: 'statute' },
    { text: 'A report on the association’s finances is ready to present at the meeting.', detail: 'Income and expenses for the year, and the balance sheet.', basis: 'statute' },
    { text: 'A report on the association’s affairs is ready to present at the meeting.', detail: 'What the board did this year: projects, rule changes, elections, vendor changes.', basis: 'statute' },
    { text: 'Budget projections for the coming year are ready to present.', basis: 'statute' },
    { text: 'Budget against actual is shown for the year just ended.', detail: 'Explain the lines furthest from plan in a sentence each.', basis: 'practice' },
    { text: 'Reserves are reported: what is set aside and what it is for.', basis: 'practice' },
    { text: 'Collections are reported in totals and counts only.', detail: 'Never show a home, an owner’s name or a per-home balance in a report that goes to all owners.', basis: 'practice' },
    { text: 'Insurance policies in force are listed, with renewal dates.', basis: 'practice' },
    { text: 'Meetings held and motions passed during the year are summarized.', basis: 'practice' },
    { text: 'A short note from the board opens the report, in plain words.', basis: 'practice' },
    { text: 'A second board member has checked every figure against the books.', basis: 'practice' },
    { text: 'The report is printed for the meeting and kept in the meeting file.', detail: 'Note in the minutes that it was presented.', basis: 'practice' },
  ],
  quotes: ['meetingReports', 'meetingAnnual', 'meetingNotice'],
  quotesHeading: 'The statute behind this checklist',
  faqs: [
    {
      q: 'What must a Georgia HOA report at the annual meeting?',
      a: 'The statute says comprehensive reports of the affairs, finances and budget projections of the association shall be made to the lot owners at the annual meeting. See the quote above.',
    },
    {
      q: 'Does the statute say what the report must include?',
      a: 'The quoted text does not list contents. Check your bylaws and ask your attorney what your association should include.',
    },
    {
      q: 'Should an owner’s account appear in the report?',
      a: 'We suggest not. A report that goes to every owner is safer with totals and counts only.',
    },
  ],
  related: ['annual-meeting-notice-checklist', 'annual-meeting-quorum-proxies', 'hoa-board-meeting-agenda', 'hoa-treasurer-duties'],
  hoaDoes: [
    {
      text: 'From an annual meeting, print an annual report to owners of the year’s finances, budget, reserves, insurance, meetings and elections. It never shows any home’s balance or owner names, and the board adds its own message. Nothing is sent from the report page.',
      route: '/meetings/[id]/annual-report',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
    {
      text: 'The board’s own write-up of the annual meeting report is saved, and a checkbox adds the report under the annual meeting notice.',
      route: '/meetings/[id]/annual-report',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
  ],
  datePublished: '2026-10-28',
  dateModified: '2026-10-28',
}
