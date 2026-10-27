import type { Guide } from './types'

const PUBLISHED = '2026-10-26'

export const REGISTRATION: Guide = {
  slug: 'registration-2027',
  title: 'Georgia HOA registration in 2027: what SB 406 asks of your board',
  metaTitle: 'Georgia HOA registration 2027 (SB 406): a guide for boards',
  description:
    'Georgia’s SB 406 requires owners’ associations to register with the Secretary of State from January 1, 2027. What to file, what it costs, when to renew, and what happens if you do not.',
  eyebrow: 'SB 406 · Registration',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'From January 1, 2027, an owners’ association must be registered with the Georgia Secretary of State, or must opt out in writing.',
    'Registration means a signed statement, your governing documents, a financial statement dated within a year, and a $100 fee.',
    'You renew every year by December 31 and file an amended statement within 30 days of a change of officers.',
    'An unregistered association may not collect fines or fees, file liens or start foreclosure.',
  ],
  sections: [
    {
      heading: 'What changes on January 1, 2027',
      body: [
        'SB 406 is the “Georgia Property Owners’ Bill of Rights Act.” Most of it takes effect on January 1, 2027. The definition of an owners’ association is broad: it reaches neighborhood HOAs and condominium associations alike, and the Act has no size exemption in the text we quote here.',
        'The core rule is short. If you operate an owners’ association, you register with the Secretary of State.',
      ],
      quotes: ['actEffective', 'assocDefinition', 'regRequired'],
    },
    {
      heading: 'What the board has to file',
      body: [
        'The registration statement is signed by an authorized officer or representative. The Secretary of State prescribes the form, so check its website for the current version before you file. The statute sets the minimum content.',
      ],
      list: [
        'The association’s name, address and officers.',
        'A copy of the governing documents: declaration, bylaws, articles of incorporation and any rules the board has adopted.',
        'A financial statement of the association dated no more than one year before you file.',
        'The filing fee: $100 for the first registration and for each yearly renewal.',
      ],
      quotes: ['regFiling', 'regFinancial', 'regFee'],
    },
    {
      heading: 'Renewals, changes and record keeping',
      body: [
        'Registration is not one and done. It expires every December 31, so a calendar reminder matters more than it sounds. If your officers change, or your name or address changes, you have 30 days to file an amended statement. Boards that turn over every year or two should make “file the amendment” part of the handover checklist.',
        'The Act also sets a record rule. Keep your records of assessments, fines, fees, liens and foreclosures for at least ten years, and tell the Secretary of State where they are kept if the address differs from the one on your registration.',
      ],
      quotes: ['regRenewal', 'regAmend', 'regRecords'],
    },
    {
      heading: 'What happens if you do not register',
      body: [
        'The statute attaches real consequences. An association that is not registered may not collect fines or fees, file or record liens, or start foreclosure. For a board that relies on a lien to collect unpaid dues, that is the part to take seriously.',
      ],
      quotes: ['regBar'],
    },
    {
      heading: 'The opt-out, and why it is a big decision',
      body: [
        'An association may instead tell the Secretary of State in writing that it elects not to register. That association is then “nonregistered.” The price is steep: a nonregistered association may not assess or collect fines, fees or accelerated assessments from any owner.',
        'Whether opting out makes sense depends on how your association collects money and enforces rules. It is a decision for the board and the association’s attorney, made on the record, not by default.',
      ],
      quotes: ['optOut', 'nonRegBar'],
    },
    {
      heading: 'A sensible order of work',
      body: [
        'Nothing here is a substitute for your attorney’s advice, but most volunteer boards can get ready in a handful of evenings if they take the pieces in order.',
      ],
      list: [
        'Decide, at a board meeting, whether to register or opt out, and write the decision into the minutes.',
        'Gather the governing documents and confirm you have the recorded, current versions.',
        'Produce a balance sheet and income statement dated within the past year.',
        'Choose the authorized officer who will sign, and confirm the officer list is current.',
        'Put the December 31 renewal and the 30-day amendment rule on the board calendar.',
      ],
    },
  ],
  steps: [
    'Put “register or opt out” on your next board agenda and record the vote.',
    'Collect the governing documents and a financial statement that is less than a year old.',
    'Check the Secretary of State’s website for the current form and any rules.',
    'Ask your attorney whether anything in your documents affects the filing.',
    'Take the free SB 406 readiness check to see what else is open.',
  ],
  faqs: [
    {
      q: 'Does a small Georgia HOA have to register?',
      a: 'The definition in the Act covers any nongovernmental association of owners where recorded covenants apply, and the text we quote has no size exemption. Ask your attorney about your specific association.',
    },
    {
      q: 'How much does Georgia HOA registration cost?',
      a: 'The statute sets the fee at $100 for the initial registration statement and for each annual renewal.',
    },
    {
      q: 'When do we have to renew?',
      a: 'Each registration statement expires on December 31 of each year, and the renewal application is due by that date.',
    },
    {
      q: 'We changed our board. Do we have to file again?',
      a: 'A change in officers requires an amended registration statement within 30 days.',
    },
    {
      q: 'Can an unregistered HOA still collect dues?',
      a: 'The statute bars an unregistered association from collecting fines or fees, filing liens or starting foreclosure. Regular dues are not named in that sentence, but liens and foreclosure are how most boards enforce them, so talk to your attorney before relying on any gap.',
    },
  ],
  related: ['attorney-fee-notice', 'complaint-process', 'condo-vs-hoa-law', 'readiness'],
  hoaDoes: [
    {
      text: 'The SB 406 registration kit helps the board decide between registering and opting out, fills in a filing sheet from your records, prints a documents checklist, and records each filing, renewal and amendment. It does not file anything for you.',
      route: '/compliance/ga-registration',
      release: '2026-10-22-1445-ga-registration-kit-digest-fix',
    },
    {
      text: 'From January 1, 2027, an unregistered Georgia association in the app cannot issue fines, send collection letters that list fines or fees, or record a lien without a logged override.',
      route: '/compliance/ga-registration',
      release: '2026-10-22-1445-ga-registration-kit-digest-fix',
    },
  ],
}

