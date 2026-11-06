// SEO batch 30: three Georgia guides for board members.
//   1. Architectural review under the covenants: what 44-3-231(a)(3) gives the association and what it leaves to the declaration.
//   2. Short-term and Airbnb rentals: the Act does not use those words, so the declaration decides; what 44-3-223 and 44-3-226 do say.
//   3. A board election and nominations checklist: notice, quorum, proxies, ballots and eligibility from 44-3-224, -229, -230, -228 and 14-3-701, -707, -724.
// Statute text only through the quote bank (powIntro, powArc, reasonableRules, amendRental, meetingNotice, ballotDirector and
// the rest), checked word for word by georgia-guides.test.ts against the fixtures. Every other sentence restates a quote or says
// the text we hold is silent, and adds no rule. Where a sentence describes what declarations usually contain, it says so and
// is not a statement of law. Product claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-06'

export const GA_ARC: Guide = {
  slug: 'georgia-hoa-architectural-review-covenants-44-3-231',
  path: '/guides/georgia-hoa-architectural-review-covenants-44-3-231',
  title: 'Georgia HOA architectural review: what the statute says and what your covenants control',
  metaTitle: 'Georgia HOA architectural review rules',
  description:
    'Georgia 44-3-231(a)(3) lets an HOA approve or withhold exterior changes. What the statute says, what your declaration controls and when to ask an attorney.',
  eyebrow: 'Georgia · Architectural review',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under Code Section 44-3-231(a)(3), a Georgia property owners’ association can grant or withhold approval of an action that would change the exterior appearance of a lot, a structure on it or another part of the development, or provide for an architectural control committee to do so.',
    'That power exists except to the extent the instrument prohibits it, and subject to any restrictions and limitations the instrument specifies. In practice the declaration and any guidelines it authorizes decide most of the process.',
    'In the sections we hold, the Act does not set review standards, a decision deadline, a rule for silence, an appeal or a form for a denial. Those are questions for your documents and your attorney.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3, which uses the words lot and lot owner. A condominium association is under the Condominium Act instead. Our guide on whether the Act applies to your community explains how to tell, and your declaration will say which one you are under.',
      ],
    },
    {
      heading: 'Where the power to review comes from',
      body: [
        'Section 44-3-231(a) lists powers the association has. The list opens with a condition that matters for architectural review: the powers are subject to what the instrument says.',
      ],
      quotes: ['powIntro'],
    },
    {
      heading: 'The architectural control power',
      body: [
        'Paragraph (3) of that subsection is the one that speaks to architectural review. It covers an action that would change the exterior appearance of a lot, a structure on it or any other portion of the development. It also lets the association elect or provide for the appointment of an architectural control committee to grant or withhold the approval.',
      ],
      quotes: ['powArc'],
    },
    {
      heading: 'What your declaration usually controls',
      body: [
        'The Act gives the power and leaves the process to the instrument. Unless the Act, the nonprofit corporation chapters, the instrument, the articles or the bylaws say otherwise, the board of directors exercises the association’s powers, so whether the board or a committee reviews applications is also a question for your documents. Declarations commonly say what kinds of changes need approval, who sits on the committee and how members are chosen, what an application must include, how long the committee has to answer, what happens if it does not answer, whether a denial can be appealed to the board, and whether a fee or deposit is charged. That is a description of what such documents often contain, not a statement of Georgia law, and your declaration may say something different.',
        'Read your own documents for each of those points. If the declaration is silent or unclear on one, do not fill the gap with a rule that sounds sensible. Ask your attorney.',
      ],
    },
    {
      heading: 'What the statute does not say',
      body: [
        'In the sections we hold, we do not find a standard the committee must apply, a deadline to decide, a rule that silence counts as approval or denial, a requirement to give written reasons, an appeal procedure, or a limit on what a committee may regulate. If a rule like that matters to a decision your board is making, it has to come from your instrument or from law outside this page. Your attorney can tell you which.',
      ],
    },
    {
      heading: 'Owners must comply, and the rules must be reasonable',
      body: [
        'Section 44-3-223 puts the duty on owners and occupants. They must comply with the lawful provisions of the instrument and with reasonable rules or regulations the association adopted under the instrument, if those rules have been provided to the lot owners. Architectural guidelines are the kind of rule this sentence is aimed at, so the practical checks are whether the guideline is authorized by the declaration, whether it is reasonable, and whether owners received it.',
      ],
      quotes: ['complyDuty', 'reasonableRules'],
    },
    {
      heading: 'Enforcement',
      body: [
        'The same section says a lack of compliance is grounds for an action to recover sums due, for damages, for injunctive relief or for another remedy at law or in equity.  For an injunction, the association gives the notice its instrument calls for, or ten days’ written notice if the instrument is silent, with exceptions.',
        'A fine for building without approval is possible only if and to the extent the instrument provides, and no suspension may deny access to the lot. Our guide on fines and violation hearings covers the process side.',
      ],
      quotes: ['complyRemedies'],
    },
    {
      heading: 'Changing the review rules',
      body: [
        'If the architectural provisions are in the recorded declaration, changing them means amending the instrument. The default vote is the agreement of lot owners of lots to which two-thirds of the votes pertain, or a larger majority if the instrument specifies. Guidelines that the declaration lets the board or committee adopt may be changed in the way the declaration says, which is another point to confirm with your attorney.',
      ],
      quotes: ['amendTwoThirds'],
    },
  ],
  steps: [
    'Find the architectural provisions in your recorded declaration and any guidelines the declaration authorizes.',
    'Confirm who acts for the association on applications: the board, a committee, or both, and how committee members are chosen.',
    'Write down, from your documents, what needs approval, what an application must include and how long the committee has to answer.',
    'Check that the current guidelines were adopted the way the declaration requires and were provided to every lot owner.',
    'Record each application, decision and reason in writing, and compare similar requests before you answer.',
    'Talk to your attorney before you fine, sue or change the review rules.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA require approval for exterior changes?',
      a: 'Section 44-3-231(a)(3) lets the association grant or withhold approval of an action that would change the exterior appearance of a lot, a structure on it or another portion of the development, except to the extent the instrument prohibits it and subject to the instrument’s restrictions. Your declaration decides what needs approval.',
    },
    {
      q: 'Does Georgia law require an architectural committee?',
      a: 'The text we hold says the association may elect or provide for the appointment of one. It does not say a committee is required. Your declaration and bylaws say who reviews.',
    },
    {
      q: 'How long does a Georgia architectural committee have to decide?',
      a: 'We do not find a statutory deadline in the sections we hold. Your declaration or guidelines may set one, so read them and ask your attorney.',
    },
    {
      q: 'Does silence mean an application is approved?',
      a: 'The text we hold does not say. If your documents have a rule for silence, follow it. If they do not, ask your attorney before relying on either answer.',
    },
    {
      q: 'Can the board fine an owner who builds without approval?',
      a: 'Only if and to the extent the instrument provides for fines, and no suspension may deny access to the lot. Ask your attorney before you fine.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-board-powers-44-3-231',
    'georgia-hoa-owner-compliance-and-remedies-44-3-223',
    'fines-and-violation-hearings',
    'georgia-hoa-amend-covenants-two-thirds',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether an application should be approved, interpret your declaration or review plans. Your board makes the decision and your attorney answers legal questions about it.',
}

