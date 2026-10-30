// SEO batch 7: how a board applies a credit to an owner's balance. The
// fixtures hold no overpayment rule, so only the payment-order and
// "accept any amount" text is quoted; the steps are tagged as best practice.

import type { Checklist } from './checklists'

export const APPLY_CREDIT_CHECKLIST: Checklist = {
  slug: 'apply-hoa-credit-to-owner-balance-checklist',
  path: '/templates/apply-hoa-credit-to-owner-balance-checklist',
  title: 'How a board applies a credit to an owner’s HOA balance: a checklist',
  metaTitle: 'Apply an HOA credit to a balance: checklist',
  description:
    'A free, printable checklist for a board applying an owner’s credit on account to a charge, with the Georgia payment order quoted and a note for the record.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this when an owner has money on account, from an overpayment or a payment made ahead, and the board is putting it against a charge. It is built for Georgia associations but the steps work anywhere.',
    'Georgia’s statute text we hold does not cover credits. It does rank the order payments are applied, and we quote it below. Items tagged best practice are our suggestions, not requirements. This is not legal advice. Check your documents and ask your attorney.',
  ],
  items: [
    { text: 'The credit is confirmed on the owner’s ledger: amount, date it arose, and the payment it came from.', basis: 'practice' },
    { text: 'The open charges are listed, oldest first, with their type: regular, special, specific, or other fee or fine.', basis: 'practice' },
    { text: 'Regular assessments that are behind are chosen before anything else.', detail: 'Payments are ranked: dues until current, then special, then specific, then other fees and fines.', basis: 'statute' },
    { text: 'Your documents and written policy are checked for anything that changes who decides where a credit goes.', basis: 'practice' },
    { text: 'The owner’s wishes are noted if they asked for a particular charge, and the board has checked that it fits the payment order.', basis: 'practice' },
    { text: 'The amount to apply is set: all of the credit, or only enough to clear the charge.', detail: 'Never apply more than the charge has left.', basis: 'practice' },
    { text: 'The credit is applied to the charge and the remaining balance on both sides is read back.', basis: 'practice' },
    { text: 'No payment is refused or sent back because it was larger than the charge.', basis: 'statute' },
    { text: 'The owner is told what was applied, to which charge, and what credit is left.', basis: 'practice' },
    { text: 'Any late fee that landed while the credit sat unused is reviewed and reversed if your policy says so.', basis: 'practice' },
    { text: 'A second board member initials the entry for any amount over your approval limit.', basis: 'practice' },
    { text: 'The date, amount, charge and who applied it are saved with the account and noted in the minutes.', basis: 'practice' },
  ],
  quotes: ['payOrderIntro', 'payOrder1', 'payOrder2', 'payOrder3', 'payOrder4', 'noRefuse'],
  quotesHeading: 'The Georgia text behind this checklist',
  faqs: [
    {
      q: 'Does Georgia law say how to apply an owner’s credit?',
      a: 'The text we hold ranks the order funds are applied to charges, but has no section on credits or overpayments. Follow your documents and ask your attorney.',
    },
    {
      q: 'Can the owner pick which charge the credit pays?',
      a: 'Under the payment order quoted above, funds go to dues first. Check any request against that order before you agree.',
    },
    {
      q: 'Do I apply the whole credit or just enough?',
      a: 'Either can be right. Apply only up to what the charge has left, and keep the rest as credit.',
    },
    {
      q: 'How long should I keep the record?',
      a: 'Keep it with the account and ask your attorney how long. Georgia’s registration law has its own record-keeping rule for assessment and lien records.',
    },
  ],
  related: ['overpayments-credits', 'georgia-hoa-payment-order-sb-406', 'hoa-treasurer-duties', 'georgia-hoa-collections-notice'],
  datePublished: '2026-10-30',
  dateModified: '2026-10-30',
  howTo: true,
  hoaDoes: [
    {
      text: 'The Dues list shows a "Credit $X" badge for any home with unapplied credit. It opens the home’s page, where Apply credit puts some or all of the credit against one open charge.',
      route: '/dues',
      release: '2026-10-28-0710-dues-credit-badge',
    },
    {
      text: 'The owner sees "Credit on account: $X" on their Dues and Pay pages, with a note that the board applies it.',
      route: '/resident/dues',
      release: '2026-10-28-0306-credit-digest-speed',
    },
  ],
}