export const ATTORNEY_FEE_NOTICE: Guide = {
  slug: 'attorney-fee-notice',
  title: 'Georgia’s attorney’s-fee notice: the 30-day letter your HOA must send first',
  metaTitle: 'Georgia HOA attorney’s fee notice (SB 406 § 7) explained',
  description:
    'Since July 1, 2026, a Georgia association must send a written notice and wait 30 days from receipt before it can collect or be awarded attorney’s fees. What the notice must do, step by step.',
  eyebrow: 'SB 406 · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Before a Georgia association can collect or be awarded attorney’s fees, it must send an initial written notice by certified mail or statutory overnight delivery.',
    'The owner then has 30 days from receipt of that notice to pay.',
    'The association must also provide an itemized list of the reasonable attorney’s fees it claims.',
    'This rule applies to actions filed on or after July 1, 2026.',
  ],
  sections: [
    {
      heading: 'What changed, and since when',
      body: [
        'SB 406 added a new step that comes before an association can recover its lawyer’s bill from a delinquent owner. Unlike most of the Act, which waits until 2027, this section is already in force. The Act says it applies to all actions filed on or after July 1, 2026.',
      ],
      quotes: ['actSection7'],
    },
    {
      heading: 'The rule, in the statute’s own words',
      body: [
        'The sentence that matters opens with a safety valve: in an emergency involving public safety or preserving the association’s property, the steps can be skipped. Everywhere else, the association has to provide three things before it may collect or be awarded attorney’s fees.',
      ],
      quotes: ['feeIntro'],
    },
    {
      heading: 'The three things you must provide',
      body: ['In plain language, the three items are a first notice, a 30-day window, and an itemized bill.'],
      quotes: ['feeNotice1', 'feeNotice2', 'feeNotice3'],
    },
    {
      heading: 'What this means for the letter itself',
      body: [
        'The statute does not hand you a form, so write a letter that does exactly what it says and nothing murky. Your attorney may have a template; compare it with the checklist below.',
      ],
      list: [
        'Send it by certified mail or statutory overnight delivery. Ordinary first-class mail does not meet the text.',
        'Identify each outstanding fine or delinquent fee: what it is, the amount and the date it came due.',
        'Say plainly that the owner has 30 days from receipt of the notice to pay.',
        'Keep the proof of delivery. The clock runs from receipt, not from the day you mailed it, so the delivery record is your evidence.',
        'Hold back any claim for attorney’s fees until the 30 days have passed without payment.',
        'When fees are later claimed, attach an itemized list of the reasonable attorney’s fees.',
      ],
    },
    {
      heading: 'Judges will look at the fees too',
      body: [
        'A separate subsection tells judges in bench trials to review claims for attorney’s fees for reasonableness and to enter an order saying whether they were reasonable. Itemized, well-documented fees will fare better than a lump sum.',
        'Attorney’s fees remain part of what an association can recover when its governing documents allow it. The Act adds a procedure, not a new right to fees.',
      ],
      quotes: ['feeJudge', 'feeLien'],
    },
    {
      heading: 'Mistakes to avoid',
      body: ['Most problems come from skipping a step under time pressure.'],
      list: [
        'Sending the lawyer’s demand letter first and the association’s notice second.',
        'Counting 30 days from the mailing date instead of from receipt.',
        'Using regular mail and having no delivery record.',
        'Letting the attorney’s invoice grow without an itemized list the court can read.',
      ],
    },
  ],
  steps: [
    'Print the free attorney’s-fee notice checklist and compare it with your current letter.',
    'Ask your association’s attorney to confirm the wording of your notice.',
    'Switch your delinquency letters to certified mail or statutory overnight delivery.',
    'Log the delivery date for each notice so you can count 30 days from receipt.',
    'Check the foreclosure guide before any case moves toward a lien sale.',
  ],
  faqs: [
    {
      q: 'Does the 30 days start when we mail the notice?',
      a: 'No. The statute gives the owner 30 days from the receipt of the notice, so keep the delivery confirmation.',
    },
    {
      q: 'Can we send the notice by regular mail?',
      a: 'The statute names certified mail or statutory overnight delivery. Regular mail does not match that text.',
    },
    {
      q: 'Is there an exception for emergencies?',
      a: 'Yes, for emergency conditions involving public safety or the preservation of the association’s property. Ask your attorney before relying on it.',
    },
    {
      q: 'Does this apply to cases already filed?',
      a: 'The Act says Section 7 applies to actions filed on or after July 1, 2026.',
    },
  ],
  related: ['foreclosure-threshold-2027', 'late-fee-limits', 'attorney-fee-notice-checklist', 'readiness'],
  hoaDoes: [
    {
      text: 'The collections-letter page drafts the Georgia fee notice and the notice before foreclosure for the board to approve. A letter that claims attorney’s fees stays blocked until the fee notice has gone out. The app does not record when the owner received a notice, so keep your own delivery receipts.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
  ],
}