export const GA_SHORT_TERM_RENTALS: Guide = {
  slug: 'georgia-hoa-short-term-rentals-and-airbnb-44-3-226',
  path: '/guides/georgia-hoa-short-term-rentals-and-airbnb-44-3-226',
  title: 'Short-term and Airbnb rentals in a Georgia HOA: what the covenants control',
  metaTitle: 'Georgia HOA short-term rentals and Airbnb',
  description:
    'Georgia’s HOA Act does not mention short-term rentals or Airbnb. What 44-3-223 and 44-3-226 say, what your declaration controls and when to call an attorney.',
  eyebrow: 'Georgia · Rentals',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In the sections we hold, the Georgia Property Owners’ Association Act does not use the words short-term rental, vacation rental or Airbnb. It does not say a community may allow them, and it does not say a community may ban them.',
    'Owners and occupants must comply with the lawful provisions of the instrument and with reasonable rules adopted under it (§ 44-3-223). So the answer for your community is mostly in your declaration, and in any amendment or rule adopted under it.',
    'The one rental sentence we find is in § 44-3-226(a)(2)(B). It protects a nonowner occupied lot that is already leased or rented for an initial term of six months or longer from a later amendment that would prohibit or restrict that. It says nothing about shorter stays.',
    'This is a plain-language guide to the text we hold, not legal advice. Ask your attorney before you enforce or amend a rental rule.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3. A condominium association is under the Condominium Act instead, and its instruments may treat rentals differently. Check your declaration to see which Act you are under.',
      ],
    },
    {
      heading: 'What the statute says about short stays: nothing by name',
      body: [
        'We searched the Act text we hold for rules on short-term rentals and found none. There is no definition of a short-term rental, no minimum lease length that applies to every community, no rental registration rule and no limit on the number of rented lots. A rule like that has to come from your declaration or from law outside this page.',
        'That silence cuts both ways. It does not mean short-term rentals are allowed, and it does not mean a board may ban them on its own. It means the answer sits in your instrument.',
      ],
    },
    {
      heading: 'Owners must follow the declaration and reasonable rules',
      body: [
        'Section 44-3-223 sets the owner’s duty. Owners and those entitled to occupy a lot comply with the lawful provisions of the instrument, and with reasonable rules or regulations adopted under the instrument that were provided to the lot owners. A rental restriction written into the recorded declaration is a provision of the instrument. A rule the board adopts later is a different thing, and it holds only if the instrument lets the board adopt it and the rule is reasonable.',
      ],
      quotes: ['complyDuty', 'reasonableRules'],
    },
    {
      heading: 'What your declaration usually controls',
      body: [
        'Declarations that address rentals commonly deal with a minimum lease term, whether leases must be in writing, whether the board must be told about or approve a lease, whether tenants must follow the community rules, and whether the number of rented lots is limited. Some are silent on rentals altogether, or speak only of leasing for residential use. That is a description of what such documents often contain, not a statement of Georgia law.',
        'Read the declaration, the bylaws and every recorded amendment for each of those points, and note the date each one was recorded. If the wording is unclear about nightly or weekly stays, do not guess. Ask your attorney.',
      ],
    },
    {
      heading: 'The one rental sentence in the Act',
      body: [
        'Section 44-3-226 is about amendments. It says no amendment may prohibit or restrict a nonowner occupied lot from continuing to be leased or rented for an initial term of six months or longer under the preamended instrument. The words are about a term of six months or longer. The text does not say whether a stay shorter than six months is protected or not, so a community that wants to restrict short stays should not assume either answer without advice from its attorney.',
        'Our guide on rental amendments covers the protection, and when a protected lot must conform after a conveyance for value, in full.',
      ],
      quotes: ['amendRental'],
    },
    {
      heading: 'Adding a rental restriction',
      body: [
        'If the declaration does not restrict short stays and the community wants to, the usual route is an amendment to the instrument. The default vote is the agreement of lot owners of lots to which two-thirds of the votes pertain, or a larger majority if the instrument specifies. Whether a board-adopted rule can do the job instead depends on what the instrument lets the board adopt, which is a question for your attorney.',
      ],
      quotes: ['amendTwoThirds'],
    },
    {
      heading: 'Enforcing a rental rule',
      body: [
        'The remedies in § 44-3-223 apply to lack of compliance with the instrument. Before an injunction, the association gives the notice its instrument calls for, or ten days’ written notice if the instrument is silent, with exceptions. A fine is possible only if and to the extent the instrument provides, and no suspension may deny access to the lot.',
      ],
      quotes: ['complyRemedies'],
    },
    {
      heading: 'Other rules that may apply',
      body: [
        'A short-term rental can also raise questions outside the declaration, such as city or county rules, taxes and the owner’s insurance. This page does not cover them. Tell owners to check with the right office and their own advisers.',
      ],
    },
  ],
  steps: [
    'Read the declaration, bylaws and every recorded amendment for anything on leasing, minimum terms, tenants and approval.',
    'Write down the exact words that apply and the date each was recorded.',
    'Decide whether the issue is enforcing what exists or adding a rule, and keep the two apart.',
    'If you want to add a restriction, ask your attorney whether it needs an amendment and how existing leases are treated.',
    'Before a violation notice, confirm the rule is in the instrument or was properly adopted under it and was provided to owners.',
    'Send the notice the instrument calls for, or ten days’ written notice before an injunction if it is silent, and talk to your attorney before any fine or suit.',
  ],
  faqs: [
    {
      q: 'Does Georgia law ban Airbnb in an HOA?',
      a: 'In the sections we hold, the Property Owners’ Association Act does not mention short-term rentals or Airbnb. Whether they are allowed depends on your declaration and any amendment or reasonable rule adopted under it.',
    },
    {
      q: 'Can a Georgia HOA board ban short-term rentals on its own?',
      a: 'Section 44-3-223 requires owners to follow reasonable rules adopted under the instrument. Whether a board rule can ban short stays depends on what your instrument lets the board adopt. Ask your attorney.',
    },
    {
      q: 'What vote does a rental restriction need?',
      a: 'An amendment to the instrument generally needs the agreement of lot owners holding two-thirds of the votes, or a larger majority if the instrument specifies.',
    },
    {
      q: 'Does the six-month protection cover short stays?',
      a: 'The text protects a nonowner occupied lot leased or rented for an initial term of six months or longer under the preamended instrument. It does not address shorter stays. Ask your attorney.',
    },
    {
      q: 'Can the HOA fine an owner for a short-term rental?',
      a: 'Only if and to the extent the instrument provides for fines, and the rule being enforced must be one the instrument supports. Ask your attorney before you fine.',
    },
  ],
  related: [
    'georgia-hoa-amendment-rental-restrictions-44-3-226',
    'georgia-hoa-amend-covenants-two-thirds',
    'georgia-hoa-owner-compliance-and-remedies-44-3-223',
    'fines-and-violation-hearings',
    'violation-notice-checklist',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether your declaration allows short-term rentals, track rental permits or manage tenants. Your attorney answers legal questions about leasing rules.',
}

