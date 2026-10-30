// SEO batch 11: the Georgia statement of amounts due at resale, and the Texas
// resale certificate. Statute text only through the quote bank. The Georgia
// quotes (stmt*) are O.C.G.A. § 44-3-232(d) from the Article 6 fixture; the
// Texas quotes are Property Code chapter 207 from tx-prop-207-2026.txt.
//
// Fixture limits, stated on the pages: the Georgia fixture holds the Property
// Owners' Association Act (Article 6). The condominium article has its own
// text, which the page does not describe. The page does not claim a Georgia
// statute that uses the word "estoppel" for this. The Texas fixture is
// chapter 207 only. Product claims are limited to the estoppel and resale
// paperwork screen and the Compliance page.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const GA_ESTOPPEL: Guide = {
  slug: 'georgia-hoa-estoppel-letter-resale',
  path: '/guides/georgia-hoa-estoppel-letter-resale',
  title: 'Georgia HOA resale letter: the statement of amounts due',
  metaTitle: 'Georgia HOA estoppel letter at resale',
  description:
    'A Georgia HOA has five business days to answer a written request for a statement of amounts due, or the lien is lost against the buyer. The rule, quoted.',
  eyebrow: 'Georgia · Home sales',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'When a Georgia home is sold or refinanced, the title company or lender asks the association what the owner owes. Georgia’s Property Owners’ Association Act calls the answer a statement of amounts due. Many boards call it an estoppel letter or a resale letter.',
    'The clock is short. Under O.C.G.A. § 44-3-232(d), the association has five business days from receipt of a written request to furnish the statement. Miss it and the lien for assessments is extinguished as to the buyer or lender in that deal.',
    'The statute lets the association charge up to $10.00, and only if the governing instrument provides for a fee.',
    'This is a plain-language guide to one subsection, not legal advice. Condominium associations are under a different article of the Code that this page does not cover.',
  ],
  sections: [
    {
      heading: 'Who can ask, and what they can ask for',
      body: [
        'Four kinds of people can ask: a lot owner, a mortgagee of the lot, a person who has signed a contract to buy the lot, and a lender considering a loan secured by the lot. In practice the request often comes from a closing attorney or title company acting for one of them.',
        'What they are entitled to is a statement of the assessments past due and unpaid, with the late charges and interest that apply to that lot. The text we hold does not use the word estoppel, and it does not list other contents such as the regular assessment amount or transfer fees. Those extras are a matter for your documents and your attorney.',
      ],
      quotes: ['stmtRight'],
    },
    {
      heading: 'What the request must look like',
      body: [
        'The request has to be in writing and delivered to the association’s registered office. It also has to give an address where the statement should be sent.',
        'That makes the registered office the place where the clock starts. If the registered address is a former president’s house or an old management company, a request can sit unopened while the five days run. Check who receives mail at that address before a sale ever comes up.',
      ],
      quotes: ['stmtWriting'],
    },
    {
      heading: 'The five-business-day deadline',
      body: [
        'The statute counts five business days from receipt of the request. The statement has to be mailed or otherwise furnished to the address named in the request, and it covers the amounts due and payable at the end of that five-day period.',
        'The penalty is the reason boards take this rule seriously. If the association does not furnish the statement in time, the lien for assessments is extinguished and of no further force as to the title or interest the buyer or lender acquires in that transaction.',
      ],
      quotes: ['stmtFiveDays'],
    },
    {
      heading: 'The statement binds the association',
      body: [
        'What the statement says binds the association and every lot owner. If the statement leaves out a charge, the association will have a hard time collecting it from the buyer later. That is why a second person should check the figures against the ledger before the statement goes out.',
      ],
      quotes: ['stmtBinding'],
    },
    {
      heading: 'The $10.00 fee',
      body: [
        'The association may require a fee of no more than $10.00 before it issues the statement, but only if the instrument provides for one. Read your declaration before you quote a fee to a closing attorney. If the declaration is silent, the statute does not give you a fee on its own.',
        'The text we hold does not address charges for rush delivery, a longer resale package or a transfer fee. Your declaration and your attorney decide those.',
      ],
      quotes: ['stmtFee'],
    },
    {
      heading: 'When the owner is behind on dues',
      body: [
        'A statement that shows a balance is still a statement. The board must send it on time and accurately, even when the account is delinquent. The collections steps, including the written notice Georgia requires before attorney’s fees are claimed, run on their own clocks. Our attorney’s-fee notice checklist walks through that notice, so the figures on the statement and the figures in a fee demand come from the same ledger.',
        'If the balance will be paid at closing, ask the closing attorney to confirm the payoff in writing against the statement.',
      ],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the Property Owners’ Association Act text. Subsection (d) reads the same in the two bills that reproduce it and SB 406 does not change it, but a board should still confirm the current text on the official Code before relying on it. We do not have the condominium article’s version of this rule, so condominium associations should ask their attorney.',
      ],
    },
  ],
  steps: [
    'Confirm who receives mail at the association’s registered office and how fast it reaches the board.',
    'Log the date a written request arrives, and the address it asks you to reply to.',
    'Count five business days from receipt and put the date on the board calendar.',
    'Pull the owner’s ledger and list the past-due assessments, late charges and interest.',
    'Have a second board member check every figure against the books.',
    'Check the declaration for a fee, and charge no more than $10.00 and only if it allows one.',
    'Mail or deliver the statement to the address in the request, and keep proof of how and when.',
  ],
  faqs: [
    {
      q: 'How long does a Georgia HOA have to give a statement of amounts due?',
      a: 'Five business days from receipt of the written request, under O.C.G.A. § 44-3-232(d).',
    },
    {
      q: 'What happens if the association is late?',
      a: 'The lien for assessments is extinguished as to the title or interest the purchaser or lender acquires in that transaction. The statute does not say the owner’s debt disappears.',
    },
    {
      q: 'Can the association charge for the statement?',
      a: 'A fee of no more than $10.00 may be required, but only if the instrument so provides.',
    },
    {
      q: 'Does Georgia have an estoppel certificate statute like Florida’s?',
      a: 'The Property Owners’ Association Act text we hold has the statement of amounts due and no separate estoppel certificate. Florida’s statute is a different rule with different deadlines and fees.',
    },
    {
      q: 'Does a request by email count?',
      a: 'The statute says the request shall be in writing and delivered to the registered office of the association. Ask your attorney whether an email to the board meets that, and treat anything that reaches the registered office as the start of the clock.',
    },
  ],
  related: ['georgia-hoa-assessment-lien-rules', 'attorney-fee-notice-checklist', 'florida-hoa-estoppel-certificate-rules', 'texas-hoa-resale-certificate-chapter-207'],
  hoaDoes: [
    {
      text: 'On a property, the board can prepare the paperwork a sale needs. For Georgia it is built on the statement of amounts due, with the five-business-day deadline and the $10.00 fee limit shown, and a warning that missing the deadline loses the lien against the buyer.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-20-1053-state-law-resale-roster',
    },
    {
      text: 'You cannot print until every blank is filled and you tick that you have verified the figures. Nothing is emailed, and each certificate prepared or printed is recorded in the activity log.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
    {
      text: 'The Compliance page lists the Georgia obligations that carry a deadline, including the five-business-day statement of amounts due, with an overdue banner.',
      route: '/compliance',
      release: '2026-10-21-1930-elections-compliance',
    },
  ],
}

