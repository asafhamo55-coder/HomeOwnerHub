// SEO batch 25: three Georgia guides on the Property Owners' Association Act.
//   1. The terms the Act defines (44-3-221).
//   2. Incorporation, the association name, members and bylaws copies (44-3-227).
//   3. Defects in the paperwork: liberal construction and substantial compliance (44-3-233).
// Statute text only through the quote bank (def*, inc*, libCon, subComp, defectCure),
// checked word for word by georgia-guides.test.ts against ga-ocga-44-3-art6-2026.txt.
// Every other sentence restates a quote and adds no rule. Product claims: none, so
// each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-02'

export const GA_ACT_DEFINITIONS: Guide = {
  slug: 'georgia-hoa-act-definitions-44-3-221',
  path: '/guides/georgia-hoa-act-definitions-44-3-221',
  title: 'Georgia HOA terms the Act defines: declarant, common area, instrument and more (§ 44-3-221)',
  metaTitle: 'Georgia HOA terms defined, 44-3-221',
  description:
    'What “declarant,” “common area,” “common expenses,” “limited common areas” and “instrument” mean in the Georgia POA Act, quoted from § 44-3-221.',
  eyebrow: 'Georgia · Defined terms',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Section 44-3-221 of the Georgia Property Owners’ Association Act starts with a list of definitions. Every other section uses those words in the way the list says, so it pays to read them once.',
    'Several of them decide real questions. “Common expenses” covers money assessed for reserves. “Limited common areas” are the parts of the common area that only some lots may use. “Instrument” means the declaration, plats and plans that were recorded.',
    'The list applies to the Act. Your own declaration may define the same words in its own way, so ask your attorney which wording governs where the two differ.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association.',
  ],
  sections: [
    {
      heading: 'Why the definitions matter',
      body: [
        'The list begins “As used in this article, the term.” That means the meanings below hold across the whole Act, in the sections on fines, assessments, meetings and liens. When another page of ours says “instrument” or “common expenses,” this is what the statute means.',
      ],
    },
    {
      heading: 'Declaration and instrument',
      body: [
        'The declaration is the recorded document that creates the covenants. Membership in the association is mandatory for the owners of lots in the development.',
        'The “instrument” is wider. It is the declaration, plats and plans recorded under the Act. The rest of the Act keeps sending you to the instrument, for example when it says a fine is allowed only to the extent the instrument provides.',
      ],
      quotes: ['defDeclaration', 'defInstrument'],
    },
    {
      heading: 'Association and declarant',
      body: [
        'The association is the corporation formed to exercise the powers the Act gives. The declarant is, in short, the owners and lessees who sign the declaration or for whom it is signed, usually the developer.',
        'The full definition of declarant goes on to say who is left out, such as a mortgagee, a lien holder or a tenant of a lot, and who counts as a successor. We quote only the opening words here, so read the full paragraph in the Code.',
      ],
      quotes: ['defAssociation', 'defDeclarant'],
    },
    {
      heading: 'Lot and lot owner',
      body: [
        'A lot is a parcel shown on a recorded subdivision plat and subject to a declaration. The Act adds that, where the context calls for it, a lot includes a structure on it.',
        'A lot owner is a record title owner. Section 44-3-229 stretches that term for board service, which our guide on who can serve on the board explains.',
      ],
      quotes: ['defLot', 'poaLotOwnerDef'],
    },
    {
      heading: 'Common area, common expenses and limited common areas',
      body: [
        'Common area is property the association owns or leases for the members’ shared use. Common expenses are the money the association lawfully spends, plus funds assessed to build and keep reserves under the instrument.',
        'Limited common areas are a part of the common area set aside for the exclusive use of some lots, but not all. That term matters when a board wants to charge only those lots. Our guide on charging some lots and not others shows where.',
      ],
      quotes: ['defCommonArea', 'defCommonExpenses', 'defLimited'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We quote only the definitions that boards meet most often. The list has more, including board of directors, court, foreclosure, mortgage, officer, person and property. We do not say how your declaration defines any of these words, and we do not say how a court would read a word where the two differ.',
      ],
    },
  ],
  steps: [
    'Open your declaration and find its own definitions section.',
    'Mark any word that the Act also defines, such as declarant, common area or common expenses.',
    'Where the two differ, write down the difference and ask your attorney which one governs.',
    'Check whether your plats or plans show limited common areas, and which lots they serve.',
    'Use the same words in notices, budgets and minutes so owners see one meaning.',
    'Keep a one-page list of these definitions with your board handbook.',
  ],
  faqs: [
    {
      q: 'What does “instrument” mean in the Georgia Property Owners’ Association Act?',
      a: 'Under § 44-3-221(17) it means the declaration, plats and plans recorded under the Act. Exhibits and amendments recorded properly become part of it.',
    },
    {
      q: 'What are “common expenses” in Georgia?',
      a: 'Under § 44-3-221(3), all expenditures lawfully made or incurred by or for the association, together with funds lawfully assessed to create and maintain reserves under the instrument.',
    },
    {
      q: 'What is a limited common area?',
      a: 'A portion of the common area reserved for the exclusive use of those entitled to occupy one or more, but less than all, of the lots.',
    },
    {
      q: 'Who is the declarant?',
      a: 'The statute’s opening words are the owners and lessees of the property who execute the declaration or for whom it is executed. The full paragraph adds exclusions and successors.',
    },
    {
      q: 'Can my declaration define these words differently?',
      a: 'The Act’s definitions apply “as used in this article.” Ask your attorney how your declaration’s wording interacts with them.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-charging-some-lots-not-all-44-3-225',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not interpret your declaration or decide which definition governs. It can hold your recorded documents in one place for your board. Your attorney answers legal questions.',
}

export const GA_INCORPORATION: Guide = {
  slug: 'georgia-hoa-incorporation-name-and-bylaws-44-3-227',
  path: '/guides/georgia-hoa-incorporation-name-and-bylaws-44-3-227',
  title: 'Georgia HOA incorporation, name and bylaws: what § 44-3-227 requires',
  metaTitle: 'Georgia HOA: incorporation and bylaws',
  description:
    'Georgia 44-3-227 says an HOA must be incorporated, what words its name must include, who the members are and who can get copies of the articles and bylaws.',
  eyebrow: 'Georgia · Incorporation',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Before a development is submitted to the Georgia Property Owners’ Association Act, the association must be incorporated, either as a business corporation or as a nonprofit membership corporation under Title 14.',
    'The corporate name has to include one of five words: homeowners, property owners, community, club or association. Membership continues for as long as the owner owns the lot.',
    'Owners can ask for copies of the articles and bylaws and pay a reasonable charge. The developer must keep copies at set offices while it controls the association.',
    'This is a plain-language guide to the text we hold, not legal advice. It covers the Act only, so first confirm that the Act applies to your association.',
  ],
  sections: [
    {
      heading: 'The association must be a corporation',
      body: [
        'Subsection (a) says the association must be duly incorporated before submission to the Act. It names two routes: a business corporation under Chapter 2 of Title 14, or a nonprofit membership corporation under Chapter 3 of Title 14.',
        'Which route your association took is in its articles of incorporation. We do not describe the Title 14 rules themselves in this guide.',
      ],
      quotes: ['incType'],
    },
    {
      heading: 'The name must include a required word',
      body: [
        'The statute lists the words, one of which must appear in the corporate name. It also says the name must comply with the other laws on corporate names.',
        'A board that is renaming the association, or checking an old filing, can use this list as a first test. Whether a given name passes the other name laws is a question for your attorney.',
      ],
      quotes: ['incName'],
    },
    {
      heading: 'Who is a member',
      body: [
        'If the association is a business corporation or issues stock, “member” includes a shareholder. Membership lasts for as long as that lot owner owns the lot.',
        'That ties the right to be a member to ownership of the lot.',
      ],
      quotes: ['incMember'],
    },
    {
      heading: 'The first board and officers',
      body: [
        'Subsection (b) puts a duty on the declarant. Before the first lot is conveyed, it must see that the first directors are appointed, the officers are elected and the association is organized.',
        'Section 44-3-232.1 refers to the same duty when it lists the ways a declarant can lose control early. Our guide on taking control from the declarant covers that section.',
      ],
      quotes: ['incFirstBoard'],
    },
    {
      heading: 'Copies of the articles and bylaws',
      body: [
        'Subsection (c) says true and correct copies of the articles, the bylaws and all amendments must be kept at the association’s principal and registered offices, and at the declarant’s sales office, while the declarant has the right to control the association.',
        'The same subsection says a copy must be given to any lot owner on request, for a reasonable charge. The text we hold does not set a deadline or a fee amount.',
      ],
      quotes: ['incCopies', 'copiesOfBylaws'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not describe how to file or renew the corporate registration, what the articles must say beyond what is quoted, or what a reasonable charge for copies is. We do not say how your own bylaws handle any of this.',
      ],
    },
  ],
  steps: [
    'Find your articles of incorporation and confirm which kind of corporation the association is.',
    'Check that the corporate name includes one of the five words.',
    'Keep a current set of the articles, the bylaws and every amendment in one place.',
    'Decide in advance how the board will answer an owner’s request for copies, and who sends them.',
    'Set a reasonable copy charge, write it down and apply it the same way to every owner.',
    'Ask your attorney before changing the name or the articles.',
  ],
  faqs: [
    {
      q: 'Does a Georgia HOA have to be incorporated?',
      a: 'Before submission to the Property Owners’ Association Act, § 44-3-227(a) says the association shall be duly incorporated, as a business corporation or a nonprofit membership corporation under Title 14.',
    },
    {
      q: 'What words must a Georgia HOA’s name include?',
      a: 'One or more of “homeowners,” “property owners,” “community,” “club,” or “association,” and the name must comply with other laws on corporate names.',
    },
    {
      q: 'Can an owner get a copy of the bylaws?',
      a: 'Yes. Under § 44-3-227(c), copies are furnished to any lot owner on request upon payment of a reasonable charge.',
    },
    {
      q: 'How long does membership last?',
      a: 'Under § 44-3-227(a), membership continues during the period of ownership by the lot owner.',
    },
    {
      q: 'Who sets up the first board?',
      a: 'Before the first conveyance of a lot, the declarant shall cause the first directors to be appointed, the officers to be elected and the association to be organized.',
    },
  ],
  related: [
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'georgia-hoa-act-definitions-44-3-221',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not file corporate records or review your articles. It can hold the articles, bylaws and amendments your board uploads so they are easy to find. Your attorney decides how the section applies.',
}

export const GA_DEFECTS_CURE: Guide = {
  slug: 'georgia-hoa-defects-substantial-compliance-44-3-233',
  path: '/guides/georgia-hoa-defects-substantial-compliance-44-3-233',
  title: 'Can a Georgia HOA fix a defect in its declaration? Substantial compliance under § 44-3-233',
  metaTitle: 'Georgia HOA: fixing a defective declaration',
  description:
    'Georgia 44-3-233 says the Act is read in favor of a valid HOA, substantial compliance can be enough, and defects can be cured by an amendment or a court decree.',
  eyebrow: 'Georgia · Defects and cures',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Older Georgia associations sometimes find a gap in their recorded paperwork. Section 44-3-233 of the Property Owners’ Association Act speaks to that. The Act and the recorded instrument are to be read liberally in favor of a valid association.',
    'Substantial compliance with the Act’s requirements for establishing the association is enough to bring the property within the Act.',
    'A defect, or a want of conformity with the Act, may be cured in two ways: an amendment signed by the association and recorded, or a court decree on a lot owner’s application, with notice to the declarant, the association and all other lot owners.',
    'This is a plain-language guide to the text we hold, not legal advice. Whether a defect can be cured in your case is a question for your attorney.',
  ],
  sections: [
    {
      heading: 'The Act is read in favor of a valid association',
      body: [
        'The first sentence sets the tone. The Act, and an instrument recorded under it, “shall be liberally construed in favor of the valid establishment” of the association.',
        'Liberal reading does not erase a requirement. It tells a reader to lean toward treating the association as validly established when the question is close.',
      ],
      quotes: ['libCon'],
    },
    {
      heading: 'Substantial compliance can be enough',
      body: [
        'The second sentence speaks about the requirements for establishing the association. Substantial compliance suffices to bring the property described in a recorded instrument within the Act.',
        'The word “substantial” matters. The text does not say any compliance is enough, and it does not list which gaps count as small. Those are questions for your attorney.',
      ],
      quotes: ['subComp'],
    },
    {
      heading: 'Two ways to cure a defect',
      body: [
        'The last part of the section offers two routes. The first is an amendment to the instrument that the association duly executes and records. The second is a decree of the court, which a lot owner can ask for.',
        'For the court route, the owner must give notice to the declarant, the association and all other lot owners. That notice is a condition in the text, so a board that expects an owner to apply should plan for it.',
      ],
      quotes: ['defectCure'],
    },
    {
      heading: 'How this connects to the amendment rules',
      body: [
        'An amendment to cure a defect still has to be properly made. Our guide on amending covenants covers the vote and recording steps for amendments, and our guide on whether the Act applies covers how an older association submits to it.',
      ],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say which defects count as minor, which need a court, or what an amendment must say. We do not say whether your association’s paperwork has a defect. A title or land records review by an attorney is how you find that out.',
      ],
    },
  ],
  steps: [
    'List the document you think is defective and write down exactly what looks wrong.',
    'Collect the recorded declaration, plats, plans, articles and every amendment.',
    'Ask your attorney whether the gap is a defect that section 44-3-233 can cure.',
    'If an amendment is the route, follow the vote and recording rules for amendments in your documents and the Act.',
    'If a court decree is the route, plan the notice to the declarant, the association and every other lot owner.',
    'Tell owners what you found and what you are doing about it, in plain words.',
  ],
  faqs: [
    {
      q: 'Is a Georgia HOA invalid if its declaration has a mistake?',
      a: 'Section 44-3-233 says substantial compliance with the requirements for establishing the association suffices, and that the Act and the instrument are liberally construed in favor of valid establishment. Ask your attorney about your facts.',
    },
    {
      q: 'How can a defect in the recorded instrument be fixed?',
      a: 'By an amendment duly executed by the association and recorded, or by a court decree on a lot owner’s application, with notice to the declarant, the association and all other lot owners.',
    },
    {
      q: 'Can one owner ask the court to fix it?',
      a: 'The text says the court route is available “upon application of any lot owner,” with the notice described above.',
    },
    {
      q: 'Does substantial compliance mean any compliance?',
      a: 'No. The statute says substantial compliance. It does not define how much is enough.',
    },
    {
      q: 'Does this section change how an amendment is voted?',
      a: 'No. It does not set a vote. Ask your attorney how your documents and the Act’s amendment section apply.',
    },
  ],
  related: [
    'georgia-hoa-amend-covenants-two-thirds',
    'georgia-hoa-does-poa-act-apply-44-3-222',
    'georgia-hoa-incorporation-name-and-bylaws-44-3-227',
    'georgia-hoa-act-definitions-44-3-221',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not review your recorded documents for defects, draft the amendment or file anything in court. It can hold the documents your board gathers. Your attorney decides how the section applies.',
}
