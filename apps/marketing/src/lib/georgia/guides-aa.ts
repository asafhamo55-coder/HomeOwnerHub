// SEO batch 27: three Georgia guides for board members.
//   1. Reserves: what the Property Owners' Association Act says about reserve funds, and what it does
//      not say about reserve studies (44-3-221(3), 44-3-71(5), and SB 406's definition from 2027).
//   2. The annual meeting: notice, delivery, reports and quorum (44-3-230(a), 44-3-228, 14-3-701).
//   3. The yearly registration with the Secretary of State and administrative dissolution (14-3-1622, 14-3-1420).
// Statute text only through the quote bank (defCommonExpenses, condoCommonExpenses, regularDef, specialDef,
// meetingNotice, meetingDelivery, meetingReports, memberQuorum, nonprofit*, annualReg*, dissolve*), checked word
// for word by georgia-guides.test.ts against the fixtures. Every other sentence restates a quote and adds no
// rule. Product claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-05'

export const GA_RESERVES: Guide = {
  slug: 'georgia-hoa-reserve-fund-and-reserve-study',
  path: '/guides/georgia-hoa-reserve-fund-and-reserve-study',
  title: 'Does Georgia require an HOA reserve study? What the Act says about reserves',
  metaTitle: 'Georgia HOA reserve fund and reserve study',
  description:
    'What the Georgia Property Owners’ Association Act says about reserves, what it leaves to your declaration, and how a board can plan for big repairs.',
  eyebrow: 'Georgia · Budget and reserves',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Board members often ask whether Georgia requires a reserve study. In the Property Owners’ Association Act text we hold, the word “reserves” appears in definitions, and we did not find a provision that requires a reserve study by that name.',
    'The Act defines common expenses to include funds lawfully assessed for creating and maintaining reserves “pursuant to the provisions of the instrument.” So the declaration is where a reserve duty or a reserve amount would normally come from.',
    'A reserve study is a planning tool, not a legal form. A board can still use one to set a budget it can defend to owners.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'What a reserve fund and a reserve study are',
      body: [
        'A reserve fund is money an association sets aside for large repairs and replacements that come around every few years or decades, such as roofs on shared buildings, paving, pool equipment or fencing. A reserve study is a document, usually prepared by a specialist, that lists those components, estimates how long each will last and what it will cost to replace, and suggests how much to set aside each year.',
        'Those are working definitions for this page. They are not statute text, and your declaration may use different words.',
      ],
    },
    {
      heading: 'What the Act says about reserves',
      body: [
        'The definition of common expenses in § 44-3-221(3) covers money the association spends and also “funds lawfully assessed for the creation and maintenance of reserves.” The definition ties the reserves to the provisions of the instrument, which is the declaration and related documents.',
        'Read that carefully. The text makes reserve money part of common expenses when it is lawfully assessed under the instrument. It does not, in the part we quote here, say that every association must hold a reserve or say how large it must be.',
      ],
      quotes: ['defCommonExpenses'],
    },
    {
      heading: 'Condominium associations',
      body: [
        'If your community is a condominium, the Georgia Condominium Act has its own definition of common expenses with the same reserve wording, tied to the condominium instruments. Our guide on condominium and HOA law explains why the two statutes are different.',
      ],
      quotes: ['condoCommonExpenses'],
    },
    {
      heading: 'What changes in 2027',
      body: [
        'Senate Bill 406 adds definitions of regular and special assessments. They take effect on January 1, 2027, and they apply to associations that fall under the new chapter (the definition of owners’ association excludes nonregistered owners’ associations). Under the new definition, regular assessments fund the regular operating budget, and the examples of those costs include reserve fund contributions.',
        'Special assessments are the other kind. They cover costs that are not in the regular operating budget, and the examples include nonroutine or emergency repairs and other capital projects. The practical point for a board is that the label matters: a planned replacement that you budget for each year is a different thing from a surprise bill.',
      ],
      quotes: ['regularDef', 'specialDef', 'actEffective'],
    },
    {
      heading: 'Why a board might get a study anyway',
      body: [
        'Even where no statute requires one, a study gives the board a written basis for its budget. When owners ask why dues are going up, “the report estimates the pool deck needs replacing in about eight years” is a stronger answer than a guess.',
        'A study is also not a promise. Estimates of life and cost can be wrong, so many boards revisit them every few years. Your declaration or bylaws may set their own rules for reserves, and your attorney can tell you whether any apply.',
      ],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say what your declaration requires, how much your association should hold, or whether a particular lender, insurer or buyer expects a reserve study. We also did not search every Georgia statute, only the Act and the Condominium Act text we hold.',
        'If you want to know whether your association has a legal duty to fund reserves, ask your attorney to read the declaration, the bylaws and the current Code.',
      ],
    },
  ],
  steps: [
    'Read the declaration and bylaws for any wording on reserves, a reserve account or a required study.',
    'List the big shared components and the year each was last replaced or repaired.',
    'Ask the board whether to hire a specialist for a study, and record the vote in the minutes.',
    'Compare the study, if you have one, with the account balance and the annual budget.',
    'Write down, in the budget notes, which costs are routine operating costs, which go to reserves and which would need a special assessment.',
    'Share the plan with owners in plain words before the annual meeting.',
    'Ask your attorney before you rely on this page to set or change a reserve policy.',
  ],
  faqs: [
    {
      q: 'Does Georgia law require an HOA to have a reserve study?',
      a: 'We did not find a requirement for a reserve study, by that name, in the Property Owners’ Association Act text we hold. Your declaration may say something different, so read it and ask your attorney.',
    },
    {
      q: 'Does a Georgia HOA have to keep a reserve fund?',
      a: 'The definition of common expenses refers to funds lawfully assessed for reserves under the instrument. The text we quote does not, by itself, say that every association must hold a reserve or how much. The declaration is the place to look.',
    },
    {
      q: 'Can the board charge owners for reserves?',
      a: 'The Act text treats funds lawfully assessed for reserves under the instrument as common expenses. Whether your board may assess for them, and how, depends on your declaration and bylaws.',
    },
    {
      q: 'What is the difference between a reserve contribution and a special assessment?',
      a: 'From January 1, 2027, the new definitions describe regular assessments as funding the regular operating budget, with costs that may include reserve fund contributions, and special assessments as covering costs outside that budget, such as nonroutine or emergency repairs and other capital projects. Check whether the new chapter applies to your association.',
    },
    {
      q: 'How often should a board update a reserve study?',
      a: 'The statute text we hold does not set a schedule. Many boards review the figures every few years or after a large repair. Ask the specialist who prepared the study for their advice.',
    },
  ],
  related: [
    'special-assessments',
    'georgia-hoa-act-definitions-44-3-221',
    'condo-vs-hoa-law',
    'hoa-treasurer-duties',
    'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not prepare reserve studies and does not tell a board how much to hold in reserve. A reserve specialist prepares a study, and your attorney answers legal questions about reserves.',
}

