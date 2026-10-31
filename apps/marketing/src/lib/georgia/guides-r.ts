// SEO batch 18: Florida elections and quorum, California election rules, and
// Florida member meetings and proxies. Statute text only through the quote
// bank (flElect*, flMem*, caElect*), checked word for word by
// georgia-guides.test.ts. Every other sentence restates a quote and adds no
// deadline of its own.
//
// California: docs/research/2026-10-ca-rules-verification.md verifies only
// § 5105(h)(1). The California guide therefore leans on quoted text and says
// plainly that it does not check the rest against other sources.
// Florida: § 720.306 sets no separate candidate notice period and no
// inspector. The Florida guide says so instead of inventing one.
// Product claims: the election planner and print kit (release
// 2026-10-21-1930-elections-compliance) and the meeting quorum kit and proxy
// form (release 2026-10-20-1450-tasks-handover-reserves-cpa-quorum).

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_ELECTIONS: Guide = {
  slug: 'florida-hoa-elections-and-quorum',
  path: '/guides/florida-hoa-elections-and-quorum',
  title: 'Florida HOA elections: quorum, notice, nominations and the ballot',
  metaTitle: 'Florida HOA elections and quorum rules',
  description:
    'What Fla. Stat. 720.306 says about HOA elections: the 30 percent quorum default, 14-day notice, self-nomination, secret ballots and the 60-day challenge.',
  eyebrow: 'Florida · Elections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  state: 'FL',
  summary: [
    'Section 720.306 of the Florida Homeowners’ Association Act sets the default quorum for a members’ meeting at 30 percent of the voting interests, unless the bylaws set a lower number. Notice of a members’ meeting goes out at least 14 days ahead.',
    'Any member may nominate themselves at the meeting where the election is held, unless the process allows advance nominations. If candidates do not outnumber the seats, no election is needed.',
    'The section is short on procedure. It leaves the election steps to your governing documents, and sets a few fixed rules: absentee secret ballots, the plurality winner, a bar on delinquent candidates and a 60-day window to challenge.',
    'This is a plain-language guide to the text we hold, not legal advice. Your bylaws and your attorney decide how it applies to your community.',
  ],
  sections: [
    {
      heading: 'Quorum and the vote needed',
      body: [
        'The statute starts from a default and lets the bylaws lower it. A quorum is the share of voting interests that must be present, in person or by proxy, before the members can act.',
      ],
      quotes: ['flElectQuorum'],
    },
    {
      heading: 'When the election happens, and the notice',
      body: [
        'The election is held at the annual meeting or in conjunction with it, or as the governing documents provide.',
        'For any membership meeting, the bylaws give the notice rule. If they do not, the statute supplies the 14 days and the affidavit. Put the affidavit in the official records the day you send the notice.',
      ],
      quotes: ['flElectAnnual', 'flElectNotice'],
    },
    {
      heading: 'Nominations, and what the statute leaves out',
      body: [
        'Every member is eligible, and a member may nominate themselves at the meeting. If your process takes nominations in advance, the meeting need not reopen them.',
        'This section sets no separate candidate notice period, and it does not require an inspector of elections. Read your bylaws for the nomination deadline and the candidate information packet, if any. We do not hold those documents, so we give no deadline for them.',
      ],
      quotes: ['flElectNominate'],
    },
    {
      heading: 'When no election is needed',
      body: [
        'The statute says an election is required only when more candidates are nominated than there are vacancies. When the candidates are no more than the seats, and nominations from the floor are not required, they simply take their seats, even if the annual meeting has no quorum.',
      ],
      quotes: ['flElectUncontested'],
    },
    {
      heading: 'Absentee secret ballots',
      body: [
        'Absentee voting for directors by secret ballot exists only if the governing documents permit it. When they do, the statute fixes the two-envelope method: the inner envelope is unmarked, and the outer one carries the name, the parcel and the signature.',
      ],
      quotes: ['flElectSecret', 'flElectDuplicate'],
    },
    {
      heading: 'Who wins, and who may run',
      body: [
        'Unless the governing documents say otherwise, the candidates with the most votes win. No majority is needed.',
        'A candidate who owes the association money on the last day to nominate cannot run, and the name stays off the ballot. The statute defines the debt as any fee, fine or other monetary obligation with respect to any parcel. Check the date against the nomination deadline in your bylaws.',
      ],
      quotes: ['flElectPlurality', 'flElectDelinq'],
    },
    {
      heading: 'Disputes and fraud',
      body: [
        'An election dispute goes to binding arbitration with the state division or to a court. Section 720.3065 separately makes fraudulent voting a crime. Among its acts is changing a ballot to stop a member from voting as intended.',
      ],
      quotes: ['flElectDispute', 'flElectFraud'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only, not condominiums under chapter 718, and not your bylaws. We say nothing about recall votes, which sit in § 720.303(10). Check the current text before the board relies on a date.',
      ],
    },
  ],
  steps: [
    'Read your bylaws for the quorum, the nomination method and any advance deadline. Note whether they allow absentee secret ballots.',
    'Set the meeting date and work back at least 14 days for the notice. Sign and file the affidavit of mailing among the official records.',
    'Check each nominee against the delinquency rule on the last day to nominate, and keep a note of what you found.',
    'If candidates do not outnumber the seats and floor nominations are not required, seat them and record it.',
    'If the bylaws allow absentee secret ballots, use inner and outer envelopes, check the outer envelope, and set aside duplicates and late ballots.',
    'Count the votes, declare the plurality winners, and write the date results were announced in the minutes.',
    'Keep the ballots and envelopes for at least the 60-day challenge window.',
  ],
  faqs: [
    {
      q: 'What is the quorum for a Florida HOA members’ meeting?',
      a: 'Under § 720.306(1)(a), 30 percent of the total voting interests, unless the bylaws provide a lower number.',
    },
    {
      q: 'How much notice does a Florida HOA annual meeting need?',
      a: 'Under § 720.306(5), if the bylaws do not say, notice must be mailed, delivered or electronically transmitted not less than 14 days before the meeting, with an affidavit filed in the official records.',
    },
    {
      q: 'Can a Florida HOA member nominate themselves?',
      a: 'Yes. A member may nominate themselves at the meeting where the election is held, unless the process allows nominations in advance of the meeting.',
    },
    {
      q: 'Can an owner who is behind on dues run for the board?',
      a: 'Not if they are delinquent in any fee, fine or other monetary obligation on the day they could last nominate, under § 720.306(9)(b).',
    },
    {
      q: 'How long do members have to challenge an election?',
      a: 'Any challenge to the election process must be commenced within 60 days after the results are announced.',
    },
  ],
  related: [
    'florida-hoa-board-meeting-notice-rules',
    'florida-hoa-director-certification-checklist',
    'florida-hoa-member-meetings-proxies-and-recording',
    'georgia-hoa-written-ballots-without-a-meeting',
  ],
  hoaDoes: [
    {
      text: 'The election planner works back from the meeting date to set the dates for a paper board election, and prints ballots that never name the voter, envelope labels and a tellers’ tally sheet.',
      route: '/meetings/[id]/election',
      release: '2026-10-21-1930-elections-compliance',
    },
    {
      text: 'The meeting quorum kit counts members present and proxies live, so the board can see the figure a vote needs before it starts.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not hold your bylaws, mail your notice, run an online vote or decide who is delinquent on the nomination date. Keep your own calendar and the signed affidavit.',
}

export const CA_ELECTIONS: Guide = {
  slug: 'california-hoa-election-rules',
  path: '/guides/california-hoa-election-rules',
  title: 'California HOA elections: nominations, the inspector and the right to vote',
  metaTitle: 'California HOA election rules',
  description:
    'What California Civil Code 5100 to 5145 say about HOA elections: secret ballots, nominations, the independent inspector and a member’s right to a ballot.',
  eyebrow: 'California · Elections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  state: 'CA',
  summary: [
    'California runs HOA elections under a dedicated article of the Davis-Stirling Act, Civil Code sections 5100 to 5145. It applies by secret ballot to director elections, assessment votes and amendments, whatever the governing documents say.',
    'An independent inspector or inspectors of elections run the vote. A candidate must be able to nominate themselves. Unpaid assessments can bar a candidate in some cases, but the rules must not deny a ballot to a member for any reason other than not being a member.',
    'This is a plain-language guide to the quoted text, not legal advice. Every statement below is taken from the quotes on the page. Your attorney decides how it applies to your association.',
  ],
  sections: [
    {
      heading: 'What the article covers',
      body: [
        'Section 5100 puts four kinds of vote under the secret ballot procedures. A director seat must come up for election when its term ends and at least once every four years.',
      ],
      quotes: ['caElectScope', 'caElectFourYear'],
    },
    {
      heading: 'Nominations',
      body: [
        'Section 5105(a)(3) tells the association to write operating rules for nominations. One limit is stated in the text: no procedure counts as reasonable if it stops a member from nominating themselves.',
        'Section 5115(a) adds a general notice. It must go out at least 30 days before any nomination deadline, with individual notice on request.',
      ],
      quotes: ['caElectNominate', 'caElectNomNotice'],
    },
    {
      heading: 'Unpaid assessments and candidates',
      body: [
        'The text separates two kinds of debt. An association may bar a nominee for unpaid regular and special assessments, but not for fines, late charges or similar amounts.',
        'Even for assessments, the bar does not apply to a nominee who paid under protest, or who is in compliance with a payment plan.',
      ],
      quotes: ['caElectAssessCand', 'caElectProtest', 'caElectPlan'],
    },
    {
      heading: 'A member cannot lose the ballot for unpaid assessments',
      body: [
        'Section 5105(h) says the election rules must prohibit denying a ballot to a member. The text names one reason only: not being a member when ballots are distributed. Unpaid assessments are not on that list, so the rules cannot take a member’s vote away for them.',
        'Being barred as a candidate is a different question from voting. The two rules sit in different subdivisions.',
      ],
      quotes: ['caElectBallotLead', 'caElectBallotRight'],
    },
    {
      heading: 'The inspector of elections',
      body: [
        'The association selects the inspector or inspectors. The text sets the number at one or three, and requires them to be independent third parties.',
        'The quoted independence rule bars directors, candidates and their relatives. The inspector also hears challenges about the right to vote. Read the full section for the other limits on who qualifies.',
      ],
      quotes: ['caElectInspector', 'caElectIndep', 'caElectInspChallenge'],
    },
    {
      heading: 'Ballots, counting and results',
      body: [
        'A ballot may not carry the voter’s name, address or unit number. Counting is done by the inspector in public at a properly noticed open meeting, and any candidate or member may watch.',
        'The board must give general notice of the tabulated results within 15 days.',
      ],
      quotes: ['caElectBallotMail', 'caElectCount', 'caElectResults'],
    },
    {
      heading: 'If a member challenges the result',
      body: [
        'A member may sue for a violation of the article. The text sets a one-year window, running from the notice of results or when the claim arises, whichever is later.',
      ],
      quotes: ['caElectChallenge'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We quote only the sections named here. The article has more rules: acclamation, proxies, electronic ballots, quorum for a reconvened meeting and who keeps the ballots. Read the full text before the board relies on a date, and ask your attorney.',
      ],
    },
  ],
  steps: [
    'Confirm that your election operating rules exist and let any member nominate themselves.',
    'Send the general notice of the nomination procedure and deadline at least 30 days before the deadline.',
    'Appoint one or three independent inspectors, and check that none is a director, a candidate or related to either.',
    'Check any assessment-based bar against the protest and payment plan exceptions before you disqualify a nominee.',
    'Issue a ballot to every member entitled to one. Do not hold one back over unpaid assessments.',
    'Let the inspector count in public at a noticed meeting, then record the results in the minutes.',
    'Give general notice of the results within 15 days, and keep the election records.',
  ],
  faqs: [
    {
      q: 'Can a California HOA take away a member’s vote for unpaid assessments?',
      a: 'The election rules must prohibit denying a ballot for any reason other than not being a member when ballots are distributed. Section 5105(h)(1) names no other reason.',
    },
    {
      q: 'Can unpaid assessments stop someone from running?',
      a: 'An association may disqualify a nominee for unpaid regular or special assessments, but not for fines or late charges, and not if the person paid under protest or is in a payment plan.',
    },
    {
      q: 'How many inspectors of elections does a California HOA use?',
      a: 'One or three independent third parties, selected under § 5110(a).',
    },
    {
      q: 'Can a member nominate themselves?',
      a: 'A procedure is not reasonable if it disallows any member from nominating themself for election to the board.',
    },
    {
      q: 'How long does a member have to sue over an election?',
      a: 'The text gives one year from the notice of results or when the claim accrues, whichever is later.',
    },
  ],
  related: [
    'california-hoa-internal-dispute-resolution',
    'california-hoa-records-inspection-rules',
    'california-hoa-fine-hearing-and-penalty-rules',
    'florida-hoa-elections-and-quorum',
  ],
  hoaDoes: [
    {
      text: 'The election planner works back from the meeting date to set the dates for a paper board election, and prints ballots that never name the voter, envelope labels and an inspector record for California.',
      route: '/meetings/[id]/election',
      release: '2026-10-21-1930-elections-compliance',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not appoint your inspector, count the ballots or run an online vote. It does not tell you whether a nominee can be disqualified; that is the board’s call with your attorney.',
}

export const FL_MEMBER_MEETINGS: Guide = {
  slug: 'florida-hoa-member-meetings-proxies-and-recording',
  path: '/guides/florida-hoa-member-meetings-proxies-and-recording',
  title: 'Florida HOA member meetings: special meetings, speaking time, proxies and recording',
  metaTitle: 'Florida HOA member meetings and proxies',
  description:
    'What Fla. Stat. 720.306 says about Florida HOA member meetings: calling a special meeting, 3 minutes to speak, how a proxy is valid, adjournment and recording.',
  eyebrow: 'Florida · Member meetings',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  state: 'FL',
  summary: [
    'Section 720.306 also governs meetings of the members, as opposed to the board. A special meeting can be called by the board or by owners with at least 10 percent of the voting interests, unless the governing documents set a different percentage.',
    'Every member may speak for at least 3 minutes on an item, a proxy is valid only if it meets the dated and signed test, and any owner may record a members’ meeting.',
    'This is a plain-language guide to the text we hold, not legal advice. Your bylaws and your attorney decide how it applies to your community.',
  ],
  sections: [
    {
      heading: 'Calling a special meeting',
      body: [
        'The board can call one. So can the members: unless the governing documents state another percentage, 10 percent of the total voting interests is enough.',
        'Business at a special meeting is limited to what the notice describes, so draft the notice with care.',
      ],
      quotes: ['flMemSpecial'],
    },
    {
      heading: 'What the notice must say',
      body: [
        'Notice of a members’ meeting goes out at least 14 days ahead, with an affidavit in the official records. The purpose rule differs by type: an annual meeting notice need not describe its purpose unless law or the documents require it, while a special meeting notice must.',
      ],
      quotes: ['flElectNotice', 'flMemContent'],
    },
    {
      heading: 'Three minutes to speak',
      body: [
        'Members have the right to speak on any item. The statute sets a floor of 3 minutes, and it overrides contrary governing documents or rules.',
        'The association may still write reasonable rules on how often, how long and in what manner owners speak, so long as they fit the subsection. A rule that cuts below 3 minutes does not.',
      ],
      quotes: ['flMemSpeak', 'flMemSpeakRules'],
    },
    {
      heading: 'Adjourning and reconvening',
      body: [
        'If a meeting moves to another date, time or place, the chair announces it before adjourning or the association gives notice of the new details. Business that could have been done on the original date may be done at the adjourned meeting.',
      ],
      quotes: ['flMemAdjourn'],
    },
    {
      heading: 'When a proxy is valid',
      body: [
        'Members may vote in person or by proxy unless the statute or governing documents provide otherwise. A proxy has to pass the three-part test in the statute: dated, naming the meeting, and signed.',
        'A proxy is good for one meeting and its adjournments, expires 90 days after that meeting, and can be revoked at any time by the person who gave it.',
      ],
      quotes: ['flMemProxyValid', 'flMemProxyEffect'],
    },
    {
      heading: 'Recording',
      body: [
        'Any parcel owner may tape record or videotape board and members’ meetings. The board may adopt reasonable rules about how.',
      ],
      quotes: ['flMemRecord'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only. Board meetings fall under § 720.303(2), covered in our board meeting notice guide. We do not hold your bylaws, which may set a longer notice, a different quorum or limits on proxies.',
      ],
    },
  ],
  steps: [
    'Decide whether the meeting is annual or special, and write the purpose into the notice if it is special.',
    'Send notice at least 14 days ahead, and file the affidavit among the official records.',
    'Check every proxy for a date, the meeting date, time and place, and the signature. Reject any that fail.',
    'Set speaking rules in writing, and keep them at or above 3 minutes per item.',
    'If the meeting adjourns, announce the new date, time and place before you close.',
    'Let owners record the meeting, and keep your own minutes anyway.',
  ],
  faqs: [
    {
      q: 'How many owners can call a Florida HOA special meeting?',
      a: 'At least 10 percent of the total voting interests, unless the governing documents state a different percentage.',
    },
    {
      q: 'How long can an owner speak at a Florida HOA members’ meeting?',
      a: 'At least 3 minutes on any item, even if the governing documents or rules say less.',
    },
    {
      q: 'How long does a Florida HOA proxy last?',
      a: 'It is effective only for the meeting it was given for, and expires 90 days after that meeting. The owner can revoke it at any time.',
    },
    {
      q: 'Can an owner record an HOA members’ meeting?',
      a: 'Yes. Any parcel owner may tape record or videotape meetings of the members and of the board.',
    },
  ],
  related: [
    'florida-hoa-elections-and-quorum',
    'florida-hoa-board-meeting-notice-rules',
    'florida-hoa-official-records-inspection',
    'hoa-board-meeting-minutes',
  ],
  hoaDoes: [
    {
      text: 'The meeting quorum kit counts members present and proxies live, shows the Florida 30 percent default, and prints a proxy form with the dated, signed and 90-day clauses.',
      route: '/meetings/[id]/quorum/proxies',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not send your members’ meeting notice for you or decide whether a proxy is valid. The board checks each one.',
}
