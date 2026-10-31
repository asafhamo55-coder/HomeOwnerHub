// SEO batch 22: does Georgia's Property Owners' Association Act apply to your HOA,
// and who counts as a lot owner when the documents say a director must be one.
// Statute text only through the quote bank (poaApply*, poaLotOwner*), checked word
// for word by georgia-guides.test.ts against ga-ocga-44-3-art6-2026.txt. Section
// 44-3-222 has a text in force now and an SB 406 text from January 1, 2027. The
// page quotes the 2026 text and gives the 2027 text one sentence, quoted from the
// same fixture. Every other sentence restates a quote and adds no rule.
// Section 44-3-234 is not an exclusion: it lifts certain Code Section 44-5-60
// limits for covenants under the Act. We do not hold 44-5-60, so the page says
// what 44-3-234 says and does not describe those limits.
// Product claim: none. HomeownerHub does not decide which statute governs an
// association (the Compliance page follows what the board sets up), so both pages
// use hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const GA_POA_APPLY: Guide = {
  slug: 'georgia-hoa-does-poa-act-apply-44-3-222',
  path: '/guides/georgia-hoa-does-poa-act-apply-44-3-222',
  title: 'Does Georgia’s Property Owners’ Association Act apply to your HOA?',
  metaTitle: 'Does Georgia’s POA Act apply to your HOA?',
  description:
    'Georgia’s Property Owners’ Association Act applies only if the declaration elects it. What 44-3-222, 44-3-234 and 44-3-235 say, and how older HOAs opt in.',
  eyebrow: 'Georgia · Which law applies',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Article 6 of Chapter 3 of Title 44, the Property Owners’ Association Act, does not apply to every Georgia neighborhood HOA. Under § 44-3-222, a development comes into existence under it when the declaration is recorded under the Act, or when a recorded declaration is amended under § 44-3-235. A declaration or amendment that wants the Act must state an affirmative election to be governed by it.',
    'An older declaration can opt in. Section 44-3-235(a) covers an association whose declaration is amended under § 44-3-222 to submit it to the Act, and the amendment must conform the documents to the Act.',
    'Condominium associations are outside the Act, with one exception for mixed developments. Section 44-3-234 is a different kind of rule about covenants and is not an exclusion.',
    'This is a plain-language guide to the text we hold, not legal advice. Your attorney reads your declaration and tells you which law governs.',
  ],
  sections: [
    {
      heading: 'The short answer: it depends on an election',
      body: [
        'Many board members assume the Act covers any community with a homeowners association. The text is narrower. A development exists under the Act in two ways, and both start with the declaration: recording it under the Act, or amending a recorded declaration in accordance with § 44-3-235. If neither happened, the Act was never switched on for your community.',
      ],
      quotes: ['poaApplyCreate'],
    },
    {
      heading: 'What the declaration has to say',
      body: [
        'The election has to be written down. A declaration or amendment that means to bring a development under the Act must state an affirmative election to be so governed. A silent document does not do it, and neither does a board habit of acting as if the Act applied.',
        'So the first thing to look for is the election itself, in the original declaration or in a recorded amendment. Search for the words “Property Owners’ Association Act” or a citation to Article 6. If you do not find an election, ask your attorney before you assume the Act applies.',
      ],
      quotes: ['poaApplyElection'],
    },
    {
      heading: 'How an older declaration opts in',
      body: [
        'Communities recorded before the Act, or without an election, can still opt in. Section 44-3-235(a) says the Act also applies to an association of owners under a recorded declaration of covenants, where membership in the association is mandatory for all lot owners, when that declaration is amended in accordance with § 44-3-222 to submit the association to the Act.',
        'The sentence has a condition. Any amendment must conform the instrument creating the association to the Act, so adding a sentence of election and leaving the rest is not enough. After that, the development is deemed submitted.',
      ],
      quotes: ['poaApplyOlder'],
    },
    {
      heading: 'Who has to sign the amendment',
      body: [
        'For an amendment to an existing declaration, § 44-3-222 does not set a new vote. It points back to the recorded declaration: the amendment is executed in accordance with the terms of the declaration being amended.',
        'So the amendment clause of your own declaration controls the vote needed to opt in. Have your attorney confirm the amendment is signed and recorded the way the declaration requires.',
      ],
      quotes: ['poaApplyExecuted'],
    },
    {
      heading: 'What opting in does and does not change',
      body: [
        'Section 44-3-235(c) draws a line in both directions. The Act does not affect the validity of an instrument recorded before or after July 1, 1994, so opting in does not void your covenants. But the benefits that come from the Act may be claimed only by developments submitted to it.',
      ],
      quotes: ['poaApplySubmitted', 'poaApplyBenefits'],
    },
    {
      heading: 'The exceptions',
      body: [
        'Section 44-3-235(b) is the exclusion. The Act does not apply to associations created under the Georgia Condominium Act, except where a property owners’ development under the Act includes a condominium together with other real property.',
        'Section 44-3-234 is titled “Application of article,” but it is not a carve-out. It says certain limitations in Code Section 44-5-60 do not apply to covenants in an instrument created or submitted under the Act. We do not hold § 44-5-60, so we do not describe those limits. Ask your attorney what that section changes for your covenants.',
      ],
      quotes: ['condoNotApply', 'poaApplyCovenants'],
    },
    {
      heading: 'A change coming on January 1, 2027',
      body: [
        'SB 406 amends § 44-3-222 effective January 1, 2027, and § 44-3-235. The 2027 text of § 44-3-222 adds a third route, an instrument recorded under paragraph (3) of § 44-3-235(a). Its first sentence:',
      ],
      quotes: ['poaApplySb406'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We cannot tell you whether your declaration contains an election, or whether a past amendment conformed the documents. We do not describe § 44-5-60 or the new 2027 route in § 44-3-235(a)(3). Those answers sit in your recorded documents and with your attorney.',
      ],
    },
  ],
  steps: [
    'Pull the recorded declaration and every recorded amendment from the county records, or from your closing file.',
    'Search them for an affirmative election to be governed by the Property Owners’ Association Act, or a citation to Article 6 of Chapter 3 of Title 44.',
    'If you do not, ask your attorney whether the association is under the Act at all, and whether an opt-in amendment is worth the vote.',
    'If you decide to opt in, follow the amendment clause of your declaration, and have the attorney conform the documents to the Act as § 44-3-235(a) requires.',
    'Calendar January 1, 2027 and ask your attorney what SB 406’s amended text of § 44-3-222 means for your association.',
  ],
  faqs: [
    {
      q: 'Does Georgia’s Property Owners’ Association Act apply to every HOA?',
      a: 'No. Under § 44-3-222, a development comes under the Act by recording its declaration under the Act or by amending a recorded declaration in accordance with § 44-3-235, and the declaration or amendment must state an affirmative election to be governed by it.',
    },
    {
      q: 'Can an older HOA opt in to the Act?',
      a: 'Section 44-3-235(a) says the Act applies to an association whose declaration is amended in accordance with § 44-3-222 to submit it to the Act, provided the amendment conforms the documents to the Act and membership is mandatory for all lot owners.',
    },
    {
      q: 'How many owners must approve the opt-in amendment?',
      a: 'The text of § 44-3-222 says the amendment is executed in accordance with the terms of the recorded declaration being amended. Check the amendment clause of your declaration.',
    },
    {
      q: 'Does the Act apply to condominiums?',
      a: 'Section 44-3-235(b) says it does not apply to associations created under the Georgia Condominium Act, except to the extent a property owners’ development under the Act includes a condominium together with other real property.',
    },
    {
      q: 'Is § 44-3-234 an exception to the Act?',
      a: 'It is titled “Application of article,” but the text we hold only says that certain limitations in Code Section 44-5-60 do not apply to covenants in an instrument created or submitted under the Act. The exclusion for condominiums is in § 44-3-235(b).',
    },
  ],
  related: [
    'condo-vs-hoa-law',
    'georgia-hoa-amend-covenants-two-thirds',
    'georgia-hoa-board-powers-44-3-231',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'readiness',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not read your declaration or decide which Georgia statute governs your association, and it does not draft or record an opt-in amendment. Your attorney decides that. The tools on the Compliance page follow the association type the board sets up, so set it up from your attorney’s answer.',
}

