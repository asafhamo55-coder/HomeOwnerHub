// SEO batch 15, two guides.
//
// 1. Georgia: what a POA board can borrow, sue over or amend, and what needs
//    owner votes. Statute text only through the quote bank: powBorrow,
//    powResolution, powLitigate, powAmend, powBoard and boardQuorum
//    (O.C.G.A. §§ 44-3-228 and 44-3-231) plus amendTwoThirds (§ 44-3-226), all
//    from ga-ocga-44-3-art6-2026.txt. The page adds nothing beyond those quotes.
//    The fixture holds the Property Owners' Association Act (Article 6) only.
//    Product claims: the motion log, minutes approval, the quorum kit and the
//    meeting agenda, all shipped. No claim that HomeownerHub drafts or certifies
//    a resolution or reviews a loan.
// 2. Texas: flag display, Tex. Prop. Code § 202.012, from the Chapter 202
//    excerpt (tcss-pr202-2026-excerpt.htm, txFlag* quotes). The excerpt holds
//    §§ 202.001 and 202.012 only. Product claim: follow-up violation letters
//    through Approvals; the page says HomeownerHub does not know a board's rules.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const GA_BORROW_SUE: Guide = {
  slug: 'georgia-hoa-board-borrowing-and-lawsuits',
  path: '/guides/georgia-hoa-board-borrowing-and-lawsuits',
  title: 'Georgia HOA board: what it can borrow, sue over and amend, and what needs owner votes',
  metaTitle: 'Georgia HOA board borrowing and lawsuits',
  description:
    'What a Georgia property owners’ association board can borrow, sue over or amend without a vote, and what needs owners. Quoted from O.C.G.A. 44-3-231.',
  eyebrow: 'Georgia · Governance',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Section 44-3-231(b) gives a Georgia property owners’ association the power to borrow money and to pledge or mortgage its property for any lawful purpose within its powers. Subsection (h) gives it standing to bring and defend litigation about the lots and common area it looks after.',
    'Subsection (f) lets the board use those powers without a further owner vote, unless the Act, Title 14, the instrument, the articles or the bylaws expressly require one. That exception is where owner votes come in.',
    'The board can amend the documents without a vote only to conform them to mandatory law. Any other amendment goes back to the owners under § 44-3-226.',
    'This is a plain-language guide to the text we hold, not legal advice. Your attorney decides how it applies to your instrument.',
  ],
  sections: [
    {
      heading: 'Borrowing and pledging property',
      body: [
        'The borrowing power sits in subsection (b), next to the power to buy and own property. It covers borrowing money and pledging, mortgaging or hypothecating the association’s property.',
        'Two limits are in the sentence itself. The purpose must be lawful, and it must fall within the association’s inherent or expressly granted powers.',
      ],
      quotes: ['powBorrow'],
    },
    {
      heading: 'What a lender can rely on',
      body: [
        'The next sentence of subsection (b) protects the other side of the deal. A third party that deals with the association may rely in good faith on a certified resolution of the board authorizing the act or transaction.',
        'Read the quote for what it says. The resolution is treated as conclusive evidence of the association’s authority and of full compliance with the restraints, conditions and limitations on that authority, if there are any. A bank, a vendor or a title company can lean on it.',
        'So the resolution deserves care. Our board resolution template lays out the fields: what was approved, on what date, with what vote, and who certifies it.',
      ],
      quotes: ['powResolution'],
    },
    {
      heading: 'Suing and defending',
      body: [
        'Subsection (h) gives the association the capacity, power and standing to institute, intervene, prosecute, represent or defend litigation or administrative proceedings in its own name. The subject is claims relating to any portion of the lots or common area that the association has the responsibility to administer, repair or maintain.',
      ],
      quotes: ['powLitigate'],
    },
    {
      heading: 'Amending the documents',
      body: [
        'Subsection (c) lets the association amend the instrument, the articles and the bylaws without a vote of the lot owners, in one situation: to conform them to mandatory provisions of the Act or of other applicable law.',
        'Anything else is a different kind of amendment. Section 44-3-226(a)(1) is the general rule, and it asks for the agreement of owners holding two-thirds of the votes, or a larger majority if the instrument sets one. Our amendment guide walks through that vote.',
      ],
      quotes: ['powAmend', 'amendTwoThirds'],
    },
    {
      heading: 'The line between board action and owner votes',
      body: [
        'Subsection (f) is the rule that ties these powers to the board. The powers inherent in or expressly granted to the association may be exercised by the board, acting through the officers, without any further consent or action on the part of the lot owners.',
        'It starts with an exception. The Act, Chapter 2 or 3 of Title 14, the instrument, the articles or the bylaws can expressly require something else. The text we hold does not say that a loan or a lawsuit needs an owner vote. It does say your own documents may. Read the borrowing, litigation and spending sections of your instrument and bylaws before the board acts.',
      ],
      quotes: ['powBoard'],
    },
    {
      heading: 'Quorum comes first',
      body: [
        'A board resolution is only as good as the meeting it came from. Section 44-3-228 sets the default board quorum at the presence of persons entitled to cast one-half of the votes of the board, unless the instrument or bylaws specify a larger percentage.',
        'Record the quorum in the minutes and in the resolution.',
      ],
      quotes: ['boardQuorum'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the Property Owners’ Association Act. Condominiums are under a different article that this page does not describe. We do not hold your instrument, so we cannot say whether it limits borrowing, requires a vote for a lawsuit or sets a larger quorum.',
        'We say nothing about loan terms or lender requirements. The statute is amended from time to time, so check the current text before the board votes.',
      ],
    },
  ],
  steps: [
    'Read the borrowing, litigation and amendment sections of your instrument, articles and bylaws. Note any owner vote they require.',
    'Put the item on the meeting agenda by name.',
    'Check the quorum against § 44-3-228 and your bylaws before the vote, and record who is present.',
    'Take the motion, record who moved and seconded, and record the vote count.',
    'Have your attorney review the wording of any borrowing, pledge or lawsuit resolution before it is final.',
    'Approve the minutes at the next meeting so the record matches the resolution.',
    'Have the secretary sign a certified copy of the resolution for the lender, vendor or court that asked for it.',
    'If the change is not a conforming amendment, take it to the owners for the two-thirds vote, or the larger majority your instrument sets.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA board borrow money without asking owners?',
      a: 'Subsection (b) gives the association the power to borrow, and subsection (f) lets the board use it without further owner consent. The exception is any express requirement in the Act, Title 14, the instrument, the articles or the bylaws.',
    },
    {
      q: 'Can the association sue in its own name?',
      a: 'Yes. Subsection (h) gives it the capacity, power and standing to bring or defend litigation about the lots and common area it is responsible to administer, repair or maintain.',
    },
    {
      q: 'Can the board amend the covenants by itself?',
      a: 'Only to conform them to mandatory provisions of the Act or other applicable law. Other amendments need the owner agreement set out in § 44-3-226.',
    },
    {
      q: 'What can a bank rely on when the association borrows?',
      a: 'A certified resolution of the board authorizing the transaction. Under subsection (b) a third party dealing in good faith may treat it as conclusive evidence of the association’s authority.',
    },
    {
      q: 'Does this cover condominium associations?',
      a: 'No. This page covers the Property Owners’ Association Act. Condominium associations are under a different article of the Code.',
    },
  ],
  related: ['georgia-hoa-board-powers-44-3-231', 'georgia-hoa-board-resolution-template', 'georgia-hoa-amend-covenants-two-thirds', 'hoa-board-meeting-minutes'],
  hoaDoes: [
    {
      text: 'The meeting scheduler can insert a standard agenda in one click, with quorum, minutes, reports, old and new business, so a borrowing or lawsuit item has its place on the page.',
      route: '/meetings/schedule',
      release: '2026-10-30-1945-receipts-agenda-setup-hub',
    },
    {
      text: 'The annual meeting kit has a live quorum counter, check-in and proxy tracking, for meetings where owners vote.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'Meetings, then Motion log, lists every motion from your minutes with who moved, who seconded and the result.',
      route: '/meetings/motions',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'Approve minutes appears on a past meeting once minutes are saved. It asks you to confirm first, and residents can read the minutes once you approve them.',
      route: '/meetings/[id]',
      release: '2026-10-31-0230-minutes-letters-statement-email',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not draft or certify a resolution, review a loan or tell you what your instrument allows. It keeps the record of the meeting. Your attorney decides the rest.',
}

export const TX_FLAGS: Guide = {
  slug: 'texas-hoa-flag-display-rules',
  path: '/guides/texas-hoa-flag-display-rules',
  state: 'TX',
  title: 'Texas HOA flag display: what Property Code 202.012 lets an owner fly',
  metaTitle: 'Texas HOA flag display rules',
  description:
    'Tex. Prop. Code 202.012 limits what a Texas HOA can ban or regulate about the U.S., Texas and military flags and flagpoles. The statute text, quoted.',
  eyebrow: 'Texas · Rules',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'A Texas property owners’ association cannot adopt or enforce a rule that prohibits or restricts an owner from displaying the U.S. flag, the Texas flag or an official or replica flag of a branch of the armed forces. That is Property Code § 202.012(a).',
    'The same section lists what a board can still regulate: how the flag is displayed, the flagpole’s materials and upkeep, the size, number and location of flagpoles, flag size, lighting and halyard noise.',
    'One limit protects the owner. A rule on flagpoles may not prevent at least one pole of up to 20 feet in the front yard, or one attached to a part of the home the association does not maintain.',
    'This is a plain-language guide to the section as we hold it, not legal advice. Your attorney decides how it applies to your dedicatory instruments.',
  ],
  sections: [
    {
      heading: 'What an association may not ban',
      body: [
        'Subsection (a) is a ban on bans. It covers any dedicatory instrument provision that prohibits or restricts the display, or that has the effect of doing so. A rule can fail this test without mentioning flags, if what it does in practice is stop the display.',
        'Three kinds of flag are named. The section does not mention other flags, so a rule about a team flag or a garden flag is outside what the quote below says. Ask your attorney before assuming the rule is safe or unsafe.',
      ],
      quotes: ['txFlagBan'],
    },
    {
      heading: 'Who the chapter covers',
      body: [
        'Chapter 202 defines a property owners’ association broadly. The definition includes an association for a residential subdivision, a planned unit development, a condominium or townhouse regime, or a similar planned development. That is wider than Chapter 209, which applies to residential subdivisions with mandatory membership.',
        'The chapter also defines what a dedicatory instrument is: the documents that govern the establishment, maintenance or operation of the development, including the declaration, bylaws and properly adopted rules. A flag restriction in any of them is caught by subsection (a).',
      ],
    },
    {
      heading: 'What the board can still require',
      body: [
        'Subsection (b) lets an association adopt and enforce reasonable provisions on how a flag is flown. One of them is upkeep: a flag and its pole must be kept in good condition, and a deteriorated flag or an unsafe pole can be repaired, replaced or removed.',
        'The same list lets the board require that the U.S. flag be displayed under 4 U.S.C. Sections 5 to 10, that the Texas flag be displayed under the Government Code, that poles be built of permanent materials with a finish that suits the home, and that the display meet zoning, easements and setbacks of record.',
      ],
      quotes: ['txFlagMaintain'],
    },
    {
      heading: 'Flagpoles: size, number and place',
      body: [
        'A rule can regulate the size, number and location of flagpoles. It cannot go so far that it blocks every pole. At least one pole per property must be allowed, and the statute gives two ways it can qualify.',
        'The first is a pole of no more than 20 feet in the front yard, subject to zoning, easements and setbacks of record. The second is a pole attached to a part of the home that the owner owns and the association does not maintain.',
      ],
      quotes: ['txFlagPole'],
    },
    {
      heading: 'What counts as a front yard',
      body: [
        'The chapter gives its own definition. A front yard is a yard within a lot that has a front building setback line of not less than 15 feet, running the full width of the lot. A lot without such a setback has no front yard under this definition.',
        'That matters for the owner’s choice in subsection (c). An owner who has a front yard and follows the permitted rules may elect either the front-yard pole or the pole attached to the home.',
      ],
      quotes: ['txFlagDef', 'txFlagElect'],
    },
    {
      heading: 'Flag size, lighting and common property',
      body: [
        'The board may also set rules on the size of a displayed flag, and on the size, location and intensity of lights used to illuminate it. Subsection (b)(5), on noise from an external halyard, is limited to reasonable restrictions.',
        'The last item protects the association’s own land. A rule can bar an owner from putting a flag or pole on property that the association owns or maintains, or that the members own in common.',
      ],
      quotes: ['txFlagSizeLight', 'txFlagCommon'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold two sections of Chapter 202, § 202.001 and § 202.012. We do not hold the rest of the chapter, so this page says nothing about other display rules or about how a violation is enforced.',
        'We cannot say whether your rules are reasonable, whether a pole meets a setback or how a court would read a particular provision. The statute is amended from time to time, so check the current text before the board acts.',
      ],
    },
  ],
  steps: [
    'Pull every provision in the declaration, bylaws and rules that touches flags, flagpoles or exterior displays.',
    'Check each one against subsection (a): does it prohibit or restrict the three named flags, or have that effect?',
    'Sort the rest into the permitted topics in subsection (b): display standard, materials, upkeep, pole size and place, flag size, lighting, noise.',
    'Check that your pole rule leaves room for one pole that meets the 20-foot front-yard or attached-pole test.',
    'Have your attorney review any provision you are unsure about and amend it through the process your documents require.',
    'Before a violation letter goes out, confirm the rule you are citing is one the board may still enforce.',
    'Record the board’s decision on any flag complaint in the minutes.',
  ],
  faqs: [
    {
      q: 'Can a Texas HOA ban the American flag?',
      a: 'No. Section 202.012(a) bars an association from adopting or enforcing a provision that prohibits or restricts the display of the U.S. flag, the Texas flag or an official or replica flag of any branch of the armed forces.',
    },
    {
      q: 'Can an HOA limit how tall a flagpole is?',
      a: 'It can regulate the size, number and location of poles, but the regulation cannot prevent at least one pole per property of up to 20 feet in the front yard, or one attached to a part of the home the association does not maintain.',
    },
    {
      q: 'Can the board require flags and poles to be kept in good repair?',
      a: 'Yes. Subsection (b)(1)(E) allows a requirement that a displayed flag and its pole be maintained in good condition, with a deteriorated flag or unsafe pole repaired, replaced or removed.',
    },
    {
      q: 'Can an owner put a flagpole on the common area?',
      a: 'The board may adopt a provision that prohibits an owner from locating a flag or pole on property owned or maintained by the association, or owned in common by the members.',
    },
    {
      q: 'Does this apply to condominiums?',
      a: 'Chapter 202 defines a property owners’ association to include a condominium or townhouse regime. Ask your attorney how it applies to yours.',
    },
  ],
  related: ['texas-hoa-violation-notice-and-hearing-209-006', 'texas-hoa-third-party-collections-notice', 'texas-hoa-payment-plans-and-payment-priority', 'texas-hoa-management-certificate', 'ai-hoa-violation-letters-board-approval'],
  hoaDoes: [
    {
      text: 'Follow-up violation letters (second notice, hearing, fine, decision) are drafted for the board and wait in Approvals. Nothing is sent until a board member approves it.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not know your association’s flag rules and does not judge whether a rule or a display complies with § 202.012. The board and its attorney decide that.',
}