export const TX_RESALE: Guide = {
  slug: 'texas-hoa-resale-certificate-chapter-207',
  path: '/guides/texas-hoa-resale-certificate-chapter-207',
  state: 'TX',
  title: 'Texas HOA resale certificate: contents, deadline and fee cap',
  metaTitle: 'Texas HOA resale certificate rules',
  description:
    'A Texas HOA must deliver a resale certificate within 10 business days of a written request. Contents, the $375 fee cap and the late-fee rule, quoted.',
  eyebrow: 'Texas · Home sales',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'When a Texas home is sold, the association must give the seller, the buyer or the title company a package: the restrictions, the bylaws and rules, and a resale certificate. Chapter 207 of the Property Code sets the deadline at 10 business days from a written request.',
    'The certificate lists sixteen items, from the assessment amount and what is owed to reserves, the operating budget, lawsuits, insurance and transfer fees. It has to be prepared no earlier than 60 days before it is delivered.',
    'The fee cap is $375 for the package and $75 for an update. If the certificate is late, the association may not charge a fee at all.',
    'This is a plain-language guide to chapter 207, not legal advice. Condominiums are outside this chapter.',
  ],
  sections: [
    {
      heading: 'The 10-business-day deadline',
      body: [
        'The clock starts when the association receives a written request for subdivision information from the owner or the owner’s agent, a purchaser or the purchaser’s agent, or a title insurance company acting for either. For a purchaser’s request, the association may first ask for reasonable evidence that the purchaser has a right to acquire the property.',
        'Three items go out together: the restrictions, the bylaws and rules, and the certificate.',
      ],
      quotes: ['txResaleDeadline', 'txResaleFresh'],
    },
    {
      heading: 'What the certificate must contain',
      body: [
        'The statute lists sixteen items. Five of them are the ones boards most often have to dig for: the regular assessment, what is owed on the lot, any reserves for capital expenditures, the current operating budget and balance sheet, and conditions on the lot that the board actually knows violate the restrictions.',
        'The list also covers right of first refusal and other restraints on transfer, approved special assessments, lawsuits and unsatisfied judgments, a certificate of insurance, government notices, the managing agent, whether the restrictions allow foreclosure of the lien, and every transfer fee with who it is paid to.',
      ],
      quotes: ['txResaleContents', 'txResaleAssessments', 'txResaleOwed', 'txResaleReserves', 'txResaleBudget', 'txResaleViolations', 'txResaleTransferFees'],
    },
    {
      heading: 'The fee cap and the late-fee rule',
      body: [
        'The association may charge a reasonable and necessary fee, not above $375, to assemble, copy and deliver the package, and not above $75 for an update. It may ask for payment before it starts, but it may not process the payment until the certificate is ready.',
        'Lateness has a price. If the certificate is not provided inside the 10 business days, the association may not charge a fee.',
      ],
      quotes: ['txResaleFee', 'txResaleLateFee'],
    },
    {
      heading: 'The request must say where to send it',
      body: [
        'A request that does not name the person and place to send the information is not effective. When a request lands in the board inbox without an address, write back at once so the clock question does not become an argument later.',
      ],
      quotes: ['txResaleAddress'],
    },
    {
      heading: 'Updates inside 180 days',
      body: [
        'If a sale drags on, the requester can ask for an update. The association has seven business days to deliver an updated certificate. It restates whether the association waives any right of first refusal, the status of unpaid assessments and any changes since the original.',
        'The update request must come within 180 days of the original certificate, and only from the party who asked for it.',
      ],
      quotes: ['txResaleUpdate', 'txResaleUpdateWindow'],
    },
    {
      heading: 'When the association does not deliver',
      body: [
        'The owner can send a second request. If the association still has not delivered before the fifth business day after that second request was mailed by certified mail or hand delivered, the owner can seek a court order, a judgment against the association of up to $5,000, and court costs and attorney’s fees. The owner can also give the buyer an affidavit that two written requests went unanswered.',
      ],
      quotes: ['txResaleSecond', 'txResaleJudgment'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 207 only. We do not cover how a particular title company wants the package formatted, what your restrictions say about transfer fees or rights of first refusal, or the chapter 209 collection rules. Ask your attorney when a sale involves a restraint on transfer or a disputed balance.',
      ],
      quotes: ['txResaleCondo'],
    },
  ],
  steps: [
    'Log the date and time each written request arrives, and who asked.',
    'Check that the request names where to send the package. If not, write back for it.',
    'Count 10 business days from receipt and put the deadline on the board calendar.',
    'Pull the restrictions, the bylaws and rules, the budget, the balance sheet and the certificate of insurance.',
    'Fill in the sixteen items, with the owner’s balance taken from the ledger on a date within 60 days of delivery.',
    'Have a second board member check the figures, then sign and date the certificate.',
    'Charge no more than the cap, and nothing at all if the package will go out late.',
  ],
  faqs: [
    {
      q: 'How long does a Texas HOA have to deliver a resale certificate?',
      a: 'Ten business days after it receives a written request, and the evidence of the requestor’s authority is received and verified, under § 207.003(a).',
    },
    {
      q: 'How much can the association charge?',
      a: 'A reasonable and necessary fee of up to $375 for the package, and up to $75 for an update. No fee at all if the certificate is late.',
    },
    {
      q: 'How old can the certificate’s information be?',
      a: 'The certificate must be prepared no earlier than the 60th day before it is delivered.',
    },
    {
      q: 'Can a buyer ask for an update?',
      a: 'The party who requested the original can ask for an update within 180 days. The association has seven business days to deliver it.',
    },
    {
      q: 'Does chapter 207 apply to a condominium?',
      a: 'No. The chapter says it does not apply to a condominium council of owners under chapter 81 or a condominium unit owners’ association under chapter 82.',
    },
  ],
  related: ['texas-hoa-management-certificate', 'florida-hoa-estoppel-certificate-rules', 'georgia-hoa-estoppel-letter-resale', 'hoa-treasurer-duties', 'texas-hoa-third-party-collections-notice'],
  hoaDoes: [
    {
      text: 'On a property, the board can prepare a Texas resale certificate. It shows the 10-business-day deadline, the $375 fee cap and that no fee applies if it is late. The app fills in the assessment, the amount owed and open violations.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-20-1053-state-law-resale-roster',
    },
    {
      text: 'Every other required item is a blank you must fill in before printing, and you tick that you have verified the figures. Nothing is emailed.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
  ],
}
