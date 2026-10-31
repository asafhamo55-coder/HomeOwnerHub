// SEO batch 23: Florida architectural review (720.3035), presuit mediation (720.311)
// and the owner rights in 720.304 (flags, flagpoles, access ramps, security signs).
// Statute text only through the quote bank (flArc*, flMed*, flFlags*, flRamp*,
// flSecuritySign), checked word for word by georgia-guides.test.ts against
// flsenate-ch720-2026.html. Every other sentence restates a quote or the same
// section's text in the fixture and adds no rule. Chapter 720 only, not condominiums.
// Not quoted on purpose: the 4 1/2 by 6 foot flag size (the fixture prints it as a
// fraction, so the page states it in words), the mediation demand form (a statutory
// form, the page points at it and does not reprint it) and the SLAPP subsection.
// Product claim, ARC page only: ARC requests with a decide-by deadline and
// editable decision letters (releases 2026-10-20-1440 and 2026-10-18-0650), and
// owners can send a request from the portal. The statute's written-notice rule
// is the board's to meet: the app does not pick the rule for the board. The
// mediation and flag pages say HomeownerHub does not handle those disputes.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_ARC: Guide = {
  slug: 'florida-hoa-architectural-review-720-3035',
  path: '/guides/florida-hoa-architectural-review-720-3035',
  state: 'FL',
  title: 'What a Florida HOA architectural review can and cannot restrict',
  metaTitle: 'Florida HOA architectural review, 720.3035',
  description:
    'Fla. Stat. 720.3035 limits what an HOA architectural committee can review and deny: interiors, hidden air conditioners, permits, denial notices and shutters.',
  eyebrow: 'Florida · Architectural review',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.3035 of the Florida Homeowners’ Association Act limits an association and its architectural committee. They may review and enforce only what the declaration, or published guidelines the declaration authorizes, state or reasonably infer. They must apply those standards reasonably and equitably to all parcel owners.',
    'The section lists things a committee may not do: regulate the interior of a structure that is not visible from outside, require approval of an unseen air-conditioning or heating system that matches an approved one, or require a building permit before it will review a project.',
    'A denial must be in writing and name the rule or covenant and the part of the plan that does not conform. Hurricane protection has its own rule. The section covers homeowners’ associations under chapter 720, not condominiums.',
    'This is a plain-language guide to the text we hold, not legal advice. Your attorney decides how it applies to a particular application.',
  ],
  sections: [
    {
      heading: 'Where the committee’s power comes from',
      body: [
        'An architectural committee has no general power to approve or reject what it likes. The statute ties its authority to your documents. The committee can review location, size, type or appearance, and can enforce standards for outside appearance, only to the extent the declaration, or published guidelines the declaration authorizes, say so or reasonably imply it.',
      ],
      quotes: ['flArcAuthority'],
    },
    {
      heading: 'Apply the standards the same way to everyone',
      body: [
        'The same subsection adds a duty. The standards must be applied and enforced reasonably and equitably on all parcel owners. Two similar fences should get the same answer.',
      ],
    },
    {
      heading: 'What the committee may not regulate',
      body: [
        'Section 720.3035(1)(b) says an association or committee may not enforce or adopt a covenant, rule or guideline that does either of the following. The first is about interiors:',
      ],
      quotes: ['flArcInterior'],
    },
    {
      heading: 'Air conditioning and heating systems',
      body: [
        'The second item protects equipment that cannot be seen from outside. The committee may not require review of a central air-conditioning, refrigeration, heating or ventilating system if two things are true: the system is not visible from the parcel’s frontage, an adjacent parcel, an adjacent common area or a community golf course, and it is substantially similar to a system the association or a committee approves or recommends.',
      ],
    },
    {
      heading: 'No building permit first',
      body: [
        'A committee cannot make an owner get a government building permit before it will look at the plans. A permit can be required of the owner by the city or county, but the committee cannot make it a condition of review.',
      ],
    },
    {
      heading: 'Options the documents already give',
      body: [
        'If the declaration or published guidelines offer choices, such as a list of materials, sizes, designs or locations, the committee cannot narrow the list for one owner. The owner picks from the options provided.',
      ],
    },
    {
      heading: 'Setbacks and policies that go beyond the documents',
      body: [
        'Unless the documents say otherwise, a parcel is treated as having one front for the front setback, even if a road or easement bounds it on more than one side. If the documents give no setback, the county or city setback applies, and the committee may not enforce a setback that conflicts with it.',
        'Subsection (5) goes further. Neither the association nor a committee may enforce a policy or restriction that is inconsistent with the owner’s rights and privileges under the declaration or published guidelines, whether or not it is applied uniformly, and may not rely on such a policy as a defense in an action against an owner.',
      ],
    },
    {
      heading: 'How to deny an application',
      body: [
        'A denial is not a one-line “no.” The notice must be in writing and must state with specificity the rule or covenant relied on and the specific aspect or part of the proposed improvement that does not conform to it. If you cannot name both, you are not ready to deny.',
      ],
      quotes: ['flArcDenial'],
    },
    {
      heading: 'When an owner can recover costs',
      body: [
        'The statute gives an owner a remedy, but a narrow one. The committee must have unreasonably, knowingly and willfully infringed or impaired the owner’s rights and privileges. In that case the adversely affected owner can recover damages and the costs and reasonable attorney fees of preserving or restoring those rights.',
      ],
    },
    {
      heading: 'Hurricane protection',
      body: [
        'Subsection (6) applies to all homeowners’ associations in the state, regardless of when the community was created. The board or committee must adopt hurricane protection specifications for each structure or improvement. They may include color and style, and must comply with the building code.',
        'Once the specifications exist, the board cannot deny a conforming application. It may still require an owner to follow an existing unified building scheme for how the outside of the structure looks. The statute’s definition of hurricane protection is broad and includes storm shutters, impact-resistant windows and doors, and exterior fixed generators.',
      ],
      quotes: ['flArcHurricane'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not say how long a committee has to decide. The text we hold sets no decision deadline, so check your own documents for one. Whether a particular rule meets this section is a question for your attorney.',
      ],
    },
  ],
  steps: [
    'Find the sentence in your declaration, or in a published guideline the declaration authorizes, that gives the committee authority over the kind of change you are reviewing.',
    'Check that the application is not about an interior that cannot be seen from outside, or a matching air-conditioning or heating system that cannot be seen.',
    'If you deny, write the rule or covenant and the part of the plan that does not conform. Use the same standard you used for the last similar request.',
    'Adopt hurricane protection specifications, and approve applications that conform to them.',
  ],
  faqs: [
    {
      q: 'Can an HOA architectural committee regulate the inside of my house?',
      a: 'Not if the interior is not visible from the parcel’s frontage, an adjacent parcel, an adjacent common area or a community golf course. Section 720.3035(1)(b) says the association may not enforce or adopt a rule that limits or places requirements on it.',
    },
    {
      q: 'Does the committee have to tell me why it denied my application?',
      a: 'Yes. Under § 720.3035(4)(a) the denial must be written and state with specificity the rule or covenant relied on and the specific part of the proposed improvement that does not conform.',
    },
    {
      q: 'Can the HOA require a building permit before it reviews my plans?',
      a: 'No. Section 720.3035(1)(c) says the association or committee may not require a building permit as a prerequisite for its review.',
    },
    {
      q: 'Can the board deny hurricane shutters?',
      a: 'Under § 720.3035(6)(b) the board may not deny an application for hurricane protection that conforms to the specifications it adopted. The board must adopt specifications, and it may require an owner to follow an existing unified building scheme for outside appearance.',
    },
    {
      q: 'What can an owner recover if the committee breaks these rules?',
      a: 'If the infringement was unreasonable, knowing and willful, the owner can recover damages and the costs and reasonable attorney fees of preserving or restoring the owner’s rights, under § 720.3035(4)(b).',
    },
  ],
  related: [
    'florida-hoa-fine-hearing-committee',
    'florida-hoa-official-records-inspection',
    'florida-hoa-presuit-mediation-720-311',
    'florida-hoa-flags-ramps-and-signs-720-304',
  ],
  hoaDoes: [
    {
      text: 'Owners send an exterior change request from the resident portal, and the board decides it under ARC. The board sets a decision deadline in days, and each request shows how much time is left and turns red once it is overdue.',
      route: '/arc',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'Approve, approve with conditions, deny and request more information each come with a decision letter the board can edit. A letter with an unfilled blank cannot be sent, so the rule and the part of the plan you cite are yours to fill in.',
      route: '/arc',
      release: '2026-10-18-0650-roster-arc-letters-guide',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not decide whether an application meets your guidelines, choose the rule your denial relies on, or tell you whether a rule goes beyond § 720.3035. The board decides, and your attorney answers legal questions.',
}

export const FL_MEDIATION: Guide = {
  slug: 'florida-hoa-presuit-mediation-720-311',
  path: '/guides/florida-hoa-presuit-mediation-720-311',
  state: 'FL',
  title: 'Florida HOA presuit mediation before you sue or are sued',
  metaTitle: 'Florida HOA presuit mediation rules, 720.311',
  description:
    'Fla. Stat. 720.311 requires a demand for presuit mediation before many HOA disputes reach court. Which disputes, how it is served, the 20 and 90 day clocks.',
  eyebrow: 'Florida · Disputes',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.311 of the Florida Homeowners’ Association Act makes many disputes between an owner and an association go through presuit mediation first. It covers use of or changes to the parcel or common areas, covenant enforcement, amendments, board and committee meetings, membership meetings and access to official records.',
    'The party who wants to sue serves a written demand by certified mail. The other side has 20 days from mailing to answer. If a session cannot be held within 90 days, an impasse is deemed to have occurred unless both sides agree to more time.',
    'Collections of assessments and fines are outside this section, and so are election and recall disputes. A party who refuses to take part cannot recover attorney fees later.',
    'This is a plain-language guide to the text we hold, not legal advice. A mediation demand has a statutory form, so ask your attorney to prepare it.',
  ],
  sections: [
    {
      heading: 'Which disputes need mediation first',
      body: [
        'The statute lists the kinds of dispute. If yours is on the list, the aggrieved party must serve a demand for presuit mediation before filing in court. The list is the use or change of a parcel or the common areas, other covenant enforcement disputes, disputes about amendments, about meetings of the board and its committees, about membership meetings other than elections, and about access to the official records.',
      ],
      quotes: ['flMedRequired'],
    },
    {
      heading: 'What is left out',
      body: [
        'Money owed is not subject to this section. Collecting an assessment, a fine or any other financial obligation, including attorney fees and costs claimed to be due, does not go through presuit mediation. Neither does an action to enforce an earlier mediation settlement.',
        'Election and recall disputes are also outside it. Those go to arbitration by the department, or to a court.',
      ],
      quotes: ['flMedExcluded', 'flMedElection'],
    },
    {
      heading: 'Emergencies',
      body: [
        'If the situation cannot wait, a party may ask the court for a temporary injunction without mediating first. Once the emergency is dealt with, the court may send the parties to mediation or require it under this section.',
      ],
    },
    {
      heading: 'How the demand is served',
      body: [
        'The demand is a letter in substantially the statute’s own form. It goes by certified mail, return receipt requested, with a copy by regular first-class mail, to the address on the association’s books and records. The statute prints the form in full, and the form has the demanding party list five certified mediators for the other side to choose from. Do not rewrite the form from memory.',
        'The responding party has 20 days from the date of mailing to answer in writing. The answer is served the same way, by certified mail with a first-class copy.',
      ],
      quotes: ['flMedService'],
    },
    {
      heading: 'Who pays',
      body: [
        'Unless the parties agree otherwise, they split the cost equally, including the mediator’s fee. The mediator can require payment in advance.',
      ],
      quotes: ['flMedCosts'],
    },
    {
      heading: 'What counts as refusing',
      body: [
        'The statute is firm about silence. Failing to respond, failing to agree on a mediator, failing to pay on time, or failing to appear at a scheduled session without the mediator’s approval counts as a refusal to take part. That is an impasse for the party who failed, and the other side can go to court and ask for the costs and fees of the mediation.',
      ],
      quotes: ['flMedImpasse'],
    },
    {
      heading: 'The cost of staying out',
      body: [
        'A party who refuses to take part in the entire process may not recover attorney fees and costs in later litigation over the dispute. A board that ignores a demand can lose the right to recover its fees even if it wins.',
      ],
      quotes: ['flMedNoFees'],
    },
    {
      heading: 'The 90 day limit and what comes after',
      body: [
        'If a session cannot be scheduled and held within 90 days after the offer to mediate was filed, an impasse is deemed to have occurred, unless both sides agree to extend the deadline.',
        'If mediation does not settle everything, the parties may go to court, or may choose binding or nonbinding arbitration. Section 720.311(1) also says serving a demand tolls the applicable statute of limitations.',
      ],
      quotes: ['flMedNinety'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not reprint the statutory form, and we do not say which disputes in your community fall inside the list. The mediator qualifications, the arbitration rules and the sanctions for missing a session are in the full text. Your attorney should read it before you serve or answer a demand.',
      ],
    },
  ],
  steps: [
    'Write down what the dispute is about and check whether it is on the list, or is a money, election or recall dispute that is not.',
    'If it needs mediation, have your attorney prepare the demand in the statute’s form and pick five certified mediators.',
    'Send the demand by certified mail, return receipt requested, and a copy by first-class mail, to the address on the association’s books and records. Keep both receipts.',
    'Calendar 20 days from the mailing for the answer and 90 days for the session.',
    'If you receive a demand, answer it in writing within the 20 days, by certified mail and first-class mail, and name an acceptable mediator.',
    'Agree who prepays the mediator, and keep the signed agreement with the board’s records.',
    'If you want more time, agree to the extension in writing.',
  ],
  faqs: [
    {
      q: 'Do I have to mediate before suing my Florida HOA?',
      a: 'For the listed disputes, yes. Section 720.311(2)(a) says covenant enforcement, parcel changes, amendments, meetings and records access disputes are the subject of a demand for presuit mediation before the dispute is filed in court.',
    },
    {
      q: 'Does this apply to unpaid assessments or fines?',
      a: 'No. The section says disputes subject to presuit mediation do not include the collection of any assessment, fine or other financial obligation, including attorney fees and costs claimed to be due.',
    },
    {
      q: 'How long does the other side have to answer a demand?',
      a: 'The responding party has 20 days from the date of mailing to answer in writing, by certified mail with a first-class copy, under § 720.311(2)(b).',
    },
    {
      q: 'What happens if the other side ignores the demand?',
      a: 'That counts as a refusal to take part and is an impasse by that party. The other side can go to court, ask for the mediation costs and fees, and the party who refused cannot recover attorney fees later.',
    },
    {
      q: 'Who pays for the mediator?',
      a: 'The parties share the costs equally unless they agree otherwise, and the mediator may require advance payment.',
    },
  ],
  related: [
    'florida-hoa-official-records-inspection',
    'florida-hoa-board-meeting-notice-rules',
    'florida-hoa-fine-hearing-committee',
    'florida-hoa-architectural-review-720-3035',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not prepare or send a mediation demand, track the 20 and 90 day clocks, or choose a mediator. Your attorney prepares the demand. Keep the certified mail receipts with the association’s records.',
}

export const FL_FLAGS_RAMPS: Guide = {
  slug: 'florida-hoa-flags-ramps-and-signs-720-304',
  path: '/guides/florida-hoa-flags-ramps-and-signs-720-304',
  state: 'FL',
  title: 'Flags, flagpoles, access ramps and security signs in a Florida HOA',
  metaTitle: 'Florida HOA flags and ramps, 720.304',
  description:
    'Fla. Stat. 720.304 lets owners display certain flags, raise a flagpole, build an access ramp and post a security sign even when covenants say no.',
  eyebrow: 'Florida · Owner rights',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.304 of the Florida Homeowners’ Association Act protects four things an owner can do even if a covenant, bylaw or rule says otherwise: display certain flags, erect a flagpole, build an access ramp for a resident with a medical need, and post a security company sign.',
    'The flag rule allows up to two portable flags from a list. The list is the United States flag, the Florida flag, a military branch flag, a POW-MIA flag and a first responder flag. A flagpole may be up to 20 feet high, with limits.',
    'The board can still apply building codes, zoning setbacks and the setbacks in the governing documents to a flagpole. A ramp needs plans submitted in advance and a physician’s affidavit.',
    'This is a plain-language guide to the text we hold, not legal advice. Your attorney decides how it applies to a particular owner.',
  ],
  sections: [
    {
      heading: 'Flags the covenants cannot ban',
      body: [
        'The statute starts with a condition. If a covenant, rule or requirement prohibits a homeowner from displaying the flags listed in the paragraph, the homeowner may still display up to two of them, in a respectful manner, if they are portable and removable and not larger than 4 1/2 feet by 6 feet.',
        'The list is the United States flag, the official flag of the State of Florida, a flag that represents the United States Army, Navy, Air Force, Marine Corps, Space Force or Coast Guard, a POW-MIA flag, and a first responder flag. A first responder flag may incorporate the design of another listed flag. The statute lists who the flag may honor, including law enforcement officers, firefighters, paramedics, correctional officers, 911 telecommunicators, certain nurses, and others.',
      ],
      quotes: ['flFlagsTwo'],
    },
    {
      heading: 'A freestanding flagpole',
      body: [
        'Separately, an owner may erect a freestanding flagpole up to 20 feet high on any part of the owner’s property. The pole must not block sightlines at intersections and cannot be within or on an easement. From it the owner may fly one official United States flag, plus one other flag permitted by the list, and the second flag must be equal in size to the United States flag or smaller.',
      ],
      quotes: ['flFlagsPole'],
    },
    {
      heading: 'What the board can still require',
      body: [
        'The pole and the display are not exempt from other law. They stay subject to building codes, zoning setbacks and other government rules, including noise and lighting ordinances, and to the setback and location standards in the governing documents. Check a planned flagpole against each of them.',
      ],
      quotes: ['flFlagsLaws'],
    },
    {
      heading: 'Which associations it covers',
      body: [
        'The flag rule is not limited to associations that can lien. It applies to all community development districts and homeowners’ associations, whether or not the association can impose assessments that become a lien on the parcel.',
      ],
      quotes: ['flFlagsApplies'],
    },
    {
      heading: 'If an owner is blocked',
      body: [
        'An owner prevented from using these rights can go to court in the county where the alleged infringement occurred. On a favorable ruling, the court shall enjoin enforcement of any association document or rule that deprives the owner of the right. The statute speaks of rights under subsections (1) and (2), which cover common areas and flags.',
      ],
      quotes: ['flFlagsCourt'],
    },
    {
      heading: 'Access ramps',
      body: [
        'An owner may build an access ramp if a resident or occupant has a medical necessity or disability that requires a ramp for getting in and out. The ramp must be as unobtrusive as possible, designed to blend in as practical, and reasonably sized for its use.',
        'The owner must submit plans to the association in advance. The association may make reasonable requests to modify the design, but only to achieve architectural consistency with the surrounding structures and surfaces.',
      ],
      quotes: ['flRampPlans', 'flRampAffidavit'],
    },
    {
      heading: 'Security signs',
      body: [
        'An owner may display a sign of reasonable size provided by a contractor for security services within 10 feet of any entrance to the home.',
      ],
      quotes: ['flSecuritySign'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We do not describe the rest of § 720.304, including the common area and assembly rights in subsection (1) and the SLAPP protections in subsection (4). We also do not say whether a particular flag, pole or sign in your community qualifies. Your declaration, your local codes and your attorney answer that.',
      ],
    },
  ],
  steps: [
    'Read your covenants and rules for any ban or limit on flags, flagpoles, ramps or signs.',
    'Check each against § 720.304. A rule that prohibits a flag on the list cannot stop an owner from displaying up to two of them.',
    'For a flagpole, check height, sightlines, easements, county or city codes, and the setbacks in your governing documents.',
    'For a ramp, ask for the plans in advance and the physician’s affidavit, and limit design requests to architectural consistency.',
    'Write down the reason for any limit you keep, and apply it the same way to every owner.',
    'Ask your attorney before you fine or threaten an owner over a flag, pole, ramp or sign.',
  ],
  faqs: [
    {
      q: 'Can a Florida HOA ban flags?',
      a: 'Not entirely. Under § 720.304(2)(a), even if a covenant or rule prohibits flags, a homeowner may display up to two listed portable, removable flags in a respectful manner. The list includes the United States flag, the Florida flag, military branch flags, a POW-MIA flag and a first responder flag.',
    },
    {
      q: 'How tall can a flagpole be?',
      a: 'Up to 20 feet high, on any part of the owner’s property, if it does not obstruct sightlines at intersections and is not in or on an easement. It must still follow building codes, zoning setbacks and the setbacks in the governing documents.',
    },
    {
      q: 'Does this apply to associations that cannot place liens?',
      a: 'Yes. Section 720.304(2)(c) says the flag subsection applies to all community development districts and homeowners’ associations, regardless of whether they can impose assessments that may become a lien.',
    },
    {
      q: 'What does an owner need to build an access ramp?',
      a: 'A resident or occupant with a medical necessity or disability that requires a ramp, plans submitted to the association in advance, and an affidavit from a physician. The association may ask for reasonable design changes for architectural consistency.',
    },
    {
      q: 'Can an owner put up a security company sign?',
      a: 'Yes. Section 720.304(6) allows a sign of reasonable size provided by a contractor for security services within 10 feet of any entrance to the home.',
    },
  ],
  related: [
    'texas-hoa-flag-display-rules',
    'florida-hoa-architectural-review-720-3035',
    'florida-hoa-fine-hearing-committee',
    'florida-hoa-presuit-mediation-720-311',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether a flag, pole, ramp or sign qualifies under § 720.304, and it does not enforce your rules for you. Your board decides, and your attorney answers legal questions.',
}
