// SEO batch 7: Georgia overpayments and credits, and the SB 406 payment order.
// Same truth rules as the other guides: statute text only through the quote
// bank, product claims only with an apps/hoa route and a release note that
// exist. The fixtures hold no text on overpayments or credits, so the credit
// guide says so and quotes only the payment-order and "accept any amount" text.

import type { Guide } from './types'

const PUBLISHED = '2026-10-30'

export const OVERPAYMENTS_CREDITS: Guide = {
  slug: 'overpayments-credits',
  path: '/guides/georgia-hoa-overpayments-and-credits',
  title: 'Georgia HOA overpayments and credits on an owner’s account',
  metaTitle: 'Georgia HOA overpayments and account credits',
  description:
    'An owner paid too much, or paid early. How a Georgia HOA board can track the extra as a credit on account, what the statute says, and what it leaves out.',
  eyebrow: 'Georgia · Money',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'An owner sends $600 against a $450 charge. The extra $150 is not income yet and it is not a gift. It is the owner’s money sitting on the association’s books until a charge uses it up.',
    'The Georgia text we hold says nothing about overpayments or credits. It does say an association may not refuse a payment of any amount, so a board should expect odd amounts and have a plan for them.',
    'Keep the extra as a visible credit on that one home, tell the owner it is there, and apply it to a charge when one comes due or when the owner asks.',
    'This is a bookkeeping guide, not legal advice. Your documents and your attorney decide anything the statute does not.',
  ],
  sections: [
    {
      heading: 'How an overpayment happens',
      body: [
        'It is rarely a mystery. An owner pays the old amount after dues went up. A couple pays twice, once by check and once online. Someone pays a year ahead to avoid the hassle. A closing agent sends a payoff figure that was a little high.',
        'In each case the money belongs to the owner until it is used against something they owe. If the board lumps it in with the month’s receipts and forgets it, the account looks paid up while the books carry a liability nobody can see.',
      ],
    },
    {
      heading: 'What Georgia’s text says, and what it does not',
      body: [
        'We searched the Georgia statute text held in our fixtures for overpayments, prepaid assessments and credits. It has no section on them. So there is no statutory rule on how long a board may hold a credit, whether it must refund one, or whether a credit earns anything.',
        'What the text does say bears on the front end. An association cannot refuse a payment in any amount for an assessment. That means a board cannot turn away a large payment just because it is more than the charge.',
      ],
      quotes: ['noRefusalIntro', 'noRefuse'],
    },
    {
      heading: 'Where the credit rules actually live',
      body: [
        'Your declaration, bylaws and any collection policy may speak to prepayment and refunds. Read them first. If they are silent, the board should adopt a short written policy by resolution, so every owner is treated the same way.',
        'A sensible policy answers three questions. Does an unapplied credit go to the next charge automatically, or only when the owner or the board says so? Will the board refund a credit on request, and after how long? What happens to a credit when the home is sold? Have your attorney read the policy before the board votes.',
      ],
    },
    {
      heading: 'Applying a credit comes after the payment order',
      body: [
        'From January 1, 2027, SB 406 sets the order in which an association applies funds an owner remits. Regular assessments or dues come first, until current. If a credit is applied to a charge, the board should still be able to show that older regular dues were not skipped in favor of a fine.',
        'The next guide in this set covers that order in full. For credits the practical point is simple: when you apply one, start with the oldest regular assessment.',
      ],
      quotes: ['payOrderIntro', 'payOrder1'],
    },
    {
      heading: 'Credits and the foreclosure threshold',
      body: [
        'A credit can change whether an account is delinquent enough to matter. A home that owes $2,400 in dues but has $600 of unapplied credit does not really owe $2,400. The board should net the two before it talks about a lien or a threshold.',
        'Run any collections step on the balance after credit. A notice that demands the gross figure while the books show a credit invites a dispute you did not need.',
      ],
    },
    {
      heading: 'Tell the owner the credit is there',
      body: [
        'The common complaint is not that the board kept the credit. It is that nobody told the owner it existed, and then a late fee landed on a month the credit would have covered.',
        'Say it in plain words on the statement or the next notice: the amount, the date it arose, and what the board will do with it. If the owner wants it applied now, apply it and note the date.',
      ],
    },
  ],
  steps: [
    'Record the full amount received, then split it: the part that clears the charge and the part that is extra.',
    'Hold the extra as a credit on that one home, not in the general receipts.',
    'Tell the owner the credit exists, the amount, and how the board will use it.',
    'Check your documents and any written policy for prepayment and refund rules.',
    'Apply the credit to the oldest regular assessment first, then to later charges.',
    'Write the date, the amount and the charge it went to, so the history can be rebuilt.',
    'Net the credit before any collections step, and again at a sale or payoff.',
  ],
  faqs: [
    {
      q: 'Does Georgia law require an HOA to refund an overpayment?',
      a: 'The statute text we hold has no section on overpayments or refunds. Look to your declaration, bylaws and any written policy, and ask your attorney.',
    },
    {
      q: 'Can the board refuse a payment that is too large?',
      a: 'The statute says an association may not refuse payment in any amount for an assessment. See the quote above. Take it, record it, and keep the extra as a credit.',
    },
    {
      q: 'Should a credit apply automatically to the next charge?',
      a: 'That is a board choice unless your documents say otherwise. Whichever you pick, write it down and use it for every owner.',
    },
    {
      q: 'Does a credit stop late fees?',
      a: 'Only if it is applied to the charge before the due date, or your policy says it applies automatically. Tell the owner either way.',
    },
    {
      q: 'What happens to a credit when a home is sold?',
      a: 'Your documents or policy should say. Many boards settle it on the payoff or estoppel figure. Ask your attorney before the first sale comes up.',
    },
  ],
  related: ['georgia-hoa-payment-order-sb-406', 'special-assessments', 'late-fee-limits', 'hoa-treasurer-duties'],
  hoaDoes: [
    {
      text: 'Record payment posts every part of a payment at once. Money paid beyond what is owed is kept as a credit on the home’s page and the owner’s ledger.',
      route: '/dues',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
    {
      text: 'On the Dues list, a home with unapplied credit shows a "Credit $X" badge that opens the home’s page, where the Apply credit button puts the credit against a charge.',
      route: '/dues',
      release: '2026-10-28-0710-dues-credit-badge',
    },
    {
      text: 'A resident with credit sees "Credit on account: $X" on the Dues and Pay pages, with a note that the board applies it. The amount due shown is not changed by the credit.',
      route: '/resident/dues',
      release: '2026-10-28-0306-credit-digest-speed',
    },
  ],
}

