// SEO batch 28: three Georgia guides for board members.
//   1. Records a nonprofit HOA must keep, and which of them members can inspect (14-3-1601, 14-3-1602).
//   2. What comes ahead of the assessment lien: taxes and mortgages (44-3-232(a), (c)).
//   3. Can an amendment ban rentals? The grandfathering rule in 44-3-226(a)(2)(B).
// Statute text only through the quote bank (rec*, pri*, rental*, lienSums, lienRecordNotice, amend*), checked word
// for word by georgia-guides.test.ts against the fixtures. Every other sentence restates a quote and adds no
// rule. Product claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-05'

export const GA_RECORDS_KEPT: Guide = {
  slug: 'georgia-hoa-records-the-association-must-keep-14-3-1601',
  path: '/guides/georgia-hoa-records-the-association-must-keep-14-3-1601',
  title: 'Records a Georgia nonprofit HOA must keep, and which ones members can inspect (§ 14-3-1601)',
  metaTitle: 'Georgia HOA records the board must keep',
  description:
    'If your Georgia HOA is a nonprofit corporation, the Code lists records it keeps permanently and records members can ask to see. A plain-language list.',
  eyebrow: 'Georgia · Records',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Many Georgia HOAs are nonprofit corporations. The Nonprofit Corporation Code says such a corporation keeps minutes, executed consents and certain other records as permanent records, maintains accounting records, and keeps a record of its members.',
    'A separate section lists records the corporation keeps a copy of, such as its articles, its bylaws and the last three years of member minutes, and says members may inspect and copy them on five business days of written notice.',
    'Accounting records, board minute excerpts and the membership list can be inspected only if the member meets the good-faith and proper-purpose conditions in the statute.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about Title 14, Chapter 3 of the Code, the Nonprofit Corporation Code. It applies to an association that is incorporated as a Georgia nonprofit corporation. Check your articles of incorporation. Our guide on inspection requests covers the owner side of the process.',
      ],
    },
    {
      heading: 'Permanent records',
      body: [
        'Section 14-3-1601(a) names what a corporation keeps as permanent records. For a board, the practical meaning is that meeting minutes and signed consents are not something to clear out after a few years.',
      ],
      quotes: ['requiredRecords'],
    },
    {
      heading: 'Accounting records and the member list',
      body: [
        'Subsections (b) and (c) add two more duties. The text does not define “appropriate,” so a board should agree with its treasurer on what the books contain. The member record must allow a list of names and addresses to be produced, in alphabetical order by class, with the votes each member can cast.',
        'Subsection (d) says records are kept in written form or a form that can be converted to written form within a reasonable time. That covers electronic files.',
      ],
      quotes: ['recAccounting', 'recMemberList', 'recForm'],
    },
    {
      heading: 'Records the corporation keeps copies of',
      body: [
        'Section 14-3-1602(a) lists eight categories. Three examples are quoted here: the bylaws and their amendments, member meeting minutes and consents for the past three years, and the list of current directors and officers. The full list also includes the articles, certain resolutions, member communications from the past three years and the most recent annual registration.',
      ],
      quotes: ['recCopyIntro', 'recBylaws', 'recMinutes3yr', 'recOfficers'],
    },
    {
      heading: 'Records members can inspect',
      body: [
        'Under subsection (b), a member can inspect and copy the subsection (a) records on written notice or demand at least five business days ahead, at a reasonable time and location the corporation specifies.',
        'Subsection (c) covers a second group, including accounting records and the membership list, and it applies only if the member meets subsection (d). The member must act in good faith for a proper purpose, describe the purpose and records with reasonable particularity, and use the records only for that purpose.',
      ],
      quotes: ['memberInspect', 'recInspectIntro', 'recMemberListInspect'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not quote Code Section 14-3-1605, which the membership list provision refers to, so we do not say when a list may be withheld. We also do not cover the separate records rules for condominiums or the 10-year records duty that Senate Bill 406 adds from 2027. Ask your attorney before you deny or narrow a request.',
      ],
    },
  ],
  steps: [
    'Confirm from your articles of incorporation that the association is a Georgia nonprofit corporation.',
    'Check that minutes, signed consents and committee actions are stored in one place and are complete.',
    'Confirm the member list can be produced by name and address, with votes per member.',
    'Keep a current copy of the articles, bylaws, officer list and last annual registration.',
    'Decide in writing who receives inspection requests and how the five business days are counted.',
    'Log each request and what was provided.',
    'Ask your attorney before you refuse a request or set conditions on use.',
  ],
  faqs: [
    {
      q: 'What records must a Georgia nonprofit HOA keep?',
      a: 'Section 14-3-1601 names minutes, executed consents, committee action records, board notice waivers, accounting records and a member record. Section 14-3-1602(a) lists further records it keeps a copy of.',
    },
    {
      q: 'Can a member see the HOA bylaws and minutes?',
      a: 'Under § 14-3-1602(b), a member can inspect and copy the subsection (a) records, such as the bylaws and the last three years of member meeting minutes, on written notice at least five business days ahead.',
    },
    {
      q: 'Can a member see the HOA financial records?',
      a: 'Accounting records fall in the second group in § 14-3-1602(c), and the member must meet the good-faith and proper-purpose conditions in subsection (d).',
    },
    {
      q: 'Can an owner get the list of members?',
      a: 'The statute lists the membership list in the second group, subject to Code Section 14-3-1605, which we do not quote. Ask your attorney.',
    },
    {
      q: 'Does this apply if the HOA is not incorporated?',
      a: 'This guide covers the Nonprofit Corporation Code, so it applies to a nonprofit corporation. Check your articles and ask your attorney about an unincorporated association.',
    },
  ],
  related: [
    'records-inspection-requests',
    'owners-rights-2027',
    'hoa-treasurer-duties',
    'georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
    'georgia-hoa-incorporation-name-and-bylaws-44-3-227',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether a records request is proper or what a corporation must disclose. Your attorney answers legal questions about records.',
}

