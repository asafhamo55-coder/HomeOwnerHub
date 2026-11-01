// SEO batch 24: three Georgia guides on the Property Owners' Association Act.
//   1. Owners taking control of the association from the declarant (44-3-232.1).
//   2. Selling or foreclosing a lot: who owes the unpaid assessments (44-3-225(b)-(d)).
//   3. Charging some lots and not others (44-3-225(a)).
// Statute text only through the quote bank (gc*, sale*, alloc*, noExempt), checked
// word for word by georgia-guides.test.ts against ga-ocga-44-3-art6-2026.txt. Every
// other sentence restates a quote and adds no rule. We hold only Article 6, so the
// pages do not describe sections outside it (44-3-227, 44-3-230 and 44-3-232(d) are
// named only because the quoted text names them).
// Product claim: only the sale page, reusing the estoppel line already verified in
// guides-l.ts (route and release note exist). The other two use hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-01'

export const GA_DECLARANT_CONTROL: Guide = {
  slug: 'georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
  path: '/guides/georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
  title: 'How Georgia owners can take control of an HOA from the developer (§ 44-3-232.1)',
  metaTitle: 'Georgia HOA: owners take control early',
  description:
    'O.C.G.A. 44-3-232.1 lets owners take control of an HOA early if the declarant misses six duties. The notice, the 30 days to cure, the court and the fees.',
  eyebrow: 'Georgia · Declarant control',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In a new Georgia neighborhood the developer, called the declarant, usually runs the association at first. Section 44-3-232.1 of the Property Owners’ Association Act lets the right to control pass to the owners early if the declarant fails to do any one of six listed things.',
    'The path is short. An owner, alone or with others, sends the declarant written notice by certified mail or statutory overnight delivery. The declarant has 30 days to cure. If it does not, any owner can ask the superior court to order an election or transfer control.',
    'If the owners win, the court must award their reasonable attorney’s fees and costs. The section is the only remedy it creates.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association. An attorney should review any notice before it is sent.',
  ],
  sections: [
    {
      heading: 'When this section matters',
      body: [
        'The text opens with “notwithstanding and prior to the usual expiration” of the declarant’s control, so the date in your declaration does not block it.',
      ],
      quotes: ['gcWhen'],
    },
    {
      heading: 'The six failures that trigger it',
      body: [
        'The right to control can pass only if the declarant fails to do one of the following. Each is quoted below exactly as the statute prints it.',
        'The first two are about the association’s legal existence and its board.',
      ],
      quotes: ['gcReg', 'gcBoard'],
    },
    {
      heading: 'Lists, meetings, budgets and taxes',
      body: [
        'The next four are about information and money. An owner can ask in writing for the list of directors and officers. The members must meet at least once a year. The budget and the assessment notice must go out within 30 days after the fiscal year starts. And property taxes on the common property cannot go unpaid for two years or more.',
        'Notice that item five refers to “condominium instruments.” That is the wording of the statute. We quote it as printed and do not say how a court would read it for a Property Owners’ Association Act community.',
      ],
      quotes: ['gcList', 'gcMeet', 'gcBudget', 'gcTaxes'],
    },
    {
      heading: 'Step one: written notice to the declarant',
      body: [
        'Any owner may act, alone or jointly with other owners. The notice must describe the failure to comply, must give the declarant a 30 day chance to cure, and must be sent by certified mail or statutory overnight delivery to the declarant’s principal office.',
      ],
      quotes: ['gcNotice'],
    },
    {
      heading: 'Step two: the lawsuit',
      body: [
        'If the declarant does not cure every deficiency named in the notice within 30 days, an owner or a group of owners can file in the superior court of the county where any part of the association is located.',
        'The statute gives each owner standing “individually, and not solely through a derivative action.” In plain terms, an owner does not have to sue in the association’s name. The relief the court can give is an order for an election with its terms, or any other order that transfers control.',
      ],
      quotes: ['gcSuit'],
    },
    {
      heading: 'How fast the court can move',
      body: [
        'The court can hold a hearing and issue a summary ruling, at a time it sets, not earlier than 20 days after service. The parties can agree in writing to an earlier trial. No discovery happens unless the court orders it for good cause.',
      ],
      quotes: ['gcHearing'],
    },
    {
      heading: 'Fees and the limit on other claims',
      body: [
        'If the owners prevail, the court shall award them all reasonable attorney’s fees and costs of the action. The text we hold says nothing about fees if the owners lose, so ask your attorney how that risk is handled.',
        'The last sentence closes the door on other claims under this section. It is the exclusive remedy it creates, and it is not a basis for liability against anyone outside that remedy.',
      ],
      quotes: ['gcFees', 'gcExclusive'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not describe how your documents set the declarant’s period of control, what the sections it refers to (44-3-227 and 44-3-230) require in full, or how to word the notice. Whether a failure has happened in your community is a factual question for your attorney.',
      ],
    },
  ],
  steps: [
    'Confirm with your attorney that the Property Owners’ Association Act applies to your association.',
    'Gather proof for each of the six items: the registration record, the board and officer appointments, any list of directors, the meeting dates, the budget notices and the tax records.',
    'Identify the declarant’s principal office from the recorded documents and the Secretary of State record.',
    'Have the notice reviewed, then send it by certified mail or statutory overnight delivery, and keep the receipt.',
    'Count 30 days from the notice. Write down what the declarant cured and what it did not.',
    'If a deficiency remains, talk to your attorney about filing in the superior court, and about how to plan for the election.',
  ],
  faqs: [
    {
      q: 'Can Georgia homeowners remove the developer from running the HOA?',
      a: 'Section 44-3-232.1 lets the right to control pass to the owners early if the declarant fails to do one of six listed things and does not cure within 30 days of a written notice. A court order is how control is transferred.',
    },
    {
      q: 'Does one owner have to get the others to join?',
      a: 'No. The text says any owner, acting individually or jointly with other owners, may send the notice and file the action.',
    },
    {
      q: 'How is the notice sent?',
      a: 'By certified mail or statutory overnight delivery to the declarant’s principal office.',
    },
    {
      q: 'Who pays the lawyers?',
      a: 'If the owners prevail, the superior court shall award them all reasonable attorney’s fees and costs of the action. The text does not say what happens if they lose.',
    },
    {
      q: 'Does this section let owners sue the developer for anything else?',
      a: 'No. It says it is not the basis for any liability against any party outside the exclusive remedies it provides.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-board-powers-44-3-231',
    'annual-meeting-quorum-proxies',
    'registration-2027',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not send the notice, file the suit or decide whether a declarant has failed a duty. It can hold the documents and meeting records your board gathers as proof. Your attorney decides how the section applies.',
}

export const GA_SALE_ASSESSMENTS: Guide = {
  slug: 'georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225',
  path: '/guides/georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225',
  title: 'Who owes unpaid HOA assessments when a Georgia lot is sold or foreclosed (§ 44-3-225)',
  metaTitle: 'Georgia HOA: unpaid dues on a sale, 44-3-225',
  description:
    'Georgia 44-3-225 says what a buyer owes for the seller’s unpaid dues, how a statement caps it, and what a lender who forecloses owes. Quoted from the statute.',
  eyebrow: 'Georgia · Sales and foreclosure',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under § 44-3-225(c) of the Property Owners’ Association Act, a buyer is jointly and severally liable with the seller for the seller’s unpaid assessments up to the time of the sale, unless the instrument says otherwise. The buyer can recover what it pays from the seller.',
    'There is a cap. If the buyer or seller asks the association for a statement under § 44-3-232(d), the buyer is not liable, and the lot is not subject to a lien, for more than the statement shows.',
    'A first mortgage holder, or anyone who buys at that mortgage’s foreclosure, is not liable for assessments for the period before it took title. The unpaid share becomes a common expense that all lot owners share.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association.',
  ],
  sections: [
    {
      heading: 'No one escapes assessments by not using the lot',
      body: [
        'Start with the rule that sits just above the sale rules. Subsection (b) says no lot owner other than the association is excused from an assessment for any reason, with abandonment and nonuse as examples. There is one narrow exception for a lot the instrument lets an owner request to be exempt until a certificate of occupancy is issued, which also means the lot has no vote.',
      ],
      quotes: ['noExempt'],
    },
    {
      heading: 'The buyer takes on the seller’s unpaid assessments',
      body: [
        'Subsection (c) says the buyer, called the grantee, is jointly and severally liable with the seller, the grantor, for all assessments the seller left unpaid up to the time of the conveyance. “Jointly and severally” means the association can look to either one for the whole amount.',
        'The rule gives way to the instrument. If your declaration says something different, it controls. The buyer also keeps the right to recover what it paid from the seller.',
      ],
      quotes: ['saleGrantee'],
    },
    {
      heading: 'The statement caps what the buyer owes',
      body: [
        'The same subsection protects a buyer who asks first. If the grantor or grantee requests a statement from the association as provided in § 44-3-232(d), the buyer and its successors are not liable for more than the statement shows, and the lot is not subject to a lien for more than that amount.',
        'For the association, the lesson is practical. The statement is not a courtesy. Whatever number it states becomes the ceiling for that lot’s past dues as to the buyer.',
      ],
      quotes: ['saleStatement'],
    },
    {
      heading: 'A lender that forecloses',
      body: [
        'Subsection (d) protects the holder of a first priority mortgage of record, and a holder of a secondary purchase money mortgage when neither the grantee nor a successor grantee on it is the seller of the lot. It also protects anyone else who gets title through foreclosure of such a mortgage, along with their successors.',
        'None of them is liable for assessments chargeable to the lot for any period before it acquired title, and the lot is not subject to a lien for them.',
      ],
      quotes: ['saleMortgagee'],
    },
    {
      heading: 'Who ends up carrying the loss',
      body: [
        'The statute does not wipe the debt out. It moves it. The unpaid share is deemed a common expense collectable from all the lot owners, including the new owner after foreclosure.',
        'That is why a board should watch delinquent accounts before a lender’s foreclosure, not after it. Whatever a foreclosure leaves unpaid is spread across the community.',
      ],
      quotes: ['saleShare'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not describe the statement itself, its deadline or its fee in this guide. The statement is covered in our guide on Georgia resale letters. We also do not describe how a lien is filed or foreclosed, or what the 2027 changes do to collection. Those have their own guides. We do not say how your instrument changes subsection (c), because the statute leaves that to the instrument.',
      ],
    },
  ],
  steps: [
    'Read your declaration for any rule that changes who pays a seller’s unpaid assessments.',
    'When a sale is coming, expect a request for the statement under § 44-3-232(d), and prepare the figures from your ledger.',
    'Check the amount against the owner’s account before it goes out, since it caps what the buyer owes.',
    'Keep a copy of every statement you issue with its date.',
    'Watch accounts that are delinquent when a lender starts foreclosure, because the unpaid share lands on all owners.',
    'Ask your attorney before you tell a buyer or a lender that they owe or do not owe a past balance.',
  ],
  faqs: [
    {
      q: 'Does a buyer in Georgia owe the seller’s unpaid HOA dues?',
      a: 'Under § 44-3-225(c), unless the instrument provides otherwise, the buyer is jointly and severally liable with the seller for all unpaid assessments up to the time of the conveyance. The buyer can recover what it pays from the seller.',
    },
    {
      q: 'How can a buyer limit what it owes?',
      a: 'By requesting a statement from the association under § 44-3-232(d). The buyer is then not liable for more than the statement shows, and the lot is not subject to a lien for more.',
    },
    {
      q: 'Does a bank that forecloses owe the old assessments?',
      a: 'Not for the period before it took title, under § 44-3-225(d). The unpaid share is treated as a common expense that all lot owners, including the bank or the new buyer, share.',
    },
    {
      q: 'Can an owner avoid assessments by leaving the lot empty?',
      a: 'No. Section 44-3-225(b) says abandonment, nonuse and waiver of use are not grounds for exemption.',
    },
    {
      q: 'Can the declaration change these rules?',
      a: 'Subsection (c) begins “unless otherwise provided in the instrument,” so yes for that rule. Ask your attorney how your instrument reads.',
    },
  ],
  related: [
    'georgia-hoa-estoppel-letter-resale',
    'georgia-hoa-assessment-lien-rules',
    'special-assessments',
    'georgia-hoa-does-poa-act-apply-44-3-222',
  ],
  hoaDoes: [
    {
      text: 'On a property, the board can prepare the paperwork a sale needs. For Georgia it is built on the statement of amounts due, with the five-business-day deadline and the $10.00 fee limit shown, and a warning that missing the deadline loses the lien against the buyer.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-20-1053-state-law-resale-roster',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not decide who owes what on a sale or foreclosure, and it does not contact lenders or buyers. Your attorney answers that.',
}

export const GA_ALLOCATE_EXPENSES: Guide = {
  slug: 'georgia-hoa-charging-some-lots-not-all-44-3-225',
  path: '/guides/georgia-hoa-charging-some-lots-not-all-44-3-225',
  title: 'Can a Georgia HOA charge some lots more than others? (§ 44-3-225(a))',
  metaTitle: 'Georgia HOA: charging some lots more',
  description:
    'Georgia 44-3-225(a) lets an HOA assess costs to only the lots that benefit or caused them, if the instrument says so, but not routine maintenance. Quoted text.',
  eyebrow: 'Georgia · Uneven assessments',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Most Georgia HOAs split costs by the formula in the declaration. Section 44-3-225(a) of the Property Owners’ Association Act allows three kinds of uneven allocation, but only to the extent the instrument expressly provides for it.',
    'The three are: costs that benefit fewer than all lots, costs caused by the conduct of some occupants or their guests, and costs that benefit all lots but disproportionately.',
    'A fourth paragraph limits all of this. Except for limited common areas the instrument assigns to fewer than all lots, an association cannot use these rules to allocate unevenly the periodic maintenance, repair and replacement it is obligated to handle.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association.',
  ],
  sections: [
    {
      heading: 'The condition that comes first',
      body: [
        'Every rule in subsection (a) starts with the same condition. It works only “to the extent that the instrument expressly so provides.” If your declaration is silent, the board has no power under this subsection to charge one lot differently, however fair it seems.',
        'So the first job is a document search. Look for the words “specially assessed” or a similar clause in your declaration.',
      ],
      quotes: ['allocIntro'],
    },
    {
      heading: 'Costs that benefit only some lots',
      body: [
        'The first paragraph covers common expenses that benefit less than all of the lots. They are assessed equitably among the lots they benefit, and the board decides how. The statute gives no examples, so ask your attorney whether a particular cost fits.',
      ],
      quotes: ['alloc1'],
    },
    {
      heading: 'Costs caused by particular occupants',
      body: [
        'The second paragraph is about conduct. Costs caused by some of the people entitled to occupy the lots, or by their licensees or invitees, are assessed against the lot or lots whose occupant, licensee or invitee caused them.',
        'The statute names the cause as the basis. A board that uses it should keep a record of what happened and what it cost, so the assessment can be tied to the conduct.',
      ],
      quotes: ['alloc2'],
    },
    {
      heading: 'Costs that benefit everyone, but not equally',
      body: [
        'The third paragraph covers expenses that significantly and disproportionately benefit all of the lots. They are assessed equitably among all the lots, as the board decides. The word “significantly” sets a bar, and so does “disproportionately.”',
      ],
      quotes: ['alloc3'],
    },
    {
      heading: 'The limit on routine maintenance',
      body: [
        'The fourth paragraph is the one boards miss. It says paragraphs (1) and (3) do not let an association specially or disproportionately allocate common expenses for periodic maintenance, repair and replacement of common area or lots that the association must maintain, repair or replace.',
        'The exception is a limited common area that the instrument expressly designates as such and assigns to fewer than all lots. Notice also that the limit names paragraphs (1) and (3). We do not read it as a limit on paragraph (2), and your attorney should say how it applies.',
      ],
      quotes: ['alloc4'],
    },
    {
      heading: 'Nonuse is still not an excuse',
      body: [
        'Uneven allocation does not weaken the rule in subsection (b). An owner is not exempt from an assessment because of abandonment, nonuse or waiver of the use of the lot or common area.',
      ],
      quotes: ['noExempt'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say what “equitably” requires in dollars. The statute leaves that to the board and, if disputed, to a court. We do not say how to notice or collect an assessment, which our other guides cover, and we do not say whether your declaration contains the express provision these rules need.',
      ],
    },
  ],
  steps: [
    'Search your declaration for an express clause on special or uneven assessments.',
    'If there is none, do not charge one lot differently under this subsection. Ask your attorney whether an amendment is needed.',
    'For each cost, write down which of the three categories it falls in, and why.',
    'Check that the cost is not periodic maintenance, repair or replacement the association must handle, unless it is a limited common area assigned to fewer than all lots.',
    'Record the board’s decision in the minutes, including how the amounts were split.',
    'Send the owners a clear explanation of the charge before it appears on their account.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA bill only the lots that use a shared driveway?',
      a: 'If the instrument expressly provides for it, § 44-3-225(a)(1) says common expenses benefiting less than all of the lots are specially assessed equitably among the lots benefited, as the board determines. Routine maintenance is limited by paragraph (4).',
    },
    {
      q: 'Can the board charge an owner for damage a guest caused?',
      a: 'Under § 44-3-225(a)(2), to the extent the instrument expressly provides, costs caused by an occupant, licensee or invitee are assessed against that lot.',
    },
    {
      q: 'What if the declaration says nothing?',
      a: 'The subsection works only to the extent the instrument expressly so provides. Ask your attorney.',
    },
    {
      q: 'Does this let the board split ordinary repairs unevenly?',
      a: 'Paragraph (4) says no for periodic maintenance, repair and replacement of common area or lots the association must maintain, except for limited common areas assigned to fewer than all lots.',
    },
    {
      q: 'Can an owner skip an assessment by not using the amenity?',
      a: 'No. Section 44-3-225(b) says nonuse and waiver of use do not exempt an owner.',
    },
  ],
  related: [
    'special-assessments',
    'georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225',
    'georgia-hoa-board-powers-44-3-231',
    'georgia-hoa-does-poa-act-apply-44-3-222',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether your instrument allows an uneven charge, and it does not set the amounts. Your board decides, and your attorney answers legal questions.',
}