export const FORECLOSURE_THRESHOLD: Guide = {
  slug: 'foreclosure-threshold-2027',
  title: 'Georgia HOA foreclosure threshold in 2027: 60 days, a new minimum and a six-year lien',
  metaTitle: 'Georgia HOA foreclosure threshold 2027 (SB 406) explained',
  description:
    'From January 1, 2027, a Georgia HOA must give 60 days’ notice before foreclosing and the lien must reach the lesser of $4,000 or 12 months of dues, never under $2,000. How it works, with examples.',
  eyebrow: 'SB 406 · Foreclosure',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Until December 31, 2026: 30 days’ notice, a $2,000 minimum lien, and a four-year lien.',
    'From January 1, 2027: 60 days’ notice, a threshold of the lesser of $4,000 or 12 months of regular assessments (never under $2,000), and a six-year lien.',
    'Fines, late fees and other specific assessments do not count toward the threshold.',
    'Payments must be applied in a set order, and the association may not refuse a payment.',
  ],
  sections: [
    {
      heading: 'The rule today, through December 31, 2026',
      body: [
        'Section 44-3-232(c) of the Georgia Code governs foreclosing a lien for assessments in an HOA under the Property Owners’ Association Act. As it reads until the end of 2026, the notice period is 30 days, the lien has to be at least $2,000, and a lien lapses after four years.',
      ],
      quotes: ['foreclose30', 'threshold2026', 'lapse2026'],
    },
    {
      heading: 'The rule from January 1, 2027',
      body: [
        'SB 406 rewrites that subsection. The wait grows to 60 days, the notice has to tell the owner that paying before the sixtieth day after receipt eliminates the right of foreclosure, the minimum lien changes, and the lien lasts six years.',
      ],
      quotes: ['foreclose60', 'noticeContents60', 'threshold2027', 'lapse2027'],
    },
    {
      heading: 'What counts toward the threshold',
      body: [
        'The statute says that no specific assessment, fine or fee is included when you work out the amount of the lien. The Act defines the terms. Regular assessments, which fund the operating budget, count. Specific assessments, which include fees and fines for late or missed payments and for covenant violations, do not.',
      ],
      quotes: ['regularDef', 'specificDef', 'specificDefB'],
    },
    {
      heading: 'Three examples',
      body: [
        'These are made-up associations, only to show the arithmetic. “Twelve months of regular assessments” is the yearly total of the regular dues, and the threshold is the lesser of $4,000 and that figure, but never below $2,000.',
      ],
      list: [
        'Dues of $300 a month: twelve months is $3,600. The lesser of $4,000 and $3,600 is $3,600.',
        'Dues of $100 a month: twelve months is $1,200, which is under the $2,000 floor, so the threshold is $2,000.',
        'Dues of $450 a month: twelve months is $5,400. The lesser of $4,000 and $5,400 is $4,000.',
      ],
    },
    {
      heading: 'Payments and the order they are applied',
      body: [
        'Chapter 43-17A also sets the order for applying any payment an owner sends. Dues come first, then special assessments, then specific assessments, then everything else. It also bars an association from refusing a payment of any amount or accelerating assessments. The order matters because it decides how much of an owner’s balance is regular dues, and so how much counts toward the threshold.',
      ],
      quotes: ['payOrderIntro', 'payOrder1', 'payOrder2', 'payOrder3', 'payOrder4', 'noRefuse', 'noAccel'],
    },
    {
      heading: 'Questions to put to your attorney',
      body: ['Two readings deserve a lawyer’s confirmation before January.'],
      list: [
        'Whether special assessments count toward the amount of the lien, as regular assessments clearly do.',
        'Whether the six-year lien revives an old balance that lapsed under the four-year rule.',
      ],
    },
  ],
  steps: [
    'List every account near or above the current $2,000 minimum and note how much is regular dues.',
    'Update your pre-foreclosure notice for 60 days and the “eliminates the right of foreclosure” sentence before January 1.',
    'Decide how payments will be applied from January 1 and tell your manager or bookkeeper.',
    'Ask your attorney the two open questions above.',
    'Read the attorney’s-fee notice guide, which is a separate step that comes earlier.',
  ],
  faqs: [
    {
      q: 'What is the Georgia HOA foreclosure threshold in 2027?',
      a: 'The lien must be at least the lesser of $4,000 or 12 months of regular assessments in arrears, and never less than $2,000, with fines and fees left out of the calculation.',
    },
    {
      q: 'How much notice must an HOA give before foreclosing in 2027?',
      a: 'Not less than 60 days after the notice is sent by certified mail or statutory overnight delivery, return receipt requested.',
    },
    {
      q: 'Do late fees count toward the threshold?',
      a: 'No. Fees and fines for nonpayment are specific assessments, and the statute excludes specific assessments and other fines or fees from the calculation.',
    },
    {
      q: 'How long does an assessment lien last?',
      a: 'Four years until the end of 2026. The 2027 text says six years after the assessment first became due.',
    },
  ],
  related: ['attorney-fee-notice', 'late-fee-limits', 'owners-rights-2027', 'readiness'],
  hoaDoes: [
    {
      text: 'Each open collections case shows whether the amount owed clears the threshold: today’s rule and the stricter 2027 rule side by side, using the regular and special assessments owed less unapplied credit. The panel is read-only.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-26-1400-ga-foreclosure-threshold',
    },
    {
      text: 'From January 1, 2027 the notice before foreclosure can be drafted with the 2027 wording, a 60-day notice listing assessments, late charges and interest only. A card explains the payment order in plain words. The app does not yet apply payments in that order.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-22-2000-georgia-2027-nonprofit-marketing',
    },
  ],
}