export const PAYMENT_ORDER: Guide = {
  slug: 'georgia-hoa-payment-order-sb-406',
  path: '/guides/georgia-hoa-payment-order-sb-406',
  title: 'Georgia HOA payment order under SB 406: which charge a payment pays first',
  metaTitle: 'Georgia HOA payment order under SB 406',
  description:
    'SB 406 ranks what an owner’s payment must pay first: dues, special assessments, specific assessments, then other fees and fines. The words and an example.',
  eyebrow: 'Georgia · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Starting January 1, 2027, all funds an owner remits must be applied in a ranked order: regular assessments, then special assessments, then specific assessments, then other fees and fines.',
    'Each rank is applied until current. A fine cannot be paid off while regular dues are behind.',
    'The ranked list is short, and the statute gives no example. A board should write its own so every payment is posted the same way.',
    'The list does not name interest, collection costs or attorney’s fees. Ask your attorney where your association puts them.',
  ],
  sections: [
    {
      heading: 'The rule in the statute’s words',
      body: [
        'This is the opening of the section and its four ranks, quoted from the SB 406 fixture. The Act becomes effective on January 1, 2027, except as it provides otherwise, so plan to post payments this way from that date.',
      ],
      quotes: ['payOrderIntro', 'payOrder1', 'payOrder2', 'payOrder3', 'payOrder4'],
    },
    {
      heading: 'What each rank means in practice',
      body: [
        'Regular assessments or dues are the ordinary operating charges, including reserve contributions. Special assessments cover costs outside the budget, like a storm repair. Specific assessments are charged to one owner, and the Act defines them to include fees and fines for nonpayment, insufficient payment or untimely payment of any assessment, or for violating a covenant.',
        'So late charges and violation fines sit in the specific and the other fees and fines ranks. Check the definition against how your own ledger codes them.',
      ],
      quotes: ['specificDefB'],
    },
    {
      heading: 'A worked example',
      body: [
        'An owner is behind on $300 of dues, owes a $500 special assessment and a $50 fine. They send $400.',
        'The first $300 clears the dues, because regular assessments come first until current. The remaining $100 goes to the special assessment, which leaves $400 of it open. Nothing reaches the fine. The owner does not choose, and neither does the board.',
        'Under this rule the board cannot post that $400 to the fine because the owner wrote "fine" on the memo line.',
      ],
    },
    {
      heading: 'Two things the board may not do',
      body: [
        'The same section limits what an association may do about payments. It may not refuse a payment of any amount for an assessment, and it may not assess or collect accelerated assessments. Both rules touch the payment order: a partial payment gets posted in rank order and the account stays open, and the board does not demand the rest of the year at once.',
      ],
      quotes: ['noRefusalIntro', 'noRefuse', 'noAccel'],
    },
    {
      heading: 'What the list does not say',
      body: [
        'The ranked list stops at "other fees and fines." It does not name interest, collection costs or attorney’s fees, and we do not know which rank a court would give them. Ask your attorney before you decide, and then post them the same way every time.',
        'The text we hold also gives no rule for an overpayment. If an owner pays more than every open charge, the extra is a credit. See the guide on overpayments and credits.',
      ],
    },
    {
      heading: 'Why the order matters for collections',
      body: [
        'Posting out of order does more than annoy an owner. It can leave regular assessments looking behind when they were paid, or paid up when they were not, and the regular and special balance is what drives the lien and foreclosure analysis.',
        'A clean ledger that shows each payment, the rank it went to and the remaining balance by rank is the best defense a self-managed board has.',
      ],
    },
  ],
  steps: [
    'Split every charge on the ledger into its rank: regular, special, specific, other fees and fines.',
    'Before posting a payment, list what is open in each rank, oldest first.',
    'Apply the payment to regular assessments until current, then special, then specific, then other fees and fines.',
    'Ignore a memo line that tells you to pay a different charge first.',
    'Ask your attorney where interest, collection costs and attorney’s fees go, and write the answer down.',
    'Keep a receipt that shows how each payment was split.',
    'Record the policy in the board minutes before January 1, 2027.',
  ],
  faqs: [
    {
      q: 'When does the Georgia payment order start?',
      a: 'SB 406 says that, except as it provides otherwise, the Act becomes effective on January 1, 2027. Plan to post payments in rank order from then.',
    },
    {
      q: 'Can an owner tell the board which charge to pay?',
      a: 'The statute says all funds remitted shall be applied in the ranked order. A note on a check does not change that.',
    },
    {
      q: 'Where do late fees and fines rank?',
      a: 'The Act defines specific assessments to include fees or fines for nonpayment or violating a covenant, and ends the list with other fees and fines. Confirm the split with your attorney.',
    },
    {
      q: 'Does the order apply to condominiums?',
      a: 'The section we quote is in the owners’ association chapter. Condominiums are under a different statute. Check which governs you.',
    },
    {
      q: 'What if the owner pays more than everything owed?',
      a: 'The text we hold does not say. Treat the extra as a credit on account and follow your policy. See the overpayments guide.',
    },
  ],
  related: ['overpayments-credits', 'georgia-hoa-payment-plan-agreement', 'special-assessments', 'foreclosure-threshold-2027', 'late-fee-limits'],
  hoaDoes: [
    {
      text: 'Record payment posts every part of a payment at once, and if any part fails nothing is posted. Money beyond what is owed is kept as a credit.',
      route: '/dues',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
    {
      text: 'The collections case shows the balance that counts toward the foreclosure threshold: regular and special assessments owed, less unapplied credit.',
      route: '/properties/[id]',
      release: '2026-10-26-1400-ga-foreclosure-threshold',
    },
  ],
}
