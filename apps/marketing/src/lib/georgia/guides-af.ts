// SEO batch 33: three Georgia guides for volunteer board members.
//   1. A board transition checklist: what changes hands when volunteers change (14-3-1601, 14-3-1602, 14-3-1622, 44-3-231(d)).
//   2. Board meetings: quorum and minutes (44-3-228, 44-3-231(d), 14-3-1601), with what the text we hold leaves to the bylaws.
//   3. Secretary duties: notices, minutes, the member list and the state registration (44-3-230, 14-3-1602, 14-3-1622).
// Statute text only through the quote bank (boardQuorum, memberQuorum, powMinutes, powFinancial, requiredRecords, recAccounting,
// recMemberList, recBylaws, recOfficers, recMinutes3yr, annualRegOfficers, annualRegCurrent, meetingNotice, meetingDelivery,
// ownerCallForm, copiesOfBylaws, powResolution), checked word for word by georgia-guides.test.ts. Every other sentence restates
// a quote, says the text we hold is silent, or is labelled practice. No duty is assigned to an office the statute does not name.
// Product claims only for shipped features that have a route and a release note.

import type { Guide } from './types'

const PUBLISHED = '2026-11-07'

export const GA_BOARD_TRANSITION: Guide = {
  slug: 'georgia-hoa-board-transition-checklist',
  path: '/guides/georgia-hoa-board-transition-checklist',
  title: 'Georgia HOA board transition checklist',
  metaTitle: 'Georgia HOA board transition checklist',
  description:
    'A checklist for when volunteers join or leave a Georgia HOA board: the records, member list, financial books and state registration that must stay current.',
  eyebrow: 'Georgia · New board',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'The Georgia text we hold has no turnover procedure. It does say what the association must keep, and those duties do not change when the people on the board do: minutes, financial records, a member list, the bylaws and a current list of directors and officers.',
    'So a handover is mostly a matter of making sure the next board can find and open each of those, and that the state registration names the right officers. How and when to do it is practice, not a statutory step.',
    'This is a plain-language guide to the text we hold, not legal advice. Check your declaration and bylaws, and ask your attorney.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3. If your association is a nonprofit corporation, the nonprofit chapter of Title 14 also applies, and several items below come from it. Your declaration and articles say which you are.',
      ],
    },
    {
      heading: '1. The governing documents',
      body: [
        'Collect the recorded declaration, the articles, the bylaws and every amendment. The nonprofit chapter says the corporation keeps its bylaws and all amendments currently in effect. Practice: give the incoming board one clean set and note where the originals are kept.',
      ],
      quotes: ['recBylaws'],
    },
    {
      heading: '2. Minutes and permanent records',
      body: [
        'The Act says the association keeps detailed minutes of member and board meetings. The nonprofit chapter treats minutes, written consents and committee actions as permanent records. Practice: hand over every binder, folder and shared drive, and tell the new secretary which year each one starts.',
      ],
      quotes: ['powMinutes', 'requiredRecords'],
    },
    {
      heading: '3. Financial records',
      body: [
        'The Act says the association keeps detailed and accurate financial records, including itemized receipts and expenditures. The nonprofit chapter adds appropriate accounting records. Practice: the outgoing treasurer walks the new one through the ledger, the bank accounts and any open invoices before the first meeting.',
      ],
      quotes: ['powFinancial', 'recAccounting'],
    },
    {
      heading: '4. The member list',
      body: [
        'The corporation or its agent keeps a record of members that can produce a list of names and addresses, in alphabetical order by class, with the number of votes each member may cast. Practice: confirm who holds the current file, and whether a management company or a volunteer has the only copy.',
      ],
      quotes: ['recMemberList'],
    },
    {
      heading: '5. Officers and the state registration',
      body: [
        'The nonprofit chapter says the corporation keeps a list of its current directors and officers. The annual registration names the chief executive officer, chief financial officer and secretary, and its information must be current when it is executed. So when offices change, update the internal list and check the names before the next filing. Our annual registration guide covers the window.',
      ],
      quotes: ['recOfficers', 'annualRegOfficers', 'annualRegCurrent'],
    },
    {
      heading: '6. Access, accounts and open work',
      body: [
        'The statute is silent on passwords, bank signers, the association mailbox and vendor logins. Practice: list who can reach each one, move the ones a departing volunteer controlled, and ask your bank and your attorney how to change signers. Then list open items, such as pending architectural requests, unpaid vendors and letters not yet sent, with an owner for each.',
      ],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not state how long a departing director must cooperate, who is liable for a gap in the books, or how your bylaws fill a vacancy or seat new officers. Those turn on your documents. Check your declaration and bylaws, and ask your attorney.',
      ],
    },
  ],
  steps: [
    'Read your bylaws for how officers are chosen and when new directors take their seats.',
    'Gather the declaration, articles, bylaws and all amendments into one set.',
    'Collect minutes, consents and committee records, and note where each series starts and ends.',
    'Review the ledger, bank accounts, open invoices and the member list with the new treasurer and secretary.',
    'Update the list of directors and officers, and check the names against the next annual registration.',
    'List every account and connection one person controlled, move each, and write down who has access.',
    'Hand over open work with a name and a date beside each item.',
  ],
  faqs: [
    {
      q: 'Does Georgia law say how an HOA board hands over to a new board?',
      a: 'Not in the text we hold. What it does say is what the association keeps: minutes, financial records, a member list, bylaws and a list of directors and officers. Your bylaws may add more, so check them and ask your attorney.',
    },
    {
      q: 'Who keeps the HOA records when a director leaves?',
      a: 'The duties in the text we hold fall on the association, not on one person. Which officer holds each file is a matter for your bylaws and your board.',
    },
    {
      q: 'Do we update the Secretary of State when officers change?',
      a: 'The annual registration lists the chief executive officer, chief financial officer and secretary, and its information must be current when it is executed. Check the names before each filing and ask your attorney whether an earlier correction is wise.',
    },
    {
      q: 'Should the old board share passwords with the new one?',
      a: 'The statute does not address it. As practice, move each account to the new officer rather than passing a shared login, and keep passwords out of printed summaries.',
    },
  ],
  related: [
    'georgia-hoa-records-the-association-must-keep-14-3-1601',
    'georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
    'self-managed-hoa-georgia-first-90-days',
    'georgia-hoa-board-election-and-nominations-checklist',
    'hoa-treasurer-duties',
    'georgia-hoa-secretary-duties-notices-minutes-and-records',
  ],
  hoaDoes: [
    {
      text: 'The board handover checklist covers who has access and which connections one person set up, with a printable summary that has no passwords in it.',
      route: '/settings/handover',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'The Tasks page gathers every action item from your meetings, with an owner and a due date for each.',
      route: '/tasks',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}

export const GA_BOARD_MEETINGS: Guide = {
  slug: 'georgia-hoa-board-meeting-quorum-and-minutes-44-3-228',
  path: '/guides/georgia-hoa-board-meeting-quorum-and-minutes-44-3-228',
  title: 'Georgia HOA board meeting quorum and minutes',
  metaTitle: 'Georgia HOA board quorum and minutes',
  description:
    'What O.C.G.A. 44-3-228 says about a board quorum, what 44-3-231 says about minutes, and the points the text we hold leaves to your bylaws. A plain guide.',
  eyebrow: 'Georgia · Board meetings',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 44-3-228 sets a default quorum for a board meeting: the presence of persons entitled to cast one-half of the votes of the board, unless the instrument or bylaws specify a larger percentage.',
    'Section 44-3-231(d) says the association keeps detailed minutes of all meetings of the members and of the board. The text we hold does not say what must be in them.',
    'The text is silent on how many votes pass a motion, on notice of board meetings and on remote participation. Your bylaws decide those. This is a plain-language guide, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3. A condominium association is under a different article, and a nonprofit corporation also answers to Title 14. Your declaration says which you are.',
      ],
    },
    {
      heading: 'The board quorum',
      body: [
        'The default is one-half of the votes of the board. A larger percentage in the instrument or bylaws replaces it. On a five-seat board with one vote each, that default is half of five votes, so check how your bylaws count the fraction before you rely on a number.',
      ],
      quotes: ['boardQuorum'],
    },
    {
      heading: 'The owner quorum is a different number',
      body: [
        'Do not confuse it with the owners’ meeting. For members, the default is more than one-third of the votes present at the beginning of the meeting, unless the instrument or bylaws provide otherwise.',
      ],
      quotes: ['memberQuorum'],
    },
    {
      heading: 'What the text we hold leaves out',
      body: [
        'It does not say how many of the directors present must vote yes for a motion to pass, whether a director may join by phone or video, whether the board may act by written consent, or how much notice a board meeting needs. The notice periods in § 44-3-230(a) are written for meetings of the members. Your bylaws, and the nonprofit chapter if it applies to you, fill the gaps. Ask your attorney before relying on a vote taken in a way the bylaws do not describe.',
      ],
    },
    {
      heading: 'Minutes are a statutory duty',
      body: [
        'The association keeps detailed minutes of all board meetings and of all member meetings. If you are a nonprofit corporation, the minutes are also permanent records, along with consents and committee actions taken in the board’s place.',
      ],
      quotes: ['powMinutes', 'requiredRecords'],
    },
    {
      heading: 'What to put in them',
      body: [
        'The text says detailed and does not list contents. Practice, not a rule: record the date, time and place, who attended, that a quorum was present and how you counted it, each motion with who moved and seconded and the result, and the follow-up items with a name beside each. Keep opinions and side talk out. Our minutes template is a starting point.',
      ],
    },
    {
      heading: 'Resolutions and outside parties',
      body: [
        'A third party dealing with the association may rely in good faith on a certified resolution of the board. That makes a clear, signed record of the vote worth having when a bank, vendor or lender asks for one.',
      ],
      quotes: ['powResolution'],
    },
    {
      heading: 'Member meeting minutes and the three-year copy',
      body: [
        'For a nonprofit corporation, one list of records the corporation must keep a copy of includes minutes of meetings of members for the past three years. That item speaks of member meetings. How long you keep board minutes beyond what the permanent-records sentence requires is a question for your attorney.',
      ],
      quotes: ['recMinutes3yr'],
    },
  ],
  steps: [
    'Find the quorum, voting and notice provisions for board meetings in your bylaws.',
    'Count directors present at the start of each meeting and write the number down.',
    'Record each motion, who moved and seconded it, and the result.',
    'Draft the minutes soon after the meeting, while memory is fresh, and circulate them for correction.',
    'Approve the minutes at the next meeting and file the signed copy with the permanent records.',
    'If a vendor or lender asks for proof of a board decision, ask your attorney about a certified resolution.',
  ],
  faqs: [
    {
      q: 'What is a quorum for a Georgia HOA board meeting?',
      a: 'Unless the instrument or bylaws specify a larger percentage, the presence of persons entitled to cast one-half of the votes of the board constitutes a quorum for the transaction of business, under § 44-3-228.',
    },
    {
      q: 'Does Georgia law require HOA board minutes?',
      a: 'Section 44-3-231(d) says the association shall keep detailed minutes of all meetings of the members and of the board of directors.',
    },
    {
      q: 'How many votes does it take to pass a motion?',
      a: 'The text we hold does not say. Your bylaws decide, so check them and ask your attorney if they are silent.',
    },
    {
      q: 'Can the board meet by video?',
      a: 'The sections we hold do not address it for board meetings. Check your bylaws and ask your attorney.',
    },
  ],
  related: [
    'hoa-board-meeting-minutes',
    'hoa-board-meeting-agenda',
    'georgia-hoa-board-powers-44-3-231',
    'georgia-hoa-records-the-association-must-keep-14-3-1601',
    'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
    'ai-hoa-meeting-minutes',
  ],
  hoaDoes: [
    {
      text: 'New meeting turns a pasted transcript into draft minutes. The board edits and approves them, and you can write the minutes yourself on the same screen if the AI is offline.',
      route: '/meetings/new',
      release: '2026-10-17-2100-user-guide',
    },
    {
      text: 'Meetings, then Motion log, lists every motion from your minutes with who moved, who seconded and the result, so the board’s decisions are searchable.',
      route: '/meetings/motions',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'The meeting scheduler can insert a standard agenda in one click, with call to order, quorum, minutes, reports, old and new business, and adjourn.',
      route: '/meetings/schedule',
      release: '2026-10-30-1945-receipts-agenda-setup-hub',
    },
  ],
}

