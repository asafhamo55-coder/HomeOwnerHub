// SEO batch 8: a board conflict-of-interest disclosure checklist. The fixtures
// hold one Georgia text on the topic: SB 406's owner expectation that directors
// disclose a conflicting interest (and the good-faith duty beside it). Nothing
// else is quoted. The steps are tagged best practice.

import type { Checklist } from './checklists'

export const CONFLICT_DISCLOSURE_CHECKLIST: Checklist = {
  slug: 'hoa-board-conflict-of-interest-disclosure-checklist',
  path: '/templates/hoa-board-conflict-of-interest-disclosure-checklist',
  title: 'HOA board conflict-of-interest disclosure checklist for a vendor or bid decision',
  metaTitle: 'HOA board conflict of interest checklist',
  description:
    'A free, printable checklist for a board to record each director’s conflict disclosure before awarding a bid or approving a vendor, with the Georgia SB 406 text.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this before the board votes to award a bid, approve a vendor or sign a contract. It is built for Georgia associations, where SB 406 says owners may expect directors to disclose a conflicting interest, but the steps work anywhere.',
    'The Georgia text we hold says that owners can expect disclosure. It does not set a form, a deadline or a penalty, and it does not say whether a conflicted director may vote. Items tagged best practice are our suggestions, not requirements. This is not legal advice. Check your bylaws and ask your attorney.',
  ],
  items: [
    { text: 'The decision is named: bid award, vendor approval or contract, with the vendor and the amount.', basis: 'practice' },
    { text: 'Every director is asked, in writing or on the record, whether they have a conflicting interest in the transaction.', detail: 'Owners can expect directors to disclose any conflicting interest with respect to a transaction.', basis: 'statute' },
    { text: 'The question covers family members, employers, business partners and any company the director owns or works for.', basis: 'practice' },
    { text: 'Each director answers "no conflict" or "conflict" before the vote, not after.', basis: 'practice' },
    { text: 'A director who has a conflict gives a short note: who, what and how.', basis: 'practice' },
    { text: 'Your bylaws are checked for what a conflicted director may do: speak, vote or leave the room.', basis: 'practice' },
    { text: 'A conflicted director steps out of the vote if your bylaws or policy say so, and the minutes show it.', basis: 'practice' },
    { text: 'The remaining directors still have a quorum for the vote.', basis: 'practice' },
    { text: 'The board compares at least two bids where the project is large enough to justify it, and the comparison is kept.', basis: 'practice' },
    { text: 'The decision is made in good faith, with the care an ordinary, prudent person would use.', basis: 'statute' },
    { text: 'The disclosures, the notes and the vote are saved with the decision record.', basis: 'practice' },
    { text: 'Any new conflict that appears later is disclosed to the board as soon as the director learns of it.', basis: 'practice' },
  ],
  quotes: ['right10', 'right9'],
  quotesHeading: 'The Georgia text behind this checklist',
  faqs: [
    {
      q: 'Does Georgia law require a director to disclose a conflict of interest?',
      a: 'SB 406 lists, among the rights owners have, the expectation that directors disclose any conflicting interest to the other directors. The text we hold sets no form or deadline.',
    },
    {
      q: 'Can a conflicted director still vote?',
      a: 'The text we hold does not say. Check your bylaws and ask your attorney. Many associations require the director to step out.',
    },
    {
      q: 'When does the SB 406 text start to apply?',
      a: 'It takes effect January 1, 2027, as part of the new owners’ association chapter.',
    },
    {
      q: 'Does a disclosure have to be in writing?',
      a: 'The statute text does not say. A short written note is easy to find later and settles any argument about what was said.',
    },
  ],
  related: ['georgia-hoa-assessment-lien-rules', 'hoa-board-meeting-agenda', 'hoa-treasurer-duties', 'owners-rights-2027'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'On each bid page, every board member records "no conflict" or "conflict: recused" with a short note. For Georgia associations from January 1, 2027, the bid cannot be awarded until every board member has disclosed. That gate is HomeownerHub’s own rule, built on the SB 406 expectation.',
      route: '/rfps/[id]/bids/[bidId]',
      release: '2026-10-26-2150-conflict-disclosure-federal-deadlines',
    },
    {
      text: 'The same disclosure panel is on the vendor page, so a vendor approval carries the same record.',
      route: '/vendors/[id]',
      release: '2026-10-26-2150-conflict-disclosure-federal-deadlines',
    },
  ],
}