export const GA_LIEN_PRIORITY: Guide = {
  slug: 'georgia-hoa-lien-priority-taxes-and-mortgages-44-3-232',
  path: '/guides/georgia-hoa-lien-priority-taxes-and-mortgages-44-3-232',
  title: 'Georgia HOA assessment lien priority: what comes ahead of it (§ 44-3-232)',
  metaTitle: 'Georgia HOA lien priority: taxes, mortgages',
  description:
    'The Georgia assessment lien sits ahead of most other liens, with three exceptions: property taxes and two kinds of mortgage. What each exception says.',
  eyebrow: 'Georgia · Assessment lien',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under § 44-3-232(a), assessments become the owner’s personal obligation and a lien in favor of the association that is prior and superior to all other liens whatsoever, except three.',
    'The three exceptions are liens for ad valorem taxes, a first priority mortgage or a mortgage recorded before the declaration, and a secondary purchase money mortgage that was not given to the seller of the lot.',
    'Foreclosure by the association is subject to superior liens, and the court order does not affect the rights of holders of those liens.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'The rule and its exceptions',
      body: [
        'The lien covers sums lawfully assessed, including the share of common expenses and fines. It arises from the time the sums became due and payable. Our guide on assessment lien rules covers what the lien includes and how long it lasts. This page looks only at priority.',
      ],
      quotes: ['lienSums'],
    },
    {
      heading: 'Property taxes',
      body: [
        'The first exception is liens for ad valorem taxes on the lot. A tax lien is not behind the association’s lien.',
      ],
      quotes: ['priTax'],
    },
    {
      heading: 'Mortgages',
      body: [
        'The second exception covers a first priority mortgage, and also any mortgage recorded before the declaration was recorded. The third covers a secondary purchase money mortgage, with a condition about the seller of the lot.',
        'The text does not explain how to tell which mortgage is first priority in a given case. That takes a title search and a lawyer.',
      ],
      quotes: ['priMortgage', 'priSecondary'],
    },
    {
      heading: 'Record notice',
      body: [
        'The recording of the declaration is record notice of the lien, and no further recording of a claim of lien for assessments is required.',
      ],
      quotes: ['lienRecordNotice'],
    },
    {
      heading: 'Foreclosure and superior liens',
      body: [
        'Subsection (c) lets the association foreclose after notice, subject to superior liens. The court order does not affect the rights of the holders of superior liens to use their own security instruments.',
        'Unless the instrument prohibits it, the association may also bid at the foreclosure sale.',
      ],
      quotes: ['priForeclose', 'priBid'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say what an association would recover in a particular sale, how a mortgage lender will treat unpaid assessments, or how the 2027 changes interact with a pending case. Ask your attorney before you rely on lien priority in a collection decision.',
      ],
    },
  ],
  steps: [
    'Pull the recorded declaration and note its recording date.',
    'Ask your attorney or a title company which mortgages on a delinquent lot were recorded before it.',
    'Keep a ledger of amounts due, by lot, with due dates.',
    'Before any foreclosure step, read the notice and amount rules in the lien guide.',
    'Record the board decision in the minutes.',
    'Ask your attorney before you start a foreclosure.',
  ],
  faqs: [
    {
      q: 'Does the HOA lien come before the mortgage in Georgia?',
      a: 'Under § 44-3-232(a), a first priority mortgage and a mortgage recorded before the declaration are exceptions to the association lien’s priority. Ask your attorney how that applies to a given lot.',
    },
    {
      q: 'Does the HOA lien come before property taxes?',
      a: 'No. Liens for ad valorem taxes on the lot are listed as an exception.',
    },
    {
      q: 'Does the association have to record the lien?',
      a: 'The statute says recording the declaration is record notice and no further recordation of a claim of lien for assessments is required.',
    },
    {
      q: 'Can the HOA bid at a foreclosure sale?',
      a: 'Unless the instrument prohibits it, the association has the power to bid on the lot at a foreclosure sale and to acquire, hold, lease, encumber and convey it.',
    },
    {
      q: 'Does foreclosure wipe out the mortgage?',
      a: 'The text says the court order does not affect the rights of holders of superior liens under their security instruments. Ask your attorney about a specific lot.',
    },
  ],
  related: [
    'georgia-hoa-assessment-lien-rules',
    'foreclosure-threshold-2027',
    'georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225',
    'georgia-hoa-estoppel-letter-resale',
    'certified-mail-collections-notices',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not rank liens, search title or start foreclosures. Your attorney answers legal questions about lien priority.',
}

