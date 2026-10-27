// SEO batch 3: annual meeting quorum and proxies, records inspection requests,
// fines and violation hearings. Same truth rules as the other guides: statute
// text only through the quote bank (checked word for word against the
// fixtures in scripts/fixtures/state-law/), product claims only with an
// apps/hoa route and a release note that exist. Where the fixtures do not
// hold the law a topic needs, the page says so and points to the governing
// documents and the association's attorney.

import type { Guide } from './types'

const PUBLISHED = '2026-10-27'

export const QUORUM_PROXIES: Guide = {
  slug: 'annual-meeting-quorum-proxies',
  title: 'Georgia HOA annual meeting quorum and proxies: a guide for boards',
  metaTitle: 'Georgia HOA annual meeting quorum and proxies',
  description:
    'How a Georgia HOA board counts a quorum and handles proxies at the annual meeting: the statute’s default, proxy rules, ballots, and a step-by-step check-in.',
  eyebrow: 'Annual meeting · Georgia',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Unless your instrument or bylaws say otherwise, the Georgia statute’s default quorum for a meeting of owners is persons entitled to cast more than one-third of the votes.',
    'Your own bylaws come first, and many set a different number. Find that number before you send the notice.',
    'Proxies are allowed under the Property Owners’ Association Act. A proxy must be dated and cannot purport to be revocable without notice. An association incorporated as a Georgia nonprofit also follows the proxy rules in Title 14.',
    'Count and record quorum at the start of the meeting, keep the proxies with the minutes, and use the notice checklist so the meeting is valid in the first place.',
  ],
  sections: [
    {
      heading: 'Two quorums, two different numbers',
      body: [
        'A volunteer board deals with two quorums. The first is the quorum of owners at the annual meeting, needed before the members can vote on anything. The second is the quorum of the board itself, needed to conduct board business. They are set in the same section of the Property Owners’ Association Act, and they are easy to mix up.',
        'For owners, the statute supplies a default that applies only when your instrument or bylaws are silent. Read your bylaws first. If they set a higher or lower number, that number wins.',
      ],
      quotes: ['memberQuorum', 'boardQuorum'],
    },
    {
      heading: 'When the quorum is measured',
      body: [
        'The default says a quorum is deemed present “throughout” the meeting if the right number of votes is present at the beginning. In plain words, if you reach quorum at the start under the default, owners leaving early do not by themselves end it. Many bylaws are stricter, so check yours before you rely on this.',
        'Write down the time you called the meeting to order and the number of votes present. That one line in the minutes is the record you will want if anyone later questions a vote.',
      ],
    },
    {
      heading: 'Proxies under the Property Owners’ Association Act',
      body: [
        'A proxy lets an owner give someone else the right to vote for their lot. Georgia’s Act allows it, and it requires it for an owner that is not a natural person, such as a company or a trust.',
        'The Act also protects against sloppy proxies. A proxy that is undated is void, and so is one that claims it can be revoked without notice. A board that collects proxies should therefore check every form for a date before the meeting.',
      ],
      quotes: ['lotProxy', 'proxyVoid'],
    },
    {
      heading: 'Lots with more than one owner',
      body: [
        'The statute has a rule for a lot owned by several people. If only one of them attends or votes by proxy, ballot or written consent, that person casts the lot’s votes. If more than one does, the lot’s vote is cast only by their unanimous agreement, unless the instrument says otherwise, and the statute presumes that agreement if one co-owner votes and the others do not object right away to the person presiding.',
        'In practice, ask each co-owner to sign one proxy together, and have the person presiding ask whether any co-owner objects.',
      ],
    },
    {
      heading: 'If your association is a Georgia nonprofit',
      body: [
        'Many Georgia associations are incorporated as nonprofit corporations, and the Property Owners’ Association Act itself expects incorporation under Title 14. For these, the Nonprofit Corporation Code adds proxy rules, and the Act’s proxy section points to it. An unincorporated association should check its bylaws and ask its attorney which rules apply.',
        'Under § 14-3-724, a proxy can be signed on paper or electronically, it becomes effective when the secretary or the officer authorized to tabulate votes receives it, and it is revocable.',
      ],
      quotes: ['proxyOptional', 'proxyElectronic', 'proxy11', 'proxyRevocable'],
    },
    {
      heading: 'Revoking a proxy',
      body: [
        'The Nonprofit Code lists how an owner revokes a proxy. One is simply attending and voting in person. The other is delivering a written revocation, or a later proxy form, to the officer who tabulates proxy votes. Tell owners at check-in that showing up and voting cancels their proxy, and keep the later form with the earlier one.',
      ],
      quotes: ['proxyRevokeVote'],
    },
    {
      heading: 'What this page cannot tell you',
      body: [
        'The statute files we hold do not set the vote needed to elect directors or amend documents, how votes are weighted among lots, or how quorum works at a meeting held partly online. Those come from your declaration, bylaws and articles. Ask your attorney when they are silent or unclear.',
      ],
    },
  ],
  steps: [
    'Find the owners’ quorum in your bylaws. If they are silent, note the statute’s default.',
    'Send the meeting notice at least 21 days ahead for an annual meeting, using the notice checklist.',
    'Send each owner a dated proxy form, and collect them with a named officer.',
    'At check-in, record each owner or proxy holder, and mark proxies that were revoked by attending.',
    'Call the meeting to order only after the count meets the quorum, and write down the time and number of votes present.',
    'File the sign-in sheet and proxies with the minutes.',
  ],
  faqs: [
    {
      q: 'What is the default quorum for a Georgia HOA annual meeting?',
      a: 'Unless the instrument or bylaws provide otherwise, persons entitled to cast more than one-third of the votes, present at the beginning of the meeting. Your bylaws may set a different number.',
    },
    {
      q: 'Can an owner vote by proxy?',
      a: 'Yes, under the Property Owners’ Association Act, and an owner that is not a natural person must. The proxy has to be dated, and it cannot purport to be revocable without notice.',
    },
    {
      q: 'How long is a proxy good for?',
      a: 'For an association incorporated as a Georgia nonprofit, 11 months unless the appointment form expressly provides a different period. Check your bylaws too.',
    },
    {
      q: 'Can proxies be signed electronically?',
      a: 'For a Georgia nonprofit, yes: the Nonprofit Code allows signing an appointment form by electronic transmission, with information showing it was authorized.',
    },
    {
      q: 'What if we never reach quorum?',
      a: 'Your bylaws usually say whether to adjourn and try again. The statute also lets owners holding at least 5 percent of the voting power call an annual meeting if the association has not held one by the last day of its fiscal year, unless the articles or bylaws set a different amount.',
    },
  ],
  related: ['annual-meeting-notice-checklist', 'owners-rights-2027', 'hoa-board-meeting-agenda', 'self-managed-hoa-georgia-first-90-days'],
  hoaDoes: [
    {
      text: 'The annual meeting kit has a live quorum counter, a check-in list, proxy tracking, a list of homes with no proxy yet, a printable sign-in sheet and printable proxy forms. Nothing is sent to residents.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'For Georgia, the kit shows the default of more than one-third unless your bylaws say otherwise, and a proxy form written to Georgia’s rules. Have your attorney read the form once.',
      route: '/meetings/[id]/quorum/proxies',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
    {
      text: 'The kit quotes the Nonprofit Code’s proxy section for associations incorporated as Georgia nonprofits. Unincorporated associations should check their bylaws.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-26-1600-ga-officer-change-proxy',
    },
    {
      text: 'Send meeting notice on a scheduled meeting opens a message already filled in with the type, date and agenda. You add the time and place, and nothing goes out until you press Send.',
      route: '/meetings/[id]',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}

export const RECORDS_REQUESTS: Guide = {
  slug: 'records-inspection-requests',
  title: 'Georgia HOA records inspection requests: how a board should respond',
  metaTitle: 'Georgia HOA records requests: how to respond',
  description:
    'An owner asked to inspect your Georgia HOA’s records. What the Nonprofit Code says, what SB 406 adds in 2027, and a calm, documented way for a board to respond.',
  eyebrow: 'Owners’ records · Georgia',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'For an association incorporated as a Georgia nonprofit, a member’s right to inspect records comes from § 14-3-1602, which turns on written notice and a stated purpose for some records.',
    'From January 1, 2027, SB 406 adds a right for owners to inspect and copy association and accounting records on written demand, including three years of finalized financial statements.',
    'A written request starts a clock you can manage. Log it the day it arrives, acknowledge it in writing and keep a list of what you provided.',
    'Names, addresses and anything your governing documents or your attorney say to protect need a decision before you hand them over.',
  ],
  sections: [
    {
      heading: 'Where an owner’s right comes from',
      body: [
        'Georgia has three layers, and a board should know which apply. Most associations are incorporated as nonprofit corporations, so the Nonprofit Corporation Code gives members a right to inspect and copy. The Property Owners’ Association Act adds a narrow right to documents. And SB 406 adds a broader owner right that begins on January 1, 2027.',
        'Your own declaration and bylaws can add to these. They cannot take away what the statute gives, and your attorney can tell you how they fit together.',
      ],
    },
    {
      heading: 'The Nonprofit Code: written notice, five business days',
      body: [
        'Under § 14-3-1602, a member who gives written notice or a written demand at least five business days ahead may inspect and copy a defined set of records. That list includes the articles, the bylaws, minutes of member meetings for the past three years, and communications to members.',
        'The five business days are the member’s lead time, not a deadline for you to deliver. Offer a reasonable time and place within that window, and put it in writing.',
      ],
      quotes: ['memberInspect'],
    },
    {
      heading: 'Records that need a stated purpose',
      body: [
        'Some records, including accounting records, excerpts from board minutes and the membership list, can be inspected only if the member meets a further test. The demand must be in good faith, for a proper purpose connected to the member’s interest, and describe the purpose and the records with reasonable particularity.',
        'The association may place reasonable restrictions on how those records are used and shared. Whether a purpose is proper is a judgment call, and a good moment to involve your attorney.',
      ],
      quotes: ['memberInspectPurpose', 'memberInspectRestrict'],
    },
    {
      heading: 'Copies of the articles and bylaws',
      body: [
        'The Property Owners’ Association Act speaks to the governing documents specifically. The sentence below is about the articles and bylaws, and it allows a reasonable charge for copies.',
      ],
      quotes: ['copiesOfBylaws'],
    },
    {
      heading: 'What SB 406 adds from January 1, 2027',
      body: [
        'SB 406 lists twelve owners’ rights, and the first is a right to inspect and obtain copies on written demand. It defines the accounting records an owner may ask for. Because the Act takes effect on January 1, 2027, boards have time to prepare a standard response before it applies.',
        'The same law requires the association to keep records about assessments, fines, fees, liens and foreclosures for at least ten years, which makes a ten-year retention rule for those files a sensible default.',
      ],
      quotes: ['right1', 'regRecords'],
    },
    {
      heading: 'What we cannot tell you',
      body: [
        'The statute text we hold does not set a number of days within which the association must respond to a SB 406 demand, a maximum copy charge, or what to redact. Do not assume one. Check your governing documents, and ask the association’s attorney, before you set a response time or a fee in writing.',
      ],
    },
  ],
  steps: [
    'Log the request the day it arrives: who asked, what they asked for, and how it came in.',
    'Reply in writing within a few days, confirming what you received and proposing a time and place.',
    'Sort the records into categories: documents any member may see, and records that need a stated purpose.',
    'For the second group, ask for the purpose in writing if the request did not state it, and consult your attorney if it is unclear.',
    'Review what you will provide, and remove anything your documents or attorney say to protect.',
    'Provide the records, note what you gave and when, and keep the request and the log together.',
  ],
  faqs: [
    {
      q: 'How long do we have to respond to an owner’s records request in Georgia?',
      a: 'The Nonprofit Code section we hold lets a member inspect after at least five business days’ written notice. The statute text we hold sets no delivery deadline for an SB 406 demand, so check your governing documents and ask your attorney.',
    },
    {
      q: 'Does an owner have to say why they want the records?',
      a: 'For the accounting records, board minute excerpts and the membership list, the Nonprofit Code requires a good-faith, proper purpose that is stated with reasonable particularity.',
    },
    {
      q: 'Can we charge for copies?',
      a: 'The Act allows a reasonable charge for copies of the articles and bylaws. For other records, it does not say in the text we hold, so check your documents.',
    },
    {
      q: 'What financial records can an owner demand from 2027?',
      a: 'Under SB 406, accounting records are the finalized balance sheet, budget, profit and loss statements and bank statements for the past three years.',
    },
    {
      q: 'How long must we keep records of fines and liens?',
      a: 'SB 406 requires at least ten years for records relating to assessments, fines, fees, liens and foreclosures, from January 1, 2027.',
    },
  ],
  related: ['owners-rights-2027', 'complaint-process', 'registration-2027', 'annual-meeting-quorum-proxies'],
  hoaDoes: [
    {
      text: 'Records requests are listed under Tickets, with Georgia’s five-business-day rule shown on each request. Minutes, financial records and the owner list also show that they need a stated purpose.',
      route: '/tickets/records',
      release: '2026-10-22-2000-georgia-2027-nonprofit-marketing',
    },
    {
      text: 'Owners can ask for association records from their portal, and the board marks each request fulfilled when it is done.',
      route: '/tickets/records',
      release: '2026-10-21-0015-everything-on',
    },
    {
      text: 'The board can print a three-year financial packet (balance sheets, income statements and adopted budgets) to answer a records request.',
      route: '/tickets/records/financial-packet',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
    {
      text: 'The owner roster is a copy of the owner list you can safely hand to an owner who asks. It shows names and addresses only, never phones, shares or balances, and every export is recorded.',
      route: '/properties/roster',
      release: '2026-10-20-1053-state-law-resale-roster',
    },
  ],
}

export const FINES_HEARINGS: Guide = {
  slug: 'fines-and-violation-hearings',
  title: 'Georgia HOA fines and violation hearings: what the statute does and does not say',
  metaTitle: 'Georgia HOA fines and violation hearings',
  description:
    'Can a Georgia HOA fine an owner, and does it need a hearing? What O.C.G.A. § 44-3-223 says, what it leaves to your documents, and a fair process for a board.',
  eyebrow: 'Enforcement · Georgia',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'A Georgia association may fine an owner only “if and to the extent provided in the instrument.” If your documents are silent, ask your attorney before you fine.',
    'The sections of the Property Owners’ Association Act that we hold do not require a hearing before a fine, and set no fine amount. The hearing step comes from your documents.',
    'A fair process still has a written notice, a chance to respond and a written decision. That is best practice, not a statute.',
    'From January 1, 2027, an unregistered association may not collect fines, and a complaint to the Secretary of State pauses collection of the fines it covers.',
  ],
  sections: [
    {
      heading: 'The power to fine comes from your documents',
      body: [
        'Georgia does not hand every association the power to fine. Section 44-3-223 gives that power only if and to the extent your instrument, meaning the declaration and related documents, provides for it. It also draws limits on what a suspension can take away.',
      ],
      quotes: ['fineAuth'],
    },
    {
      heading: 'The rule must be a real, delivered rule',
      body: [
        'A fine needs a rule behind it. The statute requires owners and occupants to comply with reasonable rules or regulations adopted under the instrument, and only those that have been provided to the owners. A rule that was never distributed is a weak basis for a fine.',
      ],
      quotes: ['reasonableRules'],
    },
    {
      heading: 'Does Georgia require a hearing?',
      body: [
        'In the statute text we hold, no. Neither § 44-3-223 nor the other sections of the Property Owners’ Association Act in our files sets a hearing step before a fine, a notice period for it, or a maximum fine. Florida and California do require hearing steps. Georgia leaves the process to the association’s instrument.',
        'So the question to answer is what your own documents require. If they call for a notice and a hearing, follow them to the letter. A fine that skips a step in your own process is the easiest kind for an owner to challenge.',
      ],
    },
    {
      heading: 'Suing to stop a violation',
      body: [
        'Besides fining, an association can go to court for an injunction. The statute sets a default of ten days’ written notice if the instrument is silent, with two exceptions.',
      ],
      quotes: ['injunctNotice'],
    },
    {
      heading: 'New in 2027: registration and the complaint pause',
      body: [
        'Under SB 406, an association that is not registered with the Secretary of State may not collect fines or fees. In the other direction, a person residing in the development can file a complaint with the Secretary of State, and that filing pauses collection of the fines and fees it covers.',
        'Payments are also applied in a set order from 2027, and the statute ranks other fees and fines last, after dues and assessments.',
      ],
      quotes: ['nonRegBar', 'stay', 'payOrder4'],
    },
    {
      heading: 'A fair hearing process, as best practice',
      body: [
        'None of this is in the statute, but a board that follows it is easier to defend. Send a written notice that names the rule, the facts and how to respond. Give the owner a real chance to be heard, ideally by people who are not the neighbor who complained. Decide in writing, state the reason, and keep the whole file.',
        'Two cautions. Do not answer unpaid fines by cutting off access to the home or the vote in board elections, which the statute forbids. And if a director has a personal stake, record it and keep that director out of the decision.',
      ],
    },
    {
      heading: 'What this page cannot tell you',
      body: [
        'We do not hold Georgia case law, so we cannot say how a court will treat a fine that skipped a step. Maximum amounts, daily fines and appeal rights all depend on your documents. Ask your attorney to review your fine schedule and your notice and hearing steps once.',
      ],
    },
  ],
  steps: [
    'Read your declaration and bylaws for the fine power, the notice period and any hearing step.',
    'Confirm the rule was adopted properly and provided to the owners.',
    'Send a written notice that states the facts, cites the rule and says how to respond.',
    'Hold a hearing if your documents call for one, or if the owner asks and your process allows it.',
    'Decide in writing and record the outcome, then send the decision to the owner.',
    'Before January 1, 2027, confirm registration, and check for a pending complaint before any fine goes out.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA fine an owner?',
      a: 'Only if and to the extent the instrument provides. The statute does not give the power on its own.',
    },
    {
      q: 'Is a hearing required before an HOA fine in Georgia?',
      a: 'Not in the sections of the Property Owners’ Association Act that we hold. Your documents may require one, and following them is the safer course.',
    },
    {
      q: 'How much can a Georgia HOA fine?',
      a: 'The statute text we hold sets no maximum. Check your documents, and ask your attorney whether your schedule is reasonable.',
    },
    {
      q: 'Can an HOA take away an owner’s vote or block access because of fines?',
      a: 'No. The statute says no suspension may deny an owner or occupant access to the lot or the right to vote in board elections based on failure to pay outstanding fines.',
    },
    {
      q: 'What changes in 2027?',
      a: 'An unregistered association may not collect fines, and a complaint to the Secretary of State pauses collection of the related fines and fees until the hearing officer’s conclusions, which can be extended by 15 days.',
    },
  ],
  related: ['violation-notice-checklist', 'hoa-violation-letter-georgia', 'late-fee-limits', 'complaint-process'],
  hoaDoes: [
    {
      text: 'On a violation’s page, the board can draft a second notice, a hearing notice, a fine notice or a decision letter. Every letter waits in Approvals, and nothing is sent to the homeowner.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
    {
      text: 'An owner can ask for a hearing from their violation page. The board schedules it, records the panel and the outcome, and drafts the hearing notice. The app requires the hearing record before a fine only in Florida and California; in Georgia your documents decide.',
      route: '/violations/[id]',
      release: '2026-10-21-0015-everything-on',
    },
    {
      text: 'From January 1, 2027, the app holds back fines and fee letters for a home while a Secretary of State complaint is open. Record the complaint on the home’s collections file. The only override is “attorney advised”, and it is logged.',
      route: '/properties/[id]',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
  ],
}
