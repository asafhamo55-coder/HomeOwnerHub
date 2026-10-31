// SEO batch 17, Florida board meeting notice rules.
// Statute text: Fla. Stat. § 720.303(2) from flsenate-ch720-2026.html, through
// the flMeet* quotes (word for word, checked by georgia-guides.test.ts). The
// page restates the quotes and adds no deadline of its own. Chapter 720 only,
// not condominiums. Product claim: the meeting scheduler and its one-click
// standard agenda, shipped (release 2026-10-30-1945-receipts-agenda-setup-hub).
// No claim that HomeownerHub posts notices, counts the 48 hours or decides
// what an emergency is.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_BOARD_MEETINGS: Guide = {
  slug: 'florida-hoa-board-meeting-notice-rules',
  path: '/guides/florida-hoa-board-meeting-notice-rules',
  title: 'Florida HOA board meetings: the 48-hour notice, the agenda and owner comment',
  metaTitle: 'Florida HOA board meeting notice rules',
  description:
    'What Fla. Stat. 720.303(2) says about Florida HOA board meetings: 48-hour posting, agenda items in the notice, owners speaking, and no proxy or secret ballots.',
  eyebrow: 'Florida · Meetings',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  state: 'FL',
  summary: [
    'Section 720.303(2) of the Florida Homeowners’ Association Act says board meetings are open to members. A meeting happens whenever a quorum of the board gathers to conduct association business.',
    'The notice must specifically identify the agenda items. Unless it is an emergency, it must be posted in a conspicuous place in the community at least 48 hours ahead, or else mailed or delivered to each member at least 7 days ahead.',
    'Members may speak on the designated agenda items. Directors may not vote by proxy or by secret ballot, and may not cast a vote by e-mail.',
    'This is a plain-language guide to the text we hold, not legal advice. Your bylaws and your attorney decide how it applies to your community.',
  ],
  sections: [
    {
      heading: 'What counts as a board meeting',
      body: [
        'The statute defines a meeting by who is in the room, not by what it is called. When a quorum of the board gathers to conduct association business, that is a board meeting, and the rest of this page applies to it.',
      ],
      quotes: ['flMeetDef'],
    },
    {
      heading: 'Meetings are open, with two exceptions',
      body: [
        'Board meetings must be open to all members. The statute carves out meetings between the board and its attorney about proposed or pending litigation, where the discussion would be covered by the attorney-client privilege.',
        'Paragraph (b) adds board meetings held to discuss personnel matters. Ask your attorney which discussions qualify.',
      ],
      quotes: ['flMeetOpen'],
    },
    {
      heading: 'The notice: 48 hours, with agenda items',
      body: [
        'Paragraph (c) says what the bylaws must provide for notice, and says that if they do not, they are deemed to include it. The first rule has three parts. The notice must specifically identify the agenda items. It must be posted in a conspicuous place in the community at least 48 hours before the meeting. And an emergency is the stated exception.',
        'If the notice is not posted in a conspicuous place, the alternative is to mail or deliver it to each member at least 7 days before the meeting. The same sentence carries the emergency exception.',
        'The paragraph also allows some alternatives, such as a website posting rule. They have their own conditions, so read it before relying on one.',
      ],
      quotes: ['flMeetNotice'],
    },
    {
      heading: 'Assessments need a longer notice',
      body: [
        'A board cannot levy an assessment at a meeting unless the notice says assessments will be considered and describes their nature.',
        'For a meeting where special assessments will be considered, or where amendments to rules about parcel use will be considered, the statute asks for written notice not less than 14 days before the meeting. It names three ways to give it: mailed, delivered or electronically transmitted to the members and owners, and posted conspicuously on the property or broadcast on closed-circuit cable television.',
      ],
      quotes: ['flMeetAssess'],
    },
    {
      heading: 'Owners may speak on agenda items',
      body: [
        'Members may attend board meetings and speak on all designated items, so write the agenda items carefully.',
        'The association may adopt written, reasonable rules that expand the right to speak and govern how often, how long and in what manner members speak. The rules must be consistent with the paragraph, and the statute says they may include a sign-up sheet.',
      ],
      quotes: ['flMeetSpeak', 'flMeetRules'],
    },
    {
      heading: 'How directors may vote',
      body: [
        'Directors may not vote by proxy or by secret ballot at board meetings. The one stated exception is that secret ballots may be used in the election of officers.',
        'Separately, directors may use e-mail to communicate but may not cast a vote on an association matter by e-mail. Record each vote in the minutes.',
      ],
      quotes: ['flMeetProxy', 'flMeetEmail'],
    },
    {
      heading: 'When owners petition for an agenda item',
      body: [
        'If 20 percent of the total voting interests petition the board to address an item of business, the board must take it up on an agenda. The deadline is the next regular board meeting or a special meeting, but not later than 60 days after the board receives the petition.',
      ],
      quotes: ['flMeetPetition'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only. Condominiums are under chapter 718. We do not hold your bylaws, which may set a longer notice. The statute does not define an emergency, so we do not either. Check the current text before the board relies on a deadline.',
      ],
    },
  ],
  steps: [
    'Decide the meeting date, and work back at least 48 hours for a posted notice, or 7 days for a mailed or delivered one.',
    'Write the agenda first, and name each item specifically. Put assessments on the agenda by name if the board may discuss them.',
    'If special assessments or a change to parcel-use rules is on the agenda, count back 14 days and send written notice the way the statute lists.',
    'Post the notice in a conspicuous place in the community, and write down where and when you posted it.',
    'At the meeting, let members speak on the designated items under your written speaking rules, and take votes in the room, by name, with no proxies or secret ballots.',
    'Record the motions and votes in the minutes, and approve the minutes at the next meeting.',
    'If owners petition for an item with 20 percent of the voting interests, put it on an agenda within 60 days of receiving the petition.',
  ],
  faqs: [
    {
      q: 'How much notice does a Florida HOA board meeting need?',
      a: 'Under § 720.303(2)(c)1., a notice posted in a conspicuous place in the community at least 48 hours ahead, or a mailed or delivered notice at least 7 days ahead, except in an emergency. Special assessments and parcel-use rule changes need written notice not less than 14 days ahead.',
    },
    {
      q: 'Does the notice have to list the agenda?',
      a: 'Yes. The statute says notices of all board meetings must specifically identify agenda items for the meetings.',
    },
    {
      q: 'Can owners speak at a Florida HOA board meeting?',
      a: 'Members may attend all board meetings, and that includes the right to speak on all designated items. The association may adopt written reasonable rules on how often and how long members speak.',
    },
    {
      q: 'Can Florida HOA directors vote by proxy or by e-mail?',
      a: 'No. Directors may not vote by proxy or by secret ballot at board meetings, except that secret ballots may be used in the election of officers, and they may not cast a vote on an association matter by e-mail.',
    },
    {
      q: 'Can the board meet privately with its attorney?',
      a: 'The statute allows meetings with the attorney about proposed or pending litigation to be closed, where the discussion would be covered by the attorney-client privilege. Ask your attorney whether a given discussion qualifies.',
    },
  ],
  related: [
    'florida-hoa-director-certification-checklist',
    'florida-hoa-fine-hearing-committee',
    'florida-hoa-official-records-inspection',
    'hoa-board-meeting-minutes',
  ],
  hoaDoes: [
    {
      text: 'The meeting scheduler can insert a standard agenda in one click, with call to order, quorum, minutes, reports, old and new business, and adjourn, so the notice you post names its items.',
      route: '/meetings/schedule',
      release: '2026-10-30-1945-receipts-agenda-setup-hub',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not post your notice, count the 48 hours for you or decide what an emergency is. Keep your own calendar and a note of where and when each notice went up.',
}
