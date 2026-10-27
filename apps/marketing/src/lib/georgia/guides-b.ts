import type { Guide } from './types'

const PUBLISHED = '2026-10-26'

export const LATE_FEES: Guide = {
  slug: 'late-fee-limits',
  title: 'Georgia HOA late fee limits: the greater of $10 or 10 percent',
  metaTitle: 'Georgia HOA late fee limit: what is allowed',
  description:
    'What a Georgia HOA may charge for late payment: the greater of $10 or 10 percent of the late installment, if your documents allow, plus interest up to 10%/year.',
  eyebrow: 'Collections · Late fees',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'A Georgia HOA may charge a late fee only to the extent its governing instrument provides for one.',
    'The cap is the greater of $10 or 10 percent of each late assessment or installment.',
    'Interest is a separate item, capped at 10 percent per year.',
    'From 2027, late fees are “specific assessments”: they do not count toward the foreclosure threshold and are paid last.',
  ],
  sections: [
    {
      heading: 'Start with your declaration',
      body: [
        'Georgia’s Property Owners’ Association Act does not let a board invent a late fee. The statute adds charges to the owner’s personal obligation and the lien only “to the extent that the instrument provides.” If your declaration or bylaws say nothing about late charges, read them carefully and ask your attorney before you start billing one.',
      ],
      quotes: ['lateIntro'],
    },
    {
      heading: 'The cap',
      body: [
        'When the documents do allow it, the late charge cannot exceed the greater of two numbers: $10, or 10 percent of the amount of each assessment or installment that was not paid when due. The cap applies to each late installment, not to the owner’s whole balance.',
      ],
      quotes: ['lateCharge'],
    },
    {
      heading: 'Two quick examples',
      body: ['Made-up numbers, only to show how “greater of” works.'],
      list: [
        'A $60 monthly installment: 10 percent is $6, and $10 is greater, so the cap is $10.',
        'A $250 monthly installment: 10 percent is $25, which is greater than $10, so the cap is $25.',
      ],
    },
    {
      heading: 'Interest is a different charge',
      body: [
        'Interest on a late assessment, and on any late charge, runs from the date it was first due and cannot be set higher than 10 percent per annum. A late fee and interest are separate items on the account, and each has its own limit.',
        'Keep them separate in your ledger too. An owner who disputes a balance will ask what part is dues, what part is a late fee and what part is interest, and a board that can answer in one line avoids most escalations. The same breakdown is what you will need for a collections letter or an attorney’s file later.',
      ],
      quotes: ['interest'],
    },
    {
      heading: 'What changes in 2027',
      body: [
        'SB 406 gives fees and fines for late or missed payments a new name: specific assessments. Three consequences follow. They do not count toward the 2027 foreclosure threshold. When an owner pays, they are paid after dues, special assessments and other specific assessments. And an association that is not registered with the Secretary of State may not collect them at all.',
        'In practice, a pile of late fees will not get an account to the foreclosure threshold, and a payment from an owner goes to the dues first.',
      ],
      quotes: ['specificDefB', 'payOrder4'],
    },
    {
      heading: 'Writing a policy that holds up',
      body: ['Boards that adopt a written policy have fewer arguments.'],
      list: [
        'Quote the declaration section that authorizes a late charge.',
        'State the amount as a formula that cannot exceed the cap.',
        'Say when an installment is late and when the fee applies.',
        'Apply it the same way to every owner and keep a record of each charge.',
      ],
    },
  ],
  steps: [
    'Find the late-charge language in your declaration and bylaws.',
    'Check your current fee against the greater of $10 or 10 percent of the installment.',
    'Write the policy down, adopt it at a meeting and record it in the minutes.',
    'Confirm your interest rate is no more than 10 percent per year.',
    'Plan for the 2027 payment order and the foreclosure threshold.',
  ],
  faqs: [
    {
      q: 'What is the maximum late fee for a Georgia HOA?',
      a: 'The statute allows a late charge not in excess of the greater of $10 or 10 percent of each assessment or installment not paid when due, to the extent the instrument provides for one.',
    },
    {
      q: 'Can the board add a late fee if the declaration is silent?',
      a: 'The statute covers late charges “to the extent that the instrument provides.” Ask your attorney before charging one without that language.',
    },
    {
      q: 'Is interest the same as a late fee?',
      a: 'No. Interest has its own cap: not more than 10 percent per annum.',
    },
    {
      q: 'Does the same limit apply to condominiums?',
      a: 'The Condominium Act sets the same cap for unit owners, for late charges that the condominium instruments provide for.',
    },
  ],
  related: ['foreclosure-threshold-2027', 'attorney-fee-notice', 'condo-vs-hoa-law', 'readiness', 'hoa-treasurer-duties'],
  hoaDoes: [
    {
      text: 'No late fee is charged until the board saves a late-fee policy. Georgia’s cap is checked when the policy is saved, and a policy over the cap cannot be saved.',
      route: '/settings/late-fees',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
  ],
}

