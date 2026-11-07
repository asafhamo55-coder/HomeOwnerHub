// SEO batch 26: three Georgia guides on the Property Owners' Association Act.
//   1. Co-owners and votes: who casts the vote for a lot with more than one owner (44-3-224(a)).
//   2. Owners calling the annual meeting when the board does not (44-3-230(b)).
//   3. The duty to follow the rules, the remedies and the limits on suspensions (44-3-223).
// Statute text only through the quote bank (voteOneOwner, voteJoint*, ownerCall*, comply*,
// reasonableRules, injunctNotice, fineAuth, lotProxy, meetingAnnual), checked word for word by
// georgia-guides.test.ts against ga-ocga-44-3-art6-2026.txt. Every other sentence restates a
// quote and adds no rule. Product claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-04'

export const GA_JOINT_OWNER_VOTES: Guide = {
  slug: 'georgia-hoa-joint-owners-voting-44-3-224',
  path: '/guides/georgia-hoa-joint-owners-voting-44-3-224',
  title: 'Who casts the vote when a Georgia HOA lot has two owners? (§ 44-3-224)',
  metaTitle: 'Georgia HOA: joint owners and one vote',
  description:
    'Georgia 44-3-224 says what happens when a lot has more than one owner: one owner present can vote, two present need to agree, and silence counts as consent.',
  eyebrow: 'Georgia · Voting',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Some lots have more than one owner, such as a couple, siblings or other co-owners. Section 44-3-224(a) of the Georgia Property Owners’ Association Act says who casts them.',
    'If only one of the owners is present, or is voting by proxy, ballot or written consent, that person casts the votes for the lot.',
    'If more than one owner is present or executes a proxy, ballot or written consent, the vote must follow their unanimous agreement, unless the instrument expressly says otherwise.',
    'Consent is conclusively presumed if one owner purports to cast the vote and no other owner protests right away to the person presiding. This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'One owner shows up',
      body: [
        'Many lots are owned by more than one person. Subsection (a) begins with that fact, and then gives the easy case: when only one of those persons is present, or is voting by proxy, ballot or written consent, that person casts the votes for the lot.',
        'The text does not ask for the other owners to approve in that case.',
      ],
      quotes: ['voteOneOwner'],
    },
    {
      heading: 'More than one owner shows up',
      body: [
        'The next sentence covers the harder case. When more than one of the owners is present, or more than one executes a proxy, ballot or written consent, the vote for the lot is cast only in accordance with their unanimous agreement.',
        'There is one carve-out. The declaration or bylaws can expressly provide something else, so read them before you tell two co-owners that they must agree.',
      ],
      quotes: ['voteJointUnanimous'],
    },
    {
      heading: 'When one owner votes and the other says nothing',
      body: [
        'The last part of the subsection says consent is conclusively presumed if any one of the owners purports to cast the votes for the lot, unless another owner makes a protest immediately to the person presiding over the meeting or vote.',
        'For a meeting, that means the chair should be ready to hear an objection at the moment the vote is cast. The text says “immediately.” It does not say what counts as immediate if the vote is by mail, and it does not describe how a protest is recorded. Ask your attorney about those points.',
      ],
      quotes: ['voteJointPresumed'],
    },
    {
      heading: 'Proxies for a lot with several owners',
      body: [
        'Subsection (b) deals with proxies. A proxy for a lot owned by more than one person is executed by or on behalf of the joint owners. Our guide on quorum and proxies covers the rest of that subsection, including when a proxy is void.',
      ],
      quotes: ['lotProxy'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'This guide applies only if your association is under the Georgia Property Owners’ Association Act, which an older declaration reaches only if it elects the Act. Our guide on whether the Act applies explains how to check.',
        'We do not say what your declaration or bylaws provide about co-owners, and we do not say how a court would treat a disputed vote. We also do not cover how the Act counts votes for a lot owned by a company or a trust.',
      ],
    },
  ],
  steps: [
    'Check your declaration and bylaws for any wording on how co-owners vote.',
    'Write down, on your attendance sheet or ballot, the name of every owner of record for each lot.',
    'Make sure the person presiding knows that a co-owner’s protest should be heard when the vote is cast.',
    'If two co-owners are present and disagree, remember that the text says the vote is cast only by their unanimous agreement unless the instrument expressly provides otherwise, and ask your attorney how your documents handle a split.',
    'Record in the minutes which owner cast the votes for a lot and whether anyone protested.',
    'Ask your attorney before you rely on this page in a close or disputed vote.',
  ],
  faqs: [
    {
      q: 'If a husband and wife own a lot in Georgia, can one of them vote for the HOA?',
      a: 'Under § 44-3-224(a), if only one of them is present, or is voting by proxy, ballot or written consent, that person casts the votes for the lot. If both are present, the vote follows their unanimous agreement unless the instrument expressly provides otherwise.',
    },
    {
      q: 'What if two co-owners disagree on how to vote?',
      a: 'When more than one is present, the statute says the vote is cast only in accordance with their unanimous agreement unless the instrument expressly provides otherwise. Ask your attorney how to handle a split in your association.',
    },
    {
      q: 'Does the other owner have to join in the ballot?',
      a: 'The statute does not say a second owner must always join in. It says consent is conclusively presumed if one owner casts the vote and no other owner protests immediately to the person presiding.',
    },
    {
      q: 'Can the declaration change this rule?',
      a: 'For the unanimous-agreement rule, yes. The text says “unless the instrument expressly provides otherwise.” Read your declaration and bylaws.',
    },
    {
      q: 'Does a lot with two owners get two votes?',
      a: 'The text speaks of “the votes pertaining to that lot.” Check your declaration for how many votes each lot carries.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'annual-meeting-quorum-proxies',
    'georgia-hoa-written-ballots-without-a-meeting',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'georgia-hoa-act-definitions-44-3-221',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide how a disputed vote counts or what your declaration says about co-owners. Your attorney answers legal questions about a vote.',
}

export const GA_OWNERS_CALL_MEETING: Guide = {
  slug: 'georgia-hoa-owners-call-annual-meeting-44-3-230',
  path: '/guides/georgia-hoa-owners-call-annual-meeting-44-3-230',
  title: 'What if the Georgia HOA board never holds an annual meeting? Owners can call one (§ 44-3-230(b))',
  metaTitle: 'Georgia HOA: owners call the annual meeting',
  description:
    'Georgia 44-3-230(b) lets owners holding at least 5 percent of the votes call the annual meeting when the HOA misses its fiscal year, with a dated written call.',
  eyebrow: 'Georgia · Annual meeting',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Georgia law says the members of an association must meet at least once a year. Subsection (b) of § 44-3-230 covers what happens when the association does not hold the annual meeting on or before the last day of its fiscal year.',
    'In that case the meeting may be called by the holders of at least 5 percent of the voting power, or another amount set in the articles or bylaws. The articles or bylaws cannot require more than 25 percent.',
    'The call must carry the holders’ signatures and a date, be delivered to any corporate officer, state one or more demands and describe the purpose of the meeting.',
    'A board that keeps its meeting calendar is never in this spot. This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'The yearly meeting is not optional',
      body: [
        'Subsection (a) says meetings of the members are held under the bylaws and in any event are called not less frequently than annually. Subsection (b) is what owners can use when that does not happen.',
      ],
      quotes: ['meetingAnnual'],
    },
    {
      heading: 'When owners can step in',
      body: [
        'The statute’s condition is a missed deadline: the association has failed to hold the annual meeting on or before the last day of its fiscal year. Until that condition is met, this subsection does not give owners the right to call the meeting.',
        'After that date, the holders of at least 5 percent of the voting power may call the meeting. The articles or bylaws can set a different amount, but not more than 25 percent as a minimum.',
        'So the number to look up is in your own articles and bylaws. If they are silent, the text gives 5 percent.',
      ],
      quotes: ['ownerCallMeeting'],
    },
    {
      heading: 'What the call has to look like',
      body: [
        'The text sets the form of the call. It carries the holders’ signatures and a date. It is delivered to any corporate officer of the association. It includes one or more demands, and it is sent in writing or by electronic transmission. It describes the purpose or purposes of the meeting.',
        'For a board, the practical point is that an officer who receives a call like this should log the date it arrives and give it to the whole board and the attorney.',
      ],
      quotes: ['ownerCallForm'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'This guide applies only if your association is under the Georgia Property Owners’ Association Act, which an older declaration reaches only if it elects the Act. Our guide on whether the Act applies explains how to check.',
        'The subsection does not say how many days the board has to schedule the meeting after the call arrives, and we do not say. It does not say who runs the meeting. For notice to members once a meeting is set, see our guide on annual meetings, quorum and proxies, and ask your attorney which rules apply to a meeting called this way.',
      ],
    },
  ],
  steps: [
    'Look at the date your fiscal year ends in the bylaws, and set the annual meeting well before it.',
    'Find the percentage of the voting power your articles or bylaws require for owners to call a meeting.',
    'If an owner group sends a call, record the date an officer receives it.',
    'Check that the call carries the holders’ signatures and a date, is in writing or electronic, states demands and describes the purpose.',
    'Send the call to the full board and to your attorney the same day.',
    'Give members notice of the meeting as your bylaws and the Act require.',
  ],
  faqs: [
    {
      q: 'Can Georgia HOA members force an annual meeting?',
      a: 'Under § 44-3-230(b), if the association fails to hold an annual meeting on or before the last day of its fiscal year, the meeting may be called by the holders of at least 5 percent of the voting power, or the amount the articles or bylaws specify, up to 25 percent.',
    },
    {
      q: 'How many owners does it take to call a meeting?',
      a: 'At least 5 percent of the voting power, or another amount in the articles or bylaws that is no more than 25 percent as a minimum.',
    },
    {
      q: 'Who receives the call?',
      a: 'The text says the call is delivered to any corporate officer of the association.',
    },
    {
      q: 'What must the call say?',
      a: 'It must carry the holders’ signatures and a date, be in writing or by electronic transmission, include one or more demands and describe the purpose or purposes of the meeting.',
    },
    {
      q: 'How soon must the board hold the meeting?',
      a: 'The subsection does not give a number of days. Ask your attorney and check your bylaws.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'annual-meeting-quorum-proxies',
    'georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
    'georgia-hoa-joint-owners-voting-44-3-224',
    'georgia-hoa-written-ballots-without-a-meeting',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not call or run your annual meeting for you and does not decide whether an owners’ call is valid. Your attorney answers legal questions about a call.',
}

export const GA_OWNER_COMPLIANCE: Guide = {
  slug: 'georgia-hoa-owner-compliance-and-remedies-44-3-223',
  path: '/guides/georgia-hoa-owner-compliance-and-remedies-44-3-223',
  title: 'What a Georgia HOA can do when an owner breaks the rules (§ 44-3-223)',
  metaTitle: 'Georgia HOA: remedies for rule violations',
  description:
    'Georgia 44-3-223 says owners must follow the declaration and reasonable rules, lists the remedies, and sets limits on fines, suspensions and injunction notice.',
  eyebrow: 'Georgia · Compliance and remedies',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 44-3-223 of the Georgia Property Owners’ Association Act puts the duty on owners and everyone entitled to occupy a lot: follow the lawful provisions of the instrument, and follow the reasonable rules the association has adopted and provided to owners.',
    'Not complying is grounds for an action to recover sums due, for damages, for injunctive relief or for any other remedy at law or in equity. The association can bring it, and in a proper case aggrieved owners can too.',
    'For an injunction, the association gives the notice the instrument sets, or ten days’ written notice if the instrument is silent, with two exceptions for danger and for cases that would become moot.',
    'Fines and suspensions are allowed only if and to the extent the instrument provides, and a suspension cannot block access to the lot. This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'The duty to comply',
      body: [
        'The first sentence is short. Every lot owner, and all those entitled to occupy a lot, must comply with all lawful provisions of the instrument. That reaches everyone entitled to occupy a lot, not only the person on the deed.',
      ],
      quotes: ['complyDuty'],
    },
    {
      heading: 'Rules count too, if owners have them',
      body: [
        'Owners and occupants must also comply with reasonable rules adopted by the association under the instrument, and with the lawful provisions of the bylaws. The text says the rules must have been provided to the lot owners.',
        'Our guide on fines and hearings covers how to deliver a notice.',
      ],
      quotes: ['reasonableRules'],
    },
    {
      heading: 'The remedies the section lists',
      body: [
        'Any lack of compliance is grounds for an action to recover sums due, for damages, for injunctive relief or for any other remedy available at law or in equity. The association can bring the action. In a proper case, one or more aggrieved owners can bring it on their own behalf or as a class action.',
        'The section lists these as available grounds. It does not tell a board which one to choose, and it does not say that a board must sue.',
      ],
      quotes: ['complyRemedies'],
    },
    {
      heading: 'Notice before an injunction',
      body: [
        'To seek an injunction, the association first gives notice under the instrument, or ten days’ written notice if the instrument says nothing. It does not have to try other remedies first.',
        'Two situations skip the notice: a violation that presents a clear and imminent danger to life, person or property, and one where the injunction would become moot before the notice period ran out.',
      ],
      quotes: ['injunctNotice'],
    },
    {
      heading: 'Fines and suspensions come from the instrument',
      body: [
        'The association may impose fines, suspend voting rights temporarily for unpaid regular and special assessments, and suspend use of certain common areas and services, but only if and to the extent the instrument provides.',
        'The proviso sets two limits. A suspension cannot deny an owner or occupant access to the lot, and it cannot take away the right to vote in board elections because of unpaid fines. Fines do not impact voting rights.',
      ],
      quotes: ['fineAuth'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'This guide applies only if your association is under the Georgia Property Owners’ Association Act, which an older declaration reaches only if it elects the Act. Our guide on whether the Act applies explains how to check.',
        'We do not say which remedy to use, how large a fine can be, or whether your instrument allows fines or suspensions. Georgia’s SB 406 adds a separate limit: its registration provisions take effect January 1, 2027, and under them, with limited exceptions, an association that is not registered may not collect fines or fees. We cover that in a separate guide. We do not give legal advice on a particular violation.',
      ],
    },
  ],
  steps: [
    'Read the part of your declaration that lets the board fine or suspend, and what it requires first.',
    'Confirm that the rule you want to enforce was adopted under the instrument and sent to every owner.',
    'Send the written notice your instrument calls for. If it is silent and you may seek an injunction, send ten days’ written notice.',
    'Keep a copy of the notice and a record of how and when it was delivered.',
    'Do not suspend access to the lot, or voting in board elections for unpaid fines.',
    'Talk to your attorney before you file anything or fine anyone.',
  ],
  faqs: [
    {
      q: 'Does a Georgia HOA have to give notice before seeking an injunction?',
      a: 'Section 44-3-223 requires notice before seeking an injunction: the notice the instrument sets, or ten days’ written notice if it is silent, with exceptions for imminent danger and for cases that would become moot. Ask your attorney about any other steps your documents require.',
    },
    {
      q: 'Can an HOA fine an owner in Georgia?',
      a: 'If and to the extent the instrument provides. The section says the association is empowered to impose and assess fines in that case, and fines shall not impact voting rights.',
    },
    {
      q: 'Can the board cut off an owner’s access to their house?',
      a: 'No. The section says no suspension shall deny any lot owner or occupants access to the lot owned or occupied.',
    },
    {
      q: 'Can an owner lose the right to vote for unpaid fines?',
      a: 'The section says no suspension shall deny the right to vote in board elections based on failure to pay outstanding fines. It does allow a temporary suspension of voting rights for failure to pay regular and special assessments, if the instrument provides.',
    },
    {
      q: 'Can owners sue each other or the association over rule violations?',
      a: 'The text says an action is maintainable by the association or, in any proper case, by one or more aggrieved lot owners on their own behalf or as a class action. Ask your attorney whether your facts fit.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'fines-and-violation-hearings',
    'late-fee-limits',
    'georgia-hoa-assessment-lien-rules',
    'georgia-hoa-board-powers-44-3-231',
    'georgia-hoa-fine-hearing-notice',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide which remedy fits a violation or whether your instrument allows a fine. Your attorney answers legal questions about enforcement.',
}
