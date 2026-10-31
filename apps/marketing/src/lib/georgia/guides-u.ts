// SEO batch 21: Texas ballots, Tex. Prop. Code § 209.0058.
// Statute text only through the quote bank (txBallot*), checked word for word by
// georgia-guides.test.ts against tcss-pr209-2026-excerpt.htm. That excerpt prints
// subsections (a) and (d) twice, once per amending act (S.B. 864 and S.B. 1168).
// This page quotes the S.B. 1168 forms only and says so; it does not choose
// between the two acts or explain which governs.
// Product claim: the election planner prints ballots that never name the voter
// (release 2026-10-21-1930-elections-compliance). STATE_COVERAGE lists no Texas
// election support, and § 209.0058(a) requires a signed ballot in a board
// election, so the page says plainly that Texas ballots are not built in.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const TX_BALLOTS: Guide = {
  slug: 'texas-hoa-written-ballots-209-0058',
  path: '/guides/texas-hoa-written-ballots-209-0058',
  state: 'TX',
  title: 'Texas HOA written ballots: Property Code § 209.0058',
  metaTitle: 'Texas HOA written ballots and secret ballots',
  description:
    'What Tex. Prop. Code 209.0058 says about written and signed ballots in a Texas HOA vote, secret ballots, electronic votes and uncontested races.',
  eyebrow: 'Texas · Voting',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 209.0058 of the Texas Property Code is about ballots. For the votes it lists, including a vote outside of a meeting and an election to fill a board position, the ballot must be in writing and signed by the member.',
    'The section also lets an association adopt rules for secret ballots, says electronic votes under § 209.00592 count as written and signed ballots, and says signed ballots are not required for uncontested races.',
    'The official text we hold prints subsections (a) and (d) twice, once for each of two 2015 amending acts. This page quotes the S.B. 1168 form of each and does not decide how the two fit together. Your attorney should.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which version of the text this page uses',
      body: [
        'The excerpt of chapter 209 we hold shows § 209.0058 with two versions of subsection (a) and two of subsection (d). Each is labelled with the act that amended it: S.B. 864 and S.B. 1168, both from the 2015 session. They are not the same text.',
        'This page quotes the S.B. 1168 form of (a) and (d), and the single printed text of (a-1), (b) and (c). We do not know from the excerpt how the two acts are reconciled in the current code, so check the current statute and ask your attorney before the board relies on any of this.',
      ],
    },
    {
      heading: 'When the ballot must be written and signed',
      body: [
        'The S.B. 1168 form of subsection (a) names five situations. If a member casts a vote in any of them, the vote must be in writing and signed by the member. The opening words make an exception for subsection (d), which is the secret ballot rule covered below.',
        'Read the list as it is written. It reaches a vote cast outside of a meeting, an election to fill a position on the board, a proposed adoption or amendment of a dedicatory instrument, a proposed increase in a regular assessment or the proposed adoption of a special assessment, and a proposed removal of a board member.',
      ],
      quotes: ['txBallotSigned'],
    },
    {
      heading: 'Other matters',
      body: [
        'Subsection (a-1) covers a ballot on a matter that is not on the list in (a). It speaks only to an association that elects to use a ballot. For that ballot there are two forms: in writing and signed by the member, or cast by secret ballot under subsection (d).',
      ],
      quotes: ['txBallotOther'],
    },
    {
      heading: 'Electronic votes',
      body: [
        'Subsection (b) says electronic votes cast under Section 209.00592 constitute written and signed ballots. That section is not in the text we hold. We do not describe what it requires or how an electronic vote is cast, so a board that wants to vote online should read § 209.00592 with its attorney.',
      ],
      quotes: ['txBallotElectronic'],
    },
    {
      heading: 'Uncontested races',
      body: [
        'Subsection (c) is short. In an association election, written and signed ballots are not required for uncontested races. It says nothing more than that, so it does not tell you how the association records the result of such a race or whether a notice is needed.',
      ],
      quotes: ['txBallotUncontested'],
    },
    {
      heading: 'Secret ballots and counting observers',
      body: [
        'Subsection (d) lets an association adopt rules to allow voting by secret ballot by association members. If it does, it must take measures to reasonably ensure three things: that a member cannot cast more votes than the member is eligible to cast, that the association counts each vote the member is eligible to cast, and that in any board election each candidate may name one person to observe the counting.',
        'The text limits what an observer sees. It does not entitle an observer to see the name of the person who cast any ballot, and a disruptive observer may be removed. The text speaks of the association adopting rules, so look at how your association adopts and records its own.',
        'The S.B. 864 form of (d) has the first two measures but not the observer provision. That is another reason to confirm which text applies before you rely on the observer rule.',
      ],
      quotes: ['txBallotSecret'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold § 209.0058 and not § 209.00592, so we say nothing about how an electronic vote works. We do not describe the notice a vote needs, the quorum or percentage that passes a measure, how a ballot is delivered or returned, or what happens to a ballot that is unsigned. The text we hold does not answer those questions, and we have not filled them in from other sources.',
        'We also do not say which of the two 2015 acts governs where they differ. The official excerpt prints both, and we quote one.',
      ],
    },
  ],
  steps: [
    'Write down the vote the board is planning: a board election, a rule or declaration change, an assessment increase, a removal, or something else.',
    'Check the vote against the list in subsection (a). If it is on the list, plan for a written ballot signed by the member.',
    'If the vote is not on the list and you will use a ballot, choose between a signed written ballot and a secret ballot under subsection (d).',
    'If the board wants secret ballots, look at your association rules and have your attorney confirm they are adopted the way the text asks.',
    'For an online vote, read § 209.00592 with your attorney before you set one up.',
    'Keep the ballots and the count with the rest of the election record.',
  ],
  faqs: [
    {
      q: 'Does a Texas HOA board election need a written, signed ballot?',
      a: 'Under the S.B. 1168 form of § 209.0058(a), a vote cast in an election to fill a position on the board must be in writing and signed by the member, subject to subsection (d). Subsection (c) says signed ballots are not required for uncontested races.',
    },
    {
      q: 'Can a Texas HOA use secret ballots?',
      a: 'Subsection (d) says an association may adopt rules to allow voting by secret ballot by association members, and it lists the measures the association must take.',
    },
    {
      q: 'Do electronic votes count?',
      a: 'Subsection (b) says electronic votes cast under Section 209.00592 constitute written and signed ballots. We do not hold that section, so we do not describe how it works.',
    },
    {
      q: 'Why does the page quote one version of subsection (a)?',
      a: 'The official excerpt prints subsection (a) twice, once for each of two 2015 amending acts. We quote the S.B. 1168 form and tell you to check the current text with your attorney.',
    },
    {
      q: 'Does the statute set a quorum or a passing percentage?',
      a: 'Not in the text we hold of this section. Section 209.0058 is about the form of the ballot, so check your governing documents and your attorney for those figures.',
    },
  ],
  related: [
    'texas-hoa-violation-notice-and-hearing-209-006',
    'georgia-hoa-written-ballots-without-a-meeting',
    'california-hoa-election-rules',
    'florida-hoa-elections-and-quorum',
    'texas-hoa-third-party-collections-notice',
  ],
  hoaDoes: [
    {
      text: 'The election planner sets dates for a paper board election and prints ballots that never name the voter, envelope labels and a tellers’ tally sheet.',
      route: '/meetings/[id]/election',
      release: '2026-10-21-1930-elections-compliance',
    },
  ],
  hoaDoesNot:
    'Texas ballots are not built into HomeownerHub. Texas coverage today is the resale certificate and collections letters. The election planner’s printed ballots do not name the voter, and subsection (a) calls for a ballot signed by the member for the votes it lists, so do not assume the print kit fits a Texas vote. HomeownerHub does not run an electronic vote, adopt your secret ballot rules or count ballots. Use your attorney’s forms.',
}