export const CONDO_VS_HOA: Guide = {
  slug: 'condo-vs-hoa-law',
  title: 'Georgia condo vs HOA law: which statute governs your association?',
  metaTitle: 'Georgia condo vs HOA law: Article 3 or 6?',
  description:
    'Georgia has two association laws: the Condominium Act (Article 3) and the Property Owners’ Association Act (Article 6). Which governs you, and SB 406’s effect.',
  eyebrow: 'Which law applies',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Condominium associations are governed by Article 3 of Chapter 3 of Title 44. Neighborhood HOAs are usually governed by Article 6.',
    'Article 6 says it does not apply to Article 3 associations, with one exception for mixed developments.',
    'SB 406’s new Chapter 43-17A (registration, owners’ rights, the complaint process) covers both kinds.',
    'SB 406 also rewrites the foreclosure subsection of Article 6. The Article 3 text we hold has not been changed.',
  ],
  sections: [
    {
      heading: 'Two statutes, two kinds of association',
      body: [
        'Georgia’s Condominium Act is Article 3 of Chapter 3 of Title 44 of the Code. The Property Owners’ Association Act is Article 6 of the same chapter. Your declaration says which law the association was created under, and your attorney can confirm it.',
        'The Property Owners’ Association Act says plainly that it does not apply to Condominium Act associations, except where a property owners’ development includes a condominium together with other real property.',
      ],
      quotes: ['condoNotApply'],
    },
    {
      heading: 'What SB 406 treats the same',
      body: [
        'The new Chapter 43-17A defines an owners’ association broadly, and names both kinds. So registration with the Secretary of State, the twelve owners’ rights and the complaint process apply to condominium associations and neighborhood HOAs alike.',
      ],
      quotes: ['assocDefinition'],
    },
    {
      heading: 'Where the two statutes differ on collections',
      body: [
        'The collections rules sit in different sections. For a condominium, § 44-3-109 covers the lien for assessments. For a POA, § 44-3-232 does. Some of the old text is the same: both cap a late charge at the greater of $10 or 10 percent, for example.',
      ],
      quotes: ['condoLateIntro', 'condoLate'],
    },
    {
      heading: 'The foreclosure rules compared',
      body: [
        'SB 406 rewrites § 44-3-232(c), which is in Article 6. The notice period, the minimum lien and the lien’s lifespan change there on January 1, 2027. In the Condominium Act text we hold, § 44-3-109(c) still reads as follows.',
      ],
      quotes: ['condoForeclose', 'condoThreshold', 'condoLapse'],
    },
    {
      heading: 'The comparison at a glance',
      body: ['Based on the statute text quoted on this site. Confirm the current Code with your attorney.'],
      list: [
        'Notice before foreclosure: condominium 30 days; POA 30 days until December 31, 2026, then 60 days.',
        'Minimum lien: condominium $2,000; POA $2,000 until 2026, then the lesser of $4,000 or 12 months of regular assessments, never under $2,000.',
        'Lien lifespan: condominium four years; POA four years until 2026, then six.',
        'Late charge cap: the same in both, the greater of $10 or 10 percent.',
        'Registration, owners’ rights and complaints under Chapter 43-17A: both.',
      ],
    },
    {
      heading: 'If you are not sure',
      body: [
        'Mixed communities exist: a development with townhomes under a POA declaration and a condominium building inside it, for instance. If you cannot tell from the documents, ask the association’s attorney which statute governs which part before you rely on a deadline from either one.',
      ],
    },
  ],
  steps: [
    'Read the first pages of your declaration for the statute it invokes.',
    'Ask your attorney to confirm, in writing, whether you are under Article 3, Article 6 or both.',
    'List the deadlines that apply to you, using the right column above.',
    'Register with the Secretary of State on the same schedule either way.',
  ],
  faqs: [
    {
      q: 'Is a Georgia condo association an HOA?',
      a: 'In everyday speech yes, but in law condominiums are governed by the Condominium Act, Article 3, rather than the Property Owners’ Association Act, Article 6.',
    },
    {
      q: 'Does SB 406 apply to condominiums?',
      a: 'The new Chapter 43-17A defines owners’ associations to include associations formed under Articles 3 and 6, so its registration, rights and complaint provisions reach condominiums.',
    },
    {
      q: 'Does the 60-day foreclosure notice apply to condos?',
      a: 'SB 406 rewrites the Article 6 subsection. The Article 3 text we quote reads 30 days. Ask your attorney whether anything else has changed.',
    },
    {
      q: 'Which statute governs a townhome community?',
      a: 'It depends on how it was created. Read the declaration and ask your attorney.',
    },
  ],
  related: ['registration-2027', 'late-fee-limits', 'foreclosure-threshold-2027', 'readiness'],
  hoaDoes: [
    {
      text: 'For an association set up as a condominium, the Compliance page follows the Georgia Condominium Act: 21 days’ notice of the annual meeting, the records rules, insurance minimums, and the statement of amounts due within five business days.',
      route: '/compliance',
      release: '2026-10-26-1800-website-redesign-ga-condos',
    },
    {
      text: 'The collections-letter page drafts the condominium notice before foreclosure (30 days, $2,000 floor) and applies the condominium late-charge and interest caps. The board approves every letter.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-26-1800-website-redesign-ga-condos',
    },
  ],
}

