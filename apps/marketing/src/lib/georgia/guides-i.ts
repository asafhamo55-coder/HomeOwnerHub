// SEO batch 8: governance. Written ballots, amending the covenants, and the
// assessment lien. Statute text only through the quote bank. Product claims
// only with an apps/hoa route and a release note that exist.
//
// Fixture limits, stated on the pages themselves: the nonprofit-code fixture
// carries ballots (§ 14-3-707, numbered § 14-3-708 before 2023) but NOT the new
// § 14-3-708 on action by written consent, so the ballot guide says that and
// quotes nothing from it. The fixtures hold no text on a director conflict of
// interest beyond the SB 406 owner expectation (see checklists-g.ts).

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const WRITTEN_BALLOTS: Guide = {
  slug: 'georgia-hoa-written-ballots-without-a-meeting',
  path: '/guides/georgia-hoa-written-ballots-without-a-meeting',
  title: 'Georgia HOA written ballots: voting without a meeting',
  metaTitle: 'Georgia HOA written ballots without a meeting',
  description:
    'How a Georgia nonprofit HOA can put a question to members by written or electronic ballot instead of a meeting. What the ballot must say, and when it counts.',
  eyebrow: 'Georgia · Voting',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'If your association is a Georgia nonprofit corporation, the Nonprofit Code lets the board put a question to members by ballot instead of a meeting, unless your articles or bylaws prohibit or limit it.',
    'A ballot only counts if enough members return it. The number of ballots cast must at least equal the quorum a meeting would need, and the approvals must reach what a meeting would have needed.',
    'The mailing has rules too: it must say how many responses are needed, what percentage approves each matter, and by when the ballot must come back.',
    'This is a plain-language guide, not legal advice. Your articles, bylaws and attorney decide whether a ballot vote is open to you.',
  ],
  sections: [
    {
      heading: 'Who this section of the law applies to',
      body: [
        'The ballot rule sits in the Georgia Nonprofit Corporation Code, Chapter 3 of Title 14. It reaches an HOA that is incorporated as a Georgia nonprofit. An association that is not incorporated should read its own bylaws and ask its attorney whether the same approach is open to it.',
        'A note on numbering. Before July 1, 2023 the ballot section was § 14-3-708. SB 148 moved it to § 14-3-707. The newer § 14-3-708 deals with action by written consent. We do not hold the text of that newer section in our checked fixtures, so this guide does not describe it. If you plan to act by written consent instead of a ballot, get the current section from your attorney.',
      ],
    },
    {
      heading: 'What a ballot vote can replace',
      body: [
        'The default is generous, and the exceptions live in your own documents. The statute says action that could be taken at a meeting may be taken without one, if the corporation delivers a ballot to every member entitled to vote on the matter.',
        'Read your bylaws before you rely on it. They can prohibit or limit ballot voting, and many older sets do. If they do, the board has to hold a meeting or amend the bylaws first.',
      ],
      quotes: ['ballotAction'],
    },
    {
      heading: 'What the ballot itself must contain',
      body: [
        'A ballot has to show every proposed action, so a member is never asked to approve a package they cannot see. For each question other than a director election, the member gets a for or against choice.',
        'Elections add one more rule. For director elections the ballot must let a member vote for or withhold a vote for each candidate. We do not quote that part here; it is in the same subsection, and your attorney can confirm it for a board election by mail.',
      ],
      quotes: ['ballotContents', 'ballotEach', 'ballotForAgainst'],
    },
    {
      heading: 'What the mailing must tell members',
      body: [
        'The cover letter or instructions matter as much as the ballot. Three facts have to appear in every solicitation, and a missing one is the easiest way to give a challenger something to argue about.',
      ],
      quotes: ['ballotSolicitIntro', 'ballotSolicit1', 'ballotSolicit2', 'ballotSolicit3'],
    },
    {
      heading: 'When a ballot vote counts',
      body: [
        'Two tests apply, and a vote has to pass both. First, enough ballots must come back. Second, enough of them must approve. Say the bylaws set quorum at 30 percent of the votes and a bylaw change needs two-thirds of the votes cast. Then at least 30 percent of the votes must come back as ballots, and two-thirds of the votes actually cast must approve.',
        'This is why a turnout plan matters more than the ballot design. A question can win every ballot it receives and still fail because too few came back.',
      ],
      quotes: ['ballotQuorum'],
    },
    {
      heading: 'Revoking a ballot, and what to keep',
      body: [
        'Unless your articles or bylaws say otherwise, a member cannot take a ballot back once it is in. Tell members that before they sign, and write the deadline on the ballot.',
        'Keep the mailing list, a copy of what was sent, the returned ballots and the count. The count belongs in the minutes with the quorum figure, the approval threshold and the result.',
      ],
      quotes: ['ballotNoRevoke'],
    },
    {
      heading: 'Where a ballot vote fits with the Georgia HOA Act',
      body: [
        'If your association is also governed by the Georgia Property Owners’ Association Act, some actions have their own vote counts. Amending the declaration is the main one, and it is covered in our guide on amending covenants. A ballot is one way of collecting those votes, if your documents allow it.',
        'Whichever route you pick, the deadline and the threshold go in the notice, and the notice goes out the way your documents require.',
      ],
    },
  ],
  steps: [
    'Check the articles and bylaws for any limit on voting by ballot.',
    'Confirm the association is a Georgia nonprofit corporation, or ask your attorney whether the rule reaches you.',
    'List every member entitled to vote on this matter.',
    'Write each question so it can be answered for or against, with the full text of each proposed action.',
    'State the number of responses needed for quorum, the percentage needed to approve, and the return deadline in the mailing.',
    'Send the ballot to every member, in writing or electronically as your documents allow.',
    'Count only what arrives by the deadline, test both thresholds, and record the result in the minutes.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA vote by mail instead of holding a meeting?',
      a: 'If it is a Georgia nonprofit corporation and its articles and bylaws do not prohibit or limit it, the Nonprofit Code allows action by ballot. Check your documents first.',
    },
    {
      q: 'How many ballots must come back?',
      a: 'At least as many votes as the quorum needed at a meeting on the same question. Your bylaws set that figure unless the default applies.',
    },
    {
      q: 'Can a member change their vote after returning a ballot?',
      a: 'Not unless your articles or bylaws allow it. The statute says a ballot may not be revoked unless they provide otherwise.',
    },
    {
      q: 'What happened to section 14-3-708?',
      a: 'The ballot rule used to carry that number. Since July 1, 2023 it is § 14-3-707, and § 14-3-708 is now about written consent. We have not checked that newer section, so ask your attorney.',
    },
    {
      q: 'Does a ballot vote replace the annual meeting?',
      a: 'The ballot rule covers action on a matter. Georgia’s HOA Act still expects a meeting of members at least annually, with reports to owners.',
    },
  ],
  related: ['annual-meeting-quorum-proxies', 'georgia-hoa-proxy-and-written-ballot-form', 'georgia-hoa-amend-covenants-two-thirds', 'annual-meeting-notice-checklist', 'attorney-fee-notice-checklist'],
  hoaDoes: [
    {
      text: 'The election planner works back from the meeting date to set the dates for a paper board election, and prints ballots that never name the voter, envelope labels and a tellers’ tally sheet.',
      route: '/meetings/[id]/election',
      release: '2026-10-21-1930-elections-compliance',
    },
    {
      text: 'The meeting quorum kit counts members present and proxies live, so a board can see the figure a vote needs before it starts.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not run an online ballot vote on a bylaw change or other non-election question. The election planner covers paper board elections.',
}

export const AMEND_COVENANTS: Guide = {
  slug: 'georgia-hoa-amend-covenants-two-thirds',
  path: '/guides/georgia-hoa-amend-covenants-two-thirds',
  title: 'Amending HOA covenants in Georgia: the two-thirds rule and what follows',
  metaTitle: 'Amending Georgia HOA covenants: the vote',
  description:
    'What O.C.G.A. § 44-3-226 says about amending an HOA declaration: the two-thirds default, the 80 percent cap, rental protection, and recording. Quoted text.',
  eyebrow: 'Georgia · Governing documents',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'For an association under the Georgia Property Owners’ Association Act, the default is that the declaration is amended by lot owners holding two-thirds of the votes, or a larger majority if the declaration says so.',
    'No amendment can require more than 80 percent approval, and a few things cannot be changed by amendment at all, like lot boundaries and each lot’s votes.',
    'An amendment is effective only when recorded or at a later date it names. The signatures, or a sworn statement from an officer, are the proof.',
    'This guide is not legal advice. Because a bad amendment can sit unnoticed for years, have your attorney draft and review it.',
  ],
  sections: [
    {
      heading: 'Which law reaches your association',
      body: [
        'This section is part of Article 6 of Chapter 3 of Title 44, the Georgia Property Owners’ Association Act. It reaches an association whose declaration was recorded under that Act or that has submitted to it. Condominiums sit under a different article, which has its own amendment rules, so read our condo versus HOA guide first if you are not sure.',
        'The same section was revised by SB 406, effective January 1, 2027. The subsection on the 80 percent cap is split into numbered parts, and a rule was added for associations that submit to the Act later. The words quoted below are the ones in force and, where the 2027 text differs, we say so.',
      ],
    },
    {
      heading: 'The default vote: two-thirds',
      body: [
        'Unless some other provision of the Act sets the vote, the declaration is amended only by the agreement of lot owners holding two-thirds of the votes in the association. Your declaration can ask for more.',
        'The statute adds a rule for the declarant’s period. While the declarant still controls the association or holds an option to add property, the agreement must include the declarant and two-thirds of the votes, not counting the declarant’s lots.',
      ],
      quotes: ['amendTwoThirds'],
    },
    {
      heading: 'The 80 percent ceiling',
      body: [
        'A declaration that demands unanimous consent, or 90 percent, runs into this limit. The Act says no amendment can require approval of more than 80 percent of the association vote, plus mortgagees holding 80 percent of the voting interest of mortgaged lots.',
        'For an association that was already operating before July 1, 1994, the Act treats its documents as conforming to the limit when it opts in. SB 406 adds a one-year window for associations that submit under the later route to vote to keep a higher threshold.',
      ],
      quotes: ['amendCap80'],
    },
    {
      heading: 'What an amendment cannot do',
      body: [
        'Two protections often decide the fight over a proposed change. An amendment cannot change lot boundaries, the number of votes a lot carries, or its share of common expenses, unless the Act or the declaration expressly allows it or every owner and mortgagee agrees.',
        'It also cannot end the right of a lot that is already rented out to stay rented. If the lot was leased for an initial term of six months or longer under the old rules, the new restriction waits until the lot is conveyed for value.',
      ],
      quotes: ['amendNoLotChange', 'amendRental'],
    },
    {
      heading: 'Proving the vote',
      body: [
        'Georgia gives two ways to prove that the required owners agreed. The owners sign the amendment. Or, if the declarant no longer controls the association, the president, a vice president or the secretary signs a sworn statement attached to the amendment.',
        'That statement must say, without hedging, that the required agreement was lawfully obtained and that all notices required by the Act were properly given. Treat it as a record of work you actually did, because the notices are part of what you are swearing to.',
      ],
      quotes: ['amendEvidence'],
    },
    {
      heading: 'Recording and mortgagee consent',
      body: [
        'Recording is what makes an amendment real. A signed amendment sitting in the association’s files is not effective until it is recorded, or until a later date written into it.',
        'A mortgagee who gets a certified-mail notice of the proposal and says nothing for 30 days is treated as having agreed. Send that notice by certified mail or statutory overnight delivery with return receipt requested, and keep the receipt.',
      ],
      quotes: ['amendEffective', 'amendMortgagee'],
    },
    {
      heading: 'The one-year presumption',
      body: [
        'A challenge to an amendment gets harder after a year. If the lawsuit is filed more than a year after the amendment was recorded, the adoption is presumed valid and the person challenging it carries the burden of proof.',
      ],
      quotes: ['amendPresumption'],
    },
  ],
  steps: [
    'Read the declaration for a higher vote than two-thirds, and for any declarant approval right.',
    'Have your attorney draft the amendment and confirm the statute applies to your association.',
    'Notice the meeting or vote the way your documents and § 44-3-230 require.',
    'Collect signatures from the required owners, counting the right votes, or prepare the officer’s sworn statement.',
    'Send the proposal to mortgagees by certified mail or statutory overnight delivery, return receipt requested.',
    'Record the amendment, or state the later effective date inside it.',
    'File the recorded copy with the governing documents and tell owners.',
  ],
  faqs: [
    {
      q: 'How many owners must agree to amend a Georgia HOA declaration?',
      a: 'Under the Act’s default, owners of lots holding two-thirds of the votes, or a larger majority if the declaration says so, up to the 80 percent cap.',
    },
    {
      q: 'Can the declaration require 100 percent to amend?',
      a: 'The Act says no amendment can require approval above 80 percent of the association vote. The 2027 text has special handling for some associations that submit later.',
    },
    {
      q: 'Does the board have to record the amendment?',
      a: 'The Act says the amendment becomes effective only when recorded, or on a later date named in it. Your attorney can handle the recording.',
    },
    {
      q: 'Can an amendment ban renting?',
      a: 'Not for a lot already leased for an initial term of six months or longer. The new rule applies once that lot is conveyed for value.',
    },
    {
      q: 'Does a written ballot work for an amendment vote?',
      a: 'Possibly, if your bylaws allow it. See our written ballot guide, and have your attorney confirm the route.',
    },
  ],
  related: ['georgia-hoa-written-ballots-without-a-meeting', 'georgia-hoa-board-powers-44-3-231', 'annual-meeting-quorum-proxies', 'condo-vs-hoa-law', 'attorney-fee-notice-checklist'],
  hoaDoes: [
    {
      text: 'Send meeting notice on a scheduled meeting opens a message already filled in with the type, date and agenda. You add the time and place, and nothing goes out until you press Send.',
      route: '/meetings/[id]',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'The meeting quorum kit tracks members present and proxies, so the vote count at an amendment meeting is on the screen as it happens.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not draft or record amendments, and it does not collect owner signatures. Your attorney does that part.',
}

export const LIEN_RULES: Guide = {
  slug: 'georgia-hoa-assessment-lien-rules',
  path: '/guides/georgia-hoa-assessment-lien-rules',
  title: 'Georgia HOA assessment lien rules: what a board needs to know',
  metaTitle: 'Georgia HOA assessment lien rules explained',
  description:
    'How the Georgia HOA assessment lien works under § 44-3-232: what it covers, how long it lasts, the statement of amounts due, and where foreclosure begins.',
  eyebrow: 'Georgia · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Assessments, fines and some charges are a lien on the lot from the time they are due. The recorded declaration is the record notice, so Georgia does not require a separate claim of lien for assessments.',
    'The lien lapses after four years today and six years from January 1, 2027. SB 406 also bars an unregistered association from recording liens or starting foreclosure.',
    'A lender, buyer or owner can ask in writing for a statement of amounts due. Miss the five-business-day deadline and the lien is extinguished as to that buyer or lender.',
    'This is a guide for boards, not legal advice. Foreclosure is a court action, so talk to your attorney well before you get near it.',
  ],
  sections: [
    {
      heading: 'What the lien covers',
      body: [
        'Under § 44-3-232(a), sums lawfully assessed against an owner are both the owner’s personal obligation and a lien on the lot. The statute lists what can sit ahead of it: property taxes, a first mortgage and a few other items.',
        'Fines you validly imposed can be part of what the lien secures, so fine procedure matters before a collections case.',
      ],
      quotes: ['lienSums'],
    },
    {
      heading: 'No separate claim of lien',
      body: [
        'A common surprise for boards used to other states: you do not record a claim of lien for assessments in Georgia. The recorded declaration is the notice.',
        'The 2027 registration law adds a gate. An association that is not registered with the Secretary of State may not collect fines or fees, or file or record liens, or begin foreclosure. Register first.',
      ],
      quotes: ['lienRecordNotice', 'regBar'],
    },
    {
      heading: 'Late charges, interest and collection costs',
      body: [
        'The lien can include more than the assessment, but only to the extent the instrument provides. That means your declaration has to authorize each add-on. If it does not, the add-on is not part of the lien.',
        'We cover the late-fee limits in a separate guide. The two figures to know are the greater of $10.00 or 10 percent for a late charge, and interest at not more than 10 percent per year.',
      ],
      quotes: ['lienAddOnsIntro', 'lateCharge', 'interest'],
    },
    {
      heading: 'How long the lien lasts',
      body: [
        'The lien does not last forever. Each assessment or installment has its own clock, counted from the date it first became due and payable. The clock is four years today and six years under the SB 406 text from January 1, 2027.',
        'The practical lesson is to track dates per charge. An account with a five-year-old balance can have a lapsed oldest slice and a live newer slice.',
      ],
      quotes: ['lapse2026', 'lapse2027'],
    },
    {
      heading: 'The statement of amounts due',
      body: [
        'This is the rule with a hard deadline. An owner, a buyer under contract, a mortgagee or a lender can ask for a statement of past-due amounts, and the request must be in writing and delivered to the association’s registered office, with an address for the reply.',
        'If the association does not furnish the statement within five business days, the lien is extinguished as to the title or interest the buyer or lender acquires in that transaction. What the statement says binds the association and every owner.',
      ],
      quotes: ['stmtRight', 'stmtFiveDays', 'stmtBinding'],
    },
    {
      heading: 'Foreclosure is its own process',
      body: [
        'Nothing above lets a board foreclose by itself. Foreclosure is a court action preceded by certified-mail notice, and the notice period moves from 30 to 60 days on January 1, 2027. The threshold also changes. Our foreclosure threshold guide covers that, and the attorney’s-fee notice checklist covers the notice an association must give before it can collect attorney’s fees.',
        'The statute also keeps the board’s other path open: an action to recover the sums without foreclosing the lien.',
      ],
      quotes: ['lienSuit'],
    },
  ],
  steps: [
    'Confirm the association is registered before any lien or fee step in 2027.',
    'Check the declaration for the late charge, interest and collection costs it authorizes.',
    'Track the due date of every charge, so you know when each one lapses.',
    'Diary a five-business-day deadline from the day a statement request reaches the registered office.',
    'Send collections letters by certified mail and keep the proof of delivery.',
    'Send the attorney’s-fee notice before any fee is claimed.',
    'Hand the file to your attorney before a foreclosure notice goes out.',
  ],
  faqs: [
    {
      q: 'Does a Georgia HOA have to record a lien?',
      a: 'Not for assessments. The statute says the recorded declaration is record notice of the lien and no further recordation of a claim of lien is required.',
    },
    {
      q: 'How long does the lien last?',
      a: 'The text in force now says four years from when an assessment or installment first became due. SB 406 makes it six years from January 1, 2027.',
    },
    {
      q: 'What happens if we miss the five-business-day statement deadline?',
      a: 'The lien is extinguished as to the buyer or lender in that transaction. Answer every statement request on time, from the day it reaches the registered office.',
    },
    {
      q: 'Can an HOA charge for the statement?',
      a: 'The statute allows a fee of not more than $10.00 if the instrument so provides.',
    },
    {
      q: 'Are fines part of the lien?',
      a: 'The statute says sums lawfully assessed, including fines, are a lien. They must be lawfully imposed under your documents first.',
    },
  ],
  related: ['foreclosure-threshold-2027', 'late-fee-limits', 'attorney-fee-notice-checklist', 'certified-mail-collections-notices'],
  hoaDoes: [
    {
      text: 'The Compliance page lists the Georgia obligations that carry a deadline, including the five-business-day statement of amounts due, with an overdue banner.',
      route: '/compliance',
      release: '2026-10-21-1930-elections-compliance',
    },
    {
      text: 'From a property, Prepare estoppel certificate fills in the balance, regular assessment and open charges from the home’s account. For Georgia it is built on the statement of amounts due. You verify the figures before it prints.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
    {
      text: 'On a Georgia collections letter, record how it was mailed, the tracking number and the delivery date. Fee and foreclosure clocks then count from the delivery day.',
      route: '/properties/[id]',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
  ],
}