export const GA_ANNUAL_MEETING: Guide = {
  slug: 'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
  path: '/guides/georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
  title: 'Georgia HOA annual meeting: notice, delivery, reports and quorum (§ 44-3-230)',
  metaTitle: 'Georgia HOA annual meeting notice and quorum',
  description:
    'A checklist-style guide to the Georgia annual meeting: 21 days of notice, how notice is delivered, the reports owners hear, and the one-third quorum default.',
  eyebrow: 'Georgia · Annual meeting',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 44-3-230(a) of the Georgia Property Owners’ Association Act says meetings of the members are held under the bylaws and called at least once a year.',
    'Notice goes to each lot owner at least 21 days ahead for an annual or regularly scheduled meeting, and at least seven days ahead for any other meeting. It states the time and place, and for a special meeting the purpose.',
    'At the annual meeting the association makes comprehensive reports on its affairs, finances and budget projections. Unless the instrument or bylaws provide otherwise, a quorum is persons entitled to cast more than one-third of the votes at the start of the meeting.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'The meeting itself',
      body: [
        'Subsection (a) says meetings of the members follow the bylaws and “in any event” are called not less often than yearly. If the board has let the date slip, our guide on owner-called meetings explains what owners can do under subsection (b).',
        'Many Georgia associations are also incorporated as nonprofit corporations. If yours is, the Nonprofit Corporation Code has its own rule that a membership corporation holds a meeting of members annually at the time the bylaws set.',
      ],
      quotes: ['meetingAnnual', 'nonprofitAnnual'],
    },
    {
      heading: 'How much notice',
      body: [
        'The notice period is a number you can put on a calendar. Count back at least 21 days from the annual meeting, or from any regularly scheduled meeting. For other meetings, such as a special meeting, count back at least seven days.',
        'The notice states the time and place. For a special meeting it also states the purpose. The text does not list what else an annual meeting notice must include, so check your bylaws for an agenda requirement.',
      ],
      quotes: ['meetingNotice'],
    },
    {
      heading: 'How notice is delivered',
      body: [
        'The statute names the ways to deliver notice: personally, by United States mail with postage prepaid, by statutory overnight delivery, or electronically under the Uniform Electronic Transactions Act. It goes to all lot owners of record, at the address each owner designated or, if none, at the address of the lot.',
        'That makes your owner address list part of your meeting process. A lot owner who moved away but never changed the address may still be entitled to notice at the lot. Our guide on certified-mail notices covers keeping proof of what you sent.',
      ],
      quotes: ['meetingDelivery'],
    },
    {
      heading: 'What gets reported',
      body: [
        'The Act says comprehensive reports of the affairs, finances and budget projections of the association are made to the lot owners at the annual meeting. If your association is a nonprofit corporation, the Nonprofit Corporation Code adds that the chief executive officer and chief financial officer report on the activities and financial condition of the corporation.',
        'The texts do not define “comprehensive,” so a board is wise to agree on a written format with its treasurer ahead of time and attach it to the minutes.',
      ],
      quotes: ['meetingReports', 'nonprofitAnnualReport'],
    },
    {
      heading: 'Quorum',
      body: [
        'Under § 44-3-228, unless the instrument or bylaws provide otherwise, a quorum is deemed present throughout a meeting of the members if persons entitled to cast more than one-third of the votes are present at the beginning of the meeting.',
        'Your bylaws may set a different figure, so read them first. Our guide on quorum and proxies covers proxies and what counts as present.',
      ],
      quotes: ['memberQuorum'],
    },
    {
      heading: 'Remote meetings and missed dates',
      body: [
        'If your association is a nonprofit corporation, the Nonprofit Corporation Code lets the board decide that an annual meeting is held wholly or partly by remote communication, unless the articles or bylaws provide otherwise. That section points to another Code section on remote communication that we do not quote here, so ask your attorney how to run one.',
        'That Code also says that failing to hold an annual meeting at the time the bylaws set does not affect the validity of any corporate action. That sentence is about the validity of actions, not about whether owners can insist on a meeting.',
      ],
      quotes: ['nonprofitRemote', 'nonprofitAnnualFailure'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'This guide applies only if your association is under the Georgia Property Owners’ Association Act, which an older declaration reaches only if it elects the Act. We do not say what happens to a vote taken after a defective notice, and we do not say what your bylaws add.',
      ],
    },
  ],
  steps: [
    'Find the annual meeting date in your bylaws and put the notice deadline, at least 21 days earlier, on the board calendar.',
    'Check the owner address list against the addresses owners designated, and use the lot address when none was designated.',
    'Choose a delivery method the statute names, and keep a record of when and how each notice went out.',
    'Prepare the financial and budget reports in writing, and agree who presents them.',
    'Check the quorum figure in the bylaws, and plan to count attendance and proxies at the start of the meeting.',
    'Record the notice date, the quorum count and the reports given in the minutes.',
    'Ask your attorney before you proceed with a meeting if notice may have been late or incomplete.',
  ],
  faqs: [
    {
      q: 'How much notice does a Georgia HOA have to give for the annual meeting?',
      a: 'Under § 44-3-230(a), at least 21 days for an annual or regularly scheduled meeting, and at least seven days for any other meeting. Check your bylaws, which may add requirements.',
    },
    {
      q: 'Can a Georgia HOA send meeting notice by email?',
      a: 'The statute lists electronic issuance in accordance with the Uniform Electronic Transactions Act among the permitted ways. Ask your attorney how that works with your documents and the addresses owners designated.',
    },
    {
      q: 'What is the quorum for a Georgia HOA annual meeting?',
      a: 'Unless the instrument or bylaws provide otherwise, persons entitled to cast more than one-third of the votes, present at the beginning of the meeting. Your bylaws may set a different figure.',
    },
    {
      q: 'What reports must be given at the annual meeting?',
      a: 'The Act says comprehensive reports of the affairs, finances and budget projections of the association. For a nonprofit corporation, the Nonprofit Corporation Code adds a report by the chief executive officer and chief financial officer on activities and financial condition.',
    },
    {
      q: 'What if the board missed the annual meeting this year?',
      a: 'Subsection (b) of § 44-3-230 lets owners holding enough of the voting power call one after the fiscal year ends without a meeting. Our guide on owner-called meetings explains the details.',
    },
  ],
  related: [
    'annual-meeting-quorum-proxies',
    'georgia-hoa-owners-call-annual-meeting-44-3-230',
    'georgia-hoa-written-ballots-without-a-meeting',
    'annual-meeting-notice-checklist',
    'certified-mail-collections-notices',
    'self-managed-hoa-georgia-first-90-days',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether a notice was timely or a meeting valid. Your attorney answers legal questions about a meeting.',
}