export const GA_RENTAL_AMENDMENT: Guide = {
  slug: 'georgia-hoa-amendment-rental-restrictions-44-3-226',
  path: '/guides/georgia-hoa-amendment-rental-restrictions-44-3-226',
  title: 'Can a Georgia HOA amend its covenants to restrict rentals? (§ 44-3-226)',
  metaTitle: 'Georgia HOA amendment on rental restrictions',
  description:
    'What § 44-3-226 says about amendments that restrict leasing: the vote needed, the protection for existing rentals, and when a lot must conform.',
  eyebrow: 'Georgia · Amendments',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'An amendment to the instrument generally needs the agreement of lot owners holding two-thirds of the votes, or a larger majority if the instrument says so.',
    'Section 44-3-226(a)(2)(B) says no amendment may prohibit or restrict a nonowner occupied lot from continuing to be leased for an initial term of six months or longer under the preamended instrument.',
    'When that lot is conveyed for value, it must conform to the amended instrument. The statute defines conveyance for value by a $100.00 consideration threshold.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'The vote',
      body: [
        'Our guide on amending covenants covers the voting rule in full. In short, the instrument is amended only by the agreement of the required share of lot owners, with extra rules while the declarant has rights.',
      ],
      quotes: ['amendTwoThirds'],
    },
    {
      heading: 'Existing rentals',
      body: [
        'A new rental limit does not reach every lot at once. The statute protects a nonowner occupied lot that was already leased or rented for an initial term of six months or longer, under the instrument as it stood before the amendment.',
      ],
      quotes: ['amendRental'],
    },
    {
      heading: 'When the protection ends',
      body: [
        'The protection is not permanent. On a conveyance for value of the lot, it must conform to the amended instrument. The statute defines the phrase by transfers for $100.00 or more, including transfers of an interest in the entity that owns the lot.',
      ],
      quotes: ['rentalConveyance', 'rentalConveyanceDef'],
    },
    {
      heading: 'Why the wording matters to a board',
      body: [
        'Owners often ask whether a new rental rule applies to them. The honest answer from the text is that it depends on whether the lot was already leased for an initial term of six months or longer before the amendment, and whether the lot has since been conveyed for value. A board that keeps a clear, dated list of known leases will find those questions easier to answer.',
        'The statute speaks of leases or rentals under the preamended instrument. It does not say how a lease is documented, so do not assume that a verbal arrangement or a short stay counts. Ask your attorney how your documents treat each case.',
      ],
    },
    {
      heading: 'Recording the amendment',
      body: [
        'The required majority is shown by executing the amendment, or by a sworn statement of an officer in the cases the statute allows. The amendment takes effect only when recorded, or at a later date it names.',
      ],
      quotes: ['amendEvidence', 'amendEffective'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say how to draft a rental clause, how to prove an existing lease, what a lease term counts as, or whether your declaration already restricts leasing. Ask your attorney before you circulate an amendment.',
      ],
    },
  ],
  steps: [
    'Read the declaration for the amendment threshold and any existing leasing rules.',
    'List which lots are currently leased and since when, from the information owners have given.',
    'Have your attorney draft the language, including how existing rentals are treated.',
    'Gather executed agreements from the required share of lot owners, or ask your attorney about the sworn statement route.',
    'Record the amendment, and note its effective date.',
    'Tell owners in plain words what changed and who is affected.',
  ],
  faqs: [
    {
      q: 'Can a Georgia HOA ban rentals by amendment?',
      a: 'It can amend with the required vote, but § 44-3-226(a)(2)(B) protects a nonowner occupied lot already leased for an initial term of six months or longer. Ask your attorney how it applies to your community.',
    },
    {
      q: 'What vote does a rental amendment need?',
      a: 'Two-thirds of the votes, or a larger majority if the instrument specifies, with extra rules while the declarant has rights.',
    },
    {
      q: 'When must a grandfathered rental lot follow the new rule?',
      a: 'Upon the conveyance for value of the lot, which the statute defines by a transfer for $100.00 or more.',
    },
    {
      q: 'Does the amendment take effect when signed?',
      a: 'The statute says it becomes effective only when recorded, or at a later date the amendment names.',
    },
    {
      q: 'Does this guide say whether my current rental rules are valid?',
      a: 'No. It restates the statute. Your declaration and your attorney decide that.',
    },
  ],
  related: [
    'georgia-hoa-amend-covenants-two-thirds',
    'georgia-hoa-act-definitions-44-3-221',
    'georgia-hoa-owner-compliance-and-remedies-44-3-223',
    'fines-and-violation-hearings',
    'georgia-hoa-board-powers-44-3-231',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not draft amendments or decide which rentals are protected. Your attorney answers legal questions about leasing rules.',
}