export const GA_LOT_OWNER_BOARD: Guide = {
  slug: 'georgia-hoa-who-can-serve-on-the-board-44-3-229',
  path: '/guides/georgia-hoa-who-can-serve-on-the-board-44-3-229',
  title: 'Who can serve on a Georgia HOA board when directors must be lot owners',
  metaTitle: 'Who can serve on a Georgia HOA board',
  description:
    'When a Georgia declaration says directors must be lot owners, O.C.G.A. 44-3-229 widens who counts and covers a person who leaves the owning entity.',
  eyebrow: 'Georgia · Governance',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 44-3-229 of the Georgia Property Owners’ Association Act does not require directors to own a lot. It speaks only to an association whose instrument already says a director or officer must be a lot owner.',
    'In that case, unless the instrument says otherwise, “lot owner” is read to include a shareholder, director, officer, partner or trustee of a person that owns a lot, alone or with others. That matters for lots held by an LLC, a trust or a company.',
    'A person who qualifies only through that link is treated as disqualified from continuing in office once the link ends.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association.',
  ],
  sections: [
    {
      heading: 'Start with your own documents',
      body: [
        'The statute does not say who may serve on the board. Your declaration, articles and bylaws do. Many of them say a director must be a lot owner, an owner’s spouse, or a resident. Section 44-3-229 only comes into play when the instrument says a director or officer must be a lot owner.',
        'If your documents say nothing about ownership, this section is not the one to read. If they do, keep reading, and check first that the Act applies to your association at all.',
      ],
    },
    {
      heading: 'The plain meaning of “lot owner”',
      body: [
        'Section 44-3-221 defines a lot owner as one or more persons who are the record title owners of a lot. Taken alone, that reading leaves out a person who runs a company that holds title, and it leaves out the owner’s family members.',
      ],
      quotes: ['poaLotOwnerDef'],
    },
    {
      heading: 'What 44-3-229 adds',
      body: [
        'When the instrument requires a director or officer to be a lot owner, the section widens the term in that setting. The word “notwithstanding” in the quote means the narrow definition above does not control here.',
        'The widened reading includes any shareholder, director, officer, partner in, or trustee of a person that is a lot owner, alone or together with others. It applies unless the instrument otherwise provides, so a declaration that defines eligibility in its own words keeps its own words.',
      ],
      quotes: ['poaLotOwnerBoard'],
    },
    {
      heading: 'When the connection ends',
      body: [
        'The second sentence covers what happens when someone served only because of the link to an owning entity. If the person would not be eligible without being a shareholder, director, officer, partner or trustee of that entity, and the person stops having that affiliation, the person is deemed to have disqualified himself or herself from continuing in office.',
        'The text says “deemed.” It does not say the board must vote, and it does not describe a notice. How your board records the change is a question for your bylaws and your attorney.',
      ],
      quotes: ['poaLotOwnerCease'],
    },
    {
      heading: 'Where this comes up',
      body: [
        'The common cases are a lot held by an LLC, a lot held in a family trust, and a lot held by a company whose owner sells his or her interest. In each case the person named on the ballot is not the record title owner, so the question is whether the instrument is read through § 44-3-229.',
        'The section does not tell you who may vote, how many directors the board has, or how long they serve. Those are in your documents and in the corporate code.',
      ],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not describe the removal of a director, the filling of a vacancy, or the bylaws of any association. We do not say whether a given person qualifies. That depends on your instrument, your title records and, if the lot is held by an entity, on that entity’s own papers.',
      ],
    },
  ],
  steps: [
    'Read the sections of your declaration, articles and bylaws on director and officer qualifications.',
    'If they say a director or officer must be a lot owner, note the exact words and whether they define “lot owner” themselves.',
    'For each candidate, check the county records to see who holds title to the lot.',
    'If title is held by an LLC, trust or company, ask how the candidate is connected to it, as shareholder, director, officer, partner or trustee.',
    'Confirm with your attorney that the Property Owners’ Association Act applies, then ask how § 44-3-229 reads against your instrument.',
    'Keep the title record and the connection with the candidate’s file, and update the file if the connection ends.',
  ],
  faqs: [
    {
      q: 'Does Georgia law require HOA directors to own a lot?',
      a: 'Not in § 44-3-229. That section applies only if the instrument provides that a director or officer must be a lot owner. The requirement itself comes from your documents.',
    },
    {
      q: 'Can an LLC’s manager serve on the board if the LLC owns the lot?',
      a: 'Under § 44-3-229, unless the instrument says otherwise, “lot owner” includes a shareholder, director, officer, partner in, or trustee of a person that is a lot owner. Whether a manager fits depends on that person’s role in the entity. Ask your attorney.',
    },
    {
      q: 'What if the director stops being connected to the owning entity?',
      a: 'The text says a person who would not otherwise be eligible is deemed to have disqualified himself or herself from continuing in office if he or she ceases to have the affiliation.',
    },
    {
      q: 'Who is a lot owner by definition?',
      a: 'Section 44-3-221 defines a lot owner as one or more persons who are record title owners of a lot.',
    },
    {
      q: 'Does this apply if my HOA never opted in to the Act?',
      a: 'The section is part of Article 6, so first confirm that the Act applies to your association. Our guide on whether the Act applies covers that.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-board-powers-44-3-231',
    'condo-vs-hoa-law',
    'hoa-board-conflict-of-interest-disclosure-checklist',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether a person is eligible to serve, and it does not read your bylaws or title records. It keeps the minutes of the meeting where the board acts. Your attorney decides eligibility.',
}