export const COMPLAINT_PROCESS: Guide = {
  slug: 'complaint-process',
  title: 'Georgia’s owner complaint process: what happens when a homeowner files with the state',
  metaTitle: 'Georgia HOA owner complaint process (SB 406)',
  description:
    'From January 1, 2027 a Georgia owner can complain to the Secretary of State within 180 days. The hearing, 15-day window, stay on fines and fees, next steps.',
  eyebrow: 'SB 406 · Complaints',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'An owner who says they were damaged by the association’s action or inaction can file a written complaint with the Secretary of State within 180 days.',
    'A hearing officer investigates and may hold a hearing. The parties then have 15 days to settle on the hearing officer’s conclusions.',
    'Filing triggers an automatic stay: the association may not collect or try to collect fines or fees related to the complaint.',
    'The nonprevailing party pays a $100 administrative fee.',
  ],
  sections: [
    {
      heading: 'Who can complain, and how soon',
      body: [
        'Anyone residing in an owners’ development who says the association’s action or inaction harmed them may file. The complaint is a written statement of the facts, made within 180 days of the thing complained about. The clock favors prompt, documented decisions by the board.',
      ],
      quotes: ['complaint', 'complaint180'],
    },
    {
      heading: 'The hearing and the 15 days',
      body: [
        'The Secretary of State appoints a hearing officer, who investigates and may order a hearing. After the hearing, the hearing officer gives the owner and the association written findings and conclusions. Both then have 15 days to make those conclusions effective and satisfy them.',
        'If the dispute is not settled in that window, the hearing officer, the owner or the association may bring an action to enforce the claim.',
      ],
      quotes: ['complaintHearing', 'complaintEnforce'],
    },
    {
      heading: 'The automatic stay on fines and fees',
      body: [
        'For a board, this is the part that changes daily operations. Once a complaint is filed, the association may not collect, or try to collect, any fines or fees from that owner that are the subject of the complaint or related to it. The stay runs until the hearing officer’s conclusions, and the hearing officer may extend it by 15 days.',
      ],
      quotes: ['stay', 'stayEnds'],
    },
    {
      heading: 'Costs, honesty and appeals',
      body: [
        'The nonprevailing party in the hearing pays a $100 administrative service fee. The Act also makes it unlawful to give the Secretary of State or a hearing officer a false or misleading statement of material fact, which applies to the board as much as the owner. A person adversely affected can appeal to the magistrate or superior court as the statute describes.',
      ],
      quotes: ['complaintFee', 'complaintFalse', 'appeal'],
    },
    {
      heading: 'What the board should do when a complaint arrives',
      body: ['A calm, documented response is the best protection.'],
      list: [
        'Note the date you received the notice and calendar every deadline in it.',
        'Pause collection of fines and fees related to that owner’s complaint, and tell your manager and bookkeeper the same day.',
        'Gather the governing-document sections, notices, minutes and emails the matter involves.',
        'Send the file to the association’s attorney and decide together who speaks for the board.',
        'Keep communications factual. Everything may be read by a hearing officer.',
      ],
    },
    {
      heading: 'Prevention beats response',
      body: [
        'Most complaints grow from a decision the owner could not understand. Written reasons for a denial, clear notice before a fine and a hearing opportunity cost little, and they make the 180-day clock matter less.',
      ],
    },
  ],
  steps: [
    'Write a one-page “if we receive a complaint” procedure and give it to every board member.',
    'Agree who receives mail from the Secretary of State and how fast it reaches the board.',
    'Make sure the bookkeeper can pause fines and fees on one home quickly.',
    'Read the owners’ rights guide so you know what complaints are likely to cite.',
  ],
  faqs: [
    {
      q: 'How long does a Georgia owner have to file a complaint against an HOA?',
      a: 'The complaint must be made within 180 days of the alleged action or inaction.',
    },
    {
      q: 'Does a complaint stop us from collecting dues?',
      a: 'The statute stays collection of fines and fees that are the subject of the complaint or related to it. It names fines and fees, not regular dues. Ask your attorney how it applies to your account.',
    },
    {
      q: 'Who pays for the hearing?',
      a: 'The nonprevailing party pays a $100 administrative service fee to the Secretary of State.',
    },
    {
      q: 'When does this start?',
      a: 'Chapter 43-17A takes effect on January 1, 2027.',
    },
  ],
  related: ['owners-rights-2027', 'attorney-fee-notice', 'late-fee-limits', 'readiness', 'violation-notice-checklist'],
  hoaDoes: [
    {
      text: 'A “Secretary of State complaint” card on each home’s collections file records the filing date and the hearing officer’s conclusions. From January 1, 2027, while the stay runs, the app blocks fines and collection letters that list fines or fees for that home and charges it no late fees. Before 2027 it only warns. The only override is “attorney advised,” and every override is logged.',
      route: '/properties/[id]',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
  ],
}