export const GA_ANNUAL_REGISTRATION: Guide = {
  slug: 'georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
  path: '/guides/georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
  title: 'Georgia HOA annual registration with the Secretary of State (§ 14-3-1622)',
  metaTitle: 'Georgia HOA yearly Secretary of State filing',
  description:
    'If your Georgia HOA is a nonprofit corporation, it files an annual registration each year. What it lists, when it is due and what happens if it is missed.',
  eyebrow: 'Georgia · Corporate filing',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Many Georgia HOAs are nonprofit corporations. Under the Nonprofit Corporation Code, each domestic corporation delivers an annual registration to the Secretary of State.',
    'The registration lists the corporation’s name, its registered office and agent, its principal office mailing address and the names and addresses of its chief executive officer, chief financial officer and secretary.',
    'Subsequent registrations are due between January 1 and April 1, or another date the Secretary of State sets by rules. A missed registration can lead the Secretary of State to start a proceeding for administrative dissolution.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which filing this is',
      body: [
        'This page is about the yearly corporate registration under Title 14, Chapter 3 of the Code. It applies to an association that is incorporated as a Georgia nonprofit corporation. Our guide on incorporation, name and bylaws covers what § 44-3-227 says about incorporating.',
        'It is not the registration that Senate Bill 406 creates for owners’ associations from 2027. That is a different filing under a different law. Our registration guide covers it. A board may have to handle both.',
      ],
    },
    {
      heading: 'What the registration lists',
      body: [
        'Subsection (a) says each domestic corporation delivers the registration to the Secretary of State for filing. It sets out four items. The name of the corporation and its state of incorporation. The street address and county of its registered office and the name of its registered agent. The mailing address of its principal office, if any. And the officers.',
      ],
      quotes: ['annualRegIntro', 'annualRegOfficers'],
    },
    {
      heading: 'Keep the officer names current',
      body: [
        'The registration must be current as of the date it is executed. In practice this ties your annual filing to your board elections. If the officers change at the annual meeting, the filing that follows should show the new chief executive officer, chief financial officer and secretary.',
        'The text names those three positions. Your bylaws may use titles such as president and treasurer, so match them to the offices the Code names and ask your attorney if it is unclear.',
      ],
      quotes: ['annualRegCurrent'],
    },
    {
      heading: 'When it is due',
      body: [
        'After the first filing, the registration is delivered between January 1 and April 1 of each following year, “or such other date as the Secretary of State may specify by rules or regulations.” So check the Secretary of State’s current instructions for the date that applies to you.',
        'The first registration has its own timing rules in subsections (c) and (d), which depend on when the articles were filed. We do not summarize those here.',
      ],
      quotes: ['annualRegWindow'],
    },
    {
      heading: 'If the form is incomplete',
      body: [
        'Subsection (e) covers a registration that lacks required information. The Secretary of State notifies the corporation in writing and returns the report for correction. If the corrected report is delivered within 30 days after the effective date of the notice, it is treated as timely filed.',
      ],
      quotes: ['annualRegCorrect'],
    },
    {
      heading: 'What a missed filing can lead to',
      body: [
        'Section 14-3-1420 lists grounds on which the Secretary of State may start a proceeding to dissolve a corporation administratively. One is that the corporation does not deliver its annual registration, with all required fees and penalties, within 60 days after it is due. Another is being without a registered agent or registered office for 60 days or more.',
        'The statute says the Secretary of State “may” begin a proceeding, so a missed date is not an automatic dissolution. We do not cover what happens to an association after a dissolution or how a corporation is restored. That is a question for your attorney.',
      ],
      quotes: ['dissolveIntro', 'dissolveNoReg', 'dissolveNoAgent'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not state the filing fee, the form to use or the Secretary of State’s current online process, because those can change. We also do not say whether your association is a nonprofit corporation. Check your articles of incorporation.',
      ],
    },
  ],
  steps: [
    'Find your articles of incorporation and confirm that the association is a Georgia nonprofit corporation.',
    'Look up your last annual registration on file, and write down the registered agent and registered office listed.',
    'Put the January 1 to April 1 window on the board calendar, and check the Secretary of State’s current instructions for the exact date.',
    'After each election, update the list of chief executive officer, chief financial officer and secretary, and make sure the next filing shows them.',
    'Keep the filing and the receipt with the corporate records.',
    'Ask your attorney if a filing was missed or the registered agent has changed.',
  ],
  faqs: [
    {
      q: 'Does a Georgia HOA have to file an annual registration?',
      a: 'If it is a domestic nonprofit corporation, § 14-3-1622 says it delivers an annual registration to the Secretary of State. Check your articles of incorporation to see how your association is organized.',
    },
    {
      q: 'When is the annual registration due?',
      a: 'After the first one, between January 1 and April 1, or another date the Secretary of State specifies by rules or regulations. Confirm the current date with the Secretary of State.',
    },
    {
      q: 'What information goes on the registration?',
      a: 'The corporation’s name and state of incorporation, its registered office and agent, its principal office mailing address if any, and the names and addresses of its chief executive officer, chief financial officer and secretary.',
    },
    {
      q: 'What happens if the HOA misses the filing?',
      a: 'Section 14-3-1420 lets the Secretary of State start a proceeding for administrative dissolution if the registration is not delivered, with fees and penalties, within 60 days after it is due. Ask your attorney what to do if that has happened.',
    },
    {
      q: 'Is this the same as the new owners’ association registration in 2027?',
      a: 'No. That is a separate filing created by Senate Bill 406. See our registration guide for that one.',
    },
  ],
  related: [
    'registration-2027',
    'georgia-hoa-incorporation-name-and-bylaws-44-3-227',
    'georgia-hoa-who-can-serve-on-the-board-44-3-229',
    'hoa-treasurer-duties',
    'georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not file with the Secretary of State on your behalf, and does not decide whether your corporation is in good standing. Your attorney or the Secretary of State can answer those questions.',
}