export const OWNERS_RIGHTS: Guide = {
  slug: 'owners-rights-2027',
  title: 'Georgia homeowners’ rights in 2027: the twelve rights in SB 406',
  metaTitle: 'Georgia owners’ rights 2027 (SB 406): the twelve rights explained',
  description:
    'SB 406 lists twelve rights every Georgia owner has from January 1, 2027, including records, meetings and foreclosure process. The full text, and what a volunteer board should prepare.',
  eyebrow: 'SB 406 · Owners’ rights',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'From January 1, 2027, SB 406 gives owners twelve listed rights, from records to meetings to foreclosure process.',
    'Owners can demand three years of accounting records and the association’s insurance certificate in writing.',
    'Boards need a repeatable way to answer a written records demand.',
  ],
  sections: [
    {
      heading: 'Where the list comes from',
      body: [
        'Chapter 43-17A, created by SB 406, ends with a section titled in the Act’s own language as a list of rights. It takes effect on January 1, 2027, and it covers owners in associations formed under the Property Owners’ Association Act and the Condominium Act alike.',
      ],
      quotes: ['actEffective', 'rightsIntro'],
    },
    {
      heading: 'Records and insurance',
      body: [
        'The first two rights are the ones likely to land on a volunteer board’s desk. Owners can ask in writing to inspect and copy association records, and the accounting records are defined as the finalized balance sheet, budget, profit and loss statements and bank statements for the past three years. They can also ask for a copy of the certificate of insurance.',
        'A board that keeps these in one place can answer a written request promptly instead of searching for papers.',
      ],
      quotes: ['right1', 'right2'],
    },
    {
      heading: 'Meetings and notice',
      body: ['Owners get notice of member meetings, and a meeting held by the board at least once a year that they can attend.'],
      quotes: ['right3', 'right4'],
    },
    {
      heading: 'Property, process and amendments',
      body: ['Access to common areas, to your own property, and the process the law requires before any foreclosure. Owners may also amend the governing documents with the approvals the law and the documents require.'],
      quotes: ['right5', 'right6', 'right7', 'right8'],
    },
    {
      heading: 'How directors behave',
      body: ['Two rights concern the board itself: good faith and the care of an ordinary, prudent person, and disclosing conflicts of interest to fellow directors.'],
      quotes: ['right9', 'right10'],
    },
    {
      heading: 'Households and discrimination',
      body: ['The last two rights protect household composition, within the limits stated, and the ability to challenge discriminatory practices.'],
      quotes: ['right11', 'right12'],
    },
    {
      heading: 'Getting your board ready',
      body: ['A few habits will carry you most of the way.'],
      list: [
        'Keep the last three years of balance sheets, budgets, profit and loss statements and bank statements in a single folder.',
        'Keep a current certificate of insurance where an officer can send it.',
        'Log each written records demand with its date, and answer promptly in writing.',
        'Record conflict-of-interest disclosures in the minutes.',
      ],
    },
  ],
  steps: [
    'Gather three years of the financial records listed in the first right.',
    'Name one officer who handles written records demands.',
    'Add a standing “conflicts of interest” line to every board agenda.',
    'Share the list of rights with owners at the next annual meeting.',
  ],
  faqs: [
    {
      q: 'When do owners’ rights under SB 406 begin?',
      a: 'The Act says it becomes effective on January 1, 2027, except one section about attorney’s fees.',
    },
    {
      q: 'What records can an owner demand?',
      a: 'Association records and accounting records in writing, where the accounting records are the finalized balance sheet, budget, profit and loss statements and bank statements for the past three years.',
    },
    {
      q: 'Can an owner get the insurance certificate?',
      a: 'Yes, on written demand, a copy of the certificate of insurance for insurance obtained for the owners’ benefit that may apply to a claim.',
    },
    {
      q: 'Do these rights apply to condominiums?',
      a: 'The definition of owners’ association covers associations formed under Articles 3 and 6, which means condominiums and property owners’ associations.',
    },
  ],
  related: ['complaint-process', 'registration-2027', 'foreclosure-threshold-2027', 'readiness'],
  hoaDoes: [
    {
      text: 'Owners get a “Your rights as an owner” page that lists the twelve rights word for word, each linked to where they use it in the app, and a button to request the insurance certificate. It says the rights take effect January 1, 2027 until then.',
      route: '/resident/rights',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
    {
      text: 'Boards can print a three-year financial packet (balance sheets, income statements, adopted budgets) to answer records requests, and see Georgia’s five-business-day clock on a records request.',
      route: '/tickets/records',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
  ],
}