export const GA_BOARD_ELECTION: Guide = {
  slug: 'georgia-hoa-board-election-and-nominations-checklist',
  path: '/guides/georgia-hoa-board-election-and-nominations-checklist',
  title: 'Georgia HOA board election and nominations checklist',
  metaTitle: 'Georgia HOA board election checklist',
  description:
    'A checklist for a Georgia HOA board election: notice, quorum, proxies, ballots and who may serve, plus what your bylaws control, such as nominations.',
  eyebrow: 'Georgia · Board elections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'The statute we hold sets the frame for an election: an annual meeting, at least 21 days’ notice, a default quorum of more than one-third of the votes, and rules for proxies and ballots.',
    'It does not describe how candidates are nominated, when nominations close, how long a term lasts or who counts the votes. Your bylaws and declaration decide those.',
    'A ballot that elects directors must let owners vote for, or withhold a vote for, each candidate, and a fine may not take away the right to vote in board elections.',
    'This is a plain-language guide to the text we hold, not legal advice. Ask your attorney about any dispute over an election.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3. If your association is a nonprofit corporation, the nonprofit chapter of Title 14 also applies, and some rules below come from it. A condominium association is under the Condominium Act instead. Your declaration says which one you are.',
      ],
    },
    {
      heading: '1. Hold the annual meeting',
      body: [
        'Your bylaws say whether directors are elected at the annual meeting, which seats are up and for what term. If the association misses its fiscal-year deadline, owners holding a set share of the votes can call the meeting; our guide on owners calling the annual meeting has the text.',
      ],
      quotes: ['nonprofitAnnual'],
    },
    {
      heading: '2. Send notice on time',
      body: [
        'Notice goes to each lot owner by the stated methods, to the address the owner designated or, if none, the address of the lot. These words do not mention a nomination call or a candidate list, so check your bylaws for any extra notice.',
      ],
      quotes: ['meetingNotice'],
    },
    {
      heading: '3. Settle nominations from your bylaws',
      body: [
        'In the sections we hold, there is no rule on nominations: no nominating committee, no deadline to run, no candidate statement, no nomination from the floor. If your bylaws set a process, follow it exactly and give every owner the same chance to run. If they are silent, ask your attorney before you invent a process in the middle of an election.',
        'Also confirm who may serve. If the instrument requires a director to be a lot owner, the Act widens “lot owner” in that context. Our guide on who can serve on the board has the text.',
      ],
    },
    {
      heading: '4. Check who can vote',
      body: [
        'A fine may not take away the right to vote in board elections. Suspending voting rights for unpaid assessments is possible only if and to the extent the instrument provides, so check before you remove anyone from the voter list. For a lot with more than one owner, see our guide on joint owners.',
      ],
      quotes: ['fineAuth'],
    },
    {
      heading: '5. Count the quorum',
      body: [
        'Take the count at the start of the meeting, check each proxy before you count it, and write the number into the minutes.',
      ],
      quotes: ['memberQuorum'],
    },
    {
      heading: '6. Handle proxies',
      body: [
        'Under the nonprofit chapter a member may vote in person or by proxy unless the articles or bylaws prohibit or limit it. Check each proxy against these two rules before the meeting starts.',
      ],
      quotes: ['proxyVoid', 'proxy11'],
    },
    {
      heading: '7. If you vote by ballot',
      body: [
        'Unless the articles or bylaws prohibit or limit it, a member action can be taken by ballot without a meeting. A ballot for a director election must give this choice. The solicitation must also say how many responses are needed for a quorum and when a ballot must be received. Our guide on written ballots has more.',
      ],
      quotes: ['ballotDirector', 'ballotSolicit3'],
    },
    {
      heading: '8. Record the result and update the state registration',
      body: [
        'Record who was elected, the quorum and how the votes were counted. Your bylaws say when and how officers are chosen. A corporation’s annual registration lists its chief executive officer, chief financial officer and secretary, so correct it after officers change. Our guide on the annual registration covers the window.',
      ],
      quotes: ['powMinutes', 'annualRegCurrent'],
    },
  ],
  steps: [
    'Find the election, nomination, term and voting provisions in your bylaws and declaration.',
    'Set the meeting date and send notice at least 21 days ahead, with any nomination call your bylaws require.',
    'Open and close nominations the way the bylaws say, and confirm each candidate is eligible to serve.',
    'Prepare the voter list, check proxies, and prepare ballots that let owners vote for or withhold a vote for each candidate.',
    'Take the quorum count at the start of the meeting and record it.',
    'Count the votes, announce the result and record it in the minutes.',
    'Update the Secretary of State registration if an officer changed.',
  ],
  faqs: [
    {
      q: 'How much notice does a Georgia HOA owe owners of the annual meeting?',
      a: 'Section 44-3-230(a) says at least 21 days in advance of any annual or regularly scheduled meeting, stating the time and place. Check your bylaws for a longer period.',
    },
    {
      q: 'How are candidates nominated in a Georgia HOA?',
      a: 'In the sections we hold, the statute is silent on nominations. Your bylaws set the process, and your attorney can help if they do not.',
    },
    {
      q: 'What is the quorum for an owners’ meeting?',
      a: 'Unless the instrument or bylaws provide otherwise, persons entitled to cast more than one-third of the votes present at the beginning of the meeting.',
    },
    {
      q: 'Can an owner who owes fines still vote for the board?',
      a: 'The statute says no suspension may deny the right to vote in board elections based on failure to pay outstanding fines.',
    },
  ],
  related: [
    'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'georgia-hoa-joint-owners-voting-44-3-224',
    'georgia-hoa-written-ballots-without-a-meeting',
    'georgia-hoa-owners-call-annual-meeting-44-3-230',
    'georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
    'annual-meeting-quorum-proxies',
    'annual-meeting-notice-checklist',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not run your election, count votes or decide whether a candidate is eligible. Your board follows the bylaws and your attorney answers legal questions about a contested election.',
}