export const GA_SECRETARY: Guide = {
  slug: 'georgia-hoa-secretary-duties-notices-minutes-and-records',
  path: '/guides/georgia-hoa-secretary-duties-notices-minutes-and-records',
  title: 'Georgia HOA secretary duties: notices, minutes and records',
  metaTitle: 'Georgia HOA secretary duties and records',
  description:
    'What a Georgia HOA secretary usually handles, and which parts come from the statute: owner notices, minutes, the member list and the state registration.',
  eyebrow: 'Georgia · Board officers',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'The Georgia text we hold does not list a secretary’s duties. The bylaws do. What the statute does is put certain tasks on the association, and in most boards the secretary ends up holding them.',
    'The secretary is named in one place: the annual registration lists the chief executive officer, chief financial officer and secretary. Owners who call a meeting deliver their call to any corporate officer.',
    'Everything below labelled practice is how boards commonly divide the work, not a legal duty. Check your declaration and bylaws, and ask your attorney.',
  ],
  sections: [
    {
      heading: 'Where the secretary’s duties come from',
      body: [
        'Your bylaws describe each office. In the sections we hold, the Act says the board acts through the officers but does not define any office. So start with the bylaws, then see which statutory tasks they place with the secretary.',
      ],
      quotes: ['powBoard'],
    },
    {
      heading: 'Owner notices',
      body: [
        'The Act sets the notice owners receive of meetings: at least 21 days for an annual or regularly scheduled meeting and at least seven days for any other, stating time, place and, for a special meeting, purpose. It also sets how notice is delivered. Practice: the secretary often prepares and sends the notice and keeps proof of mailing.',
      ],
      quotes: ['meetingNotice', 'meetingDelivery'],
    },
    {
      heading: 'Minutes',
      body: [
        'The association keeps detailed minutes of member and board meetings. Practice: the secretary usually takes the notes, drafts the minutes and files the approved copy. The statute does not say who writes them.',
      ],
      quotes: ['powMinutes'],
    },
    {
      heading: 'The member list',
      body: [
        'For a nonprofit corporation, the corporation or its agent keeps a record of members that can produce a list of names and addresses by class with votes. Practice: the secretary often keeps it current as lots sell, and records each owner’s designated notice address.',
      ],
      quotes: ['recMemberList'],
    },
    {
      heading: 'Calls from owners',
      body: [
        'If the association misses its annual meeting, owners holding the required share can call one. Their call is signed, dated and delivered to any corporate officer. Practice: tell the whole board that a call may arrive at any officer, and log the date it was received.',
      ],
      quotes: ['ownerCallForm'],
    },
    {
      heading: 'Copies for owners',
      body: [
        'The Act says copies of the instrument and bylaws are furnished to a lot owner on request, for a reasonable charge. Practice: keep a current copy ready and a note of what the board charges.',
      ],
      quotes: ['copiesOfBylaws'],
    },
    {
      heading: 'Officer names on the state registration',
      body: [
        'The registration names the secretary, and its information must be current when it is executed. Practice: when you take the office, confirm the filing shows your name and address.',
      ],
      quotes: ['annualRegOfficers', 'annualRegCurrent'],
    },
  ],
  steps: [
    'Read the secretary’s section of your bylaws and list what it assigns.',
    'Put the member list, notice addresses and bylaws copy in one place the next secretary can find.',
    'Calendar each notice deadline back from the meeting date, and keep proof of how and when it went out.',
    'Write and file minutes for every meeting.',
    'Tell the board how an owner’s call for a meeting would reach you, and log receipt.',
    'Check the officer names on the next annual registration.',
  ],
  faqs: [
    {
      q: 'What does the Georgia POA Act say a secretary must do?',
      a: 'In the text we hold, it does not define the office or list duties. Your bylaws do.',
    },
    {
      q: 'Who sends the annual meeting notice?',
      a: 'The Act says notice goes to each lot owner at least 21 days ahead. It does not name who sends it. Many boards assign it to the secretary under the bylaws.',
    },
    {
      q: 'Who takes the minutes?',
      a: 'The Act requires detailed minutes. It does not say who writes them, so your bylaws and your board decide.',
    },
    {
      q: 'Does the secretary appear on any state filing?',
      a: 'Yes. The annual registration names the chief executive officer, chief financial officer and secretary.',
    },
  ],
  related: [
    'georgia-hoa-board-transition-checklist',
    'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
    'georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
    'hoa-board-meeting-minutes',
    'georgia-hoa-records-the-association-must-keep-14-3-1601',
    'hoa-treasurer-duties',
  ],
  hoaDoes: [
    {
      text: 'New meeting turns a pasted transcript into draft minutes. The board edits and approves them, and you can write the minutes yourself on the same screen if the AI is offline.',
      route: '/meetings/new',
      release: '2026-10-17-2100-user-guide',
    },
    {
      text: 'The Tasks page gathers every action item from your meetings, with an owner and a due date for each.',
      route: '/tasks',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}
