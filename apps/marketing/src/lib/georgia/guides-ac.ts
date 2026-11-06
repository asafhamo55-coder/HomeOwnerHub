// SEO batch 29: three Georgia guides for board members.
//   1. Condominium fines and suspensions: what 44-3-76 says, including utility shutoffs and the notice it does and does not name.
//   2. A paid-off lien, the payoff statement and release: what 44-3-232(a), (c), (d) say and where the text is silent.
//   3. How a condominium sets and allocates common expense assessments (44-3-80).
// Statute text only through the quote bank (condo*, lien*, stmt*, lapse*, saleStatement), checked word for word by
// georgia-guides.test.ts against the fixtures. Every other sentence restates a quote and adds no rule. Product
// claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-06'

export const GA_CONDO_FINES: Guide = {
  slug: 'georgia-condo-fines-and-suspensions-44-3-76',
  path: '/guides/georgia-condo-fines-and-suspensions-44-3-76',
  title: 'Georgia condominium fines and suspensions: what § 44-3-76 allows',
  metaTitle: 'Georgia condo fines and suspensions',
  description:
    'A Georgia condominium board may fine and suspend only if the condo instruments say so. What 44-3-76 allows, what it forbids and where it is silent on hearings.',
  eyebrow: 'Georgia · Condominiums',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'For a Georgia condominium, Code Section 44-3-76 says the association is empowered to impose and assess fines, and to suspend temporarily voting rights and the right of use of certain common elements, if and to the extent the condominium instruments provide.',
    'The same sentence says no suspension may deny a unit owner or occupants access to the unit or cause a hazardous or unsanitary condition.',
    'Utilities the association provides may be terminated for unpaid assessments only to the extent the instruments provide, and only after final judgments totaling more than $750.00.',
    'The section names notice before an injunction. The text we hold does not describe a hearing before a fine, so check your instruments and ask your attorney. This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Condominium Act, Article 3 of Title 44, Chapter 3. It applies to an association whose community was created as a condominium. Associations under the Property Owners’ Association Act have their own section, covered in our guide on owner compliance and remedies. Check your declaration to see which one you are.',
      ],
    },
    {
      heading: 'The duty to comply, and the rules behind a fine',
      body: [
        'Section 44-3-76 starts with the owner’s side. Owners and occupants comply with the condominium instruments and with reasonable rules that were provided to the unit owners. The text says the rules must be reasonable, adopted under the instruments and provided to the unit owners.',
      ],
      quotes: ['condoComply', 'condoRules'],
    },
    {
      heading: 'Fines and suspensions',
      body: [
        'The power to fine or suspend is conditional. The words “if and to the extent provided in the condominium instruments” mean the declaration or bylaws must grant it. If your instruments are silent, this section does not supply the power on its own, and you should ask your attorney before relying on it.',
        'The text names two kinds of suspension: voting rights and the right to use certain common elements. It describes both as temporary. It does not set a fine amount or a cap.',
      ],
      quotes: ['condoFineAuth'],
    },
    {
      heading: 'A suspended vote',
      body: [
        'The section also says what happens to a suspended vote, again only to the extent the instruments provide. The unit owner’s vote does not count toward a quorum or for any action that needs a vote of the owners. A secretary who counts quorum should know which owners are suspended and under which provision.',
      ],
      quotes: ['condoVoteSuspended'],
    },
    {
      heading: 'Utility services',
      body: [
        'The section covers water, gas, electricity, heat and air conditioning services that the association provides to a unit or unit owner. It allows termination for unpaid assessments only if the instruments provide for it, only subject to the suspension standards and notice requirements imposed on institutional providers, and only after final judgments above a total of $750.00.',
        'After a termination, the text says the services need not be restored until the judgment and the reasonable costs of suspending and restoring are paid. Those costs are an assessment and a lien against the unit.',
      ],
      quotes: ['condoUtility', 'condoUtilityRestore', 'condoUtilityLien'],
    },
    {
      heading: 'Notice, and what the text does not say',
      body: [
        'The only notice period the section states is tied to an injunction. The association gives the notice its instruments call for, or ten days’ written notice if they are silent. The same sentence has exceptions for danger to life, person or property, and for cases that would become moot.',
        'We do not find in this section a hearing requirement for a fine, a deadline to pay one, or a rule on how a fine is collected. Those may sit in your instruments or elsewhere in the law. Our guide on fines and violation hearings covers the process side, and your attorney can say what your documents require.',
      ],
      quotes: ['condoInjunct'],
    },
  ],
  steps: [
    'Find the clause in your condominium instruments that authorizes fines and suspensions, and read what it requires first.',
    'Confirm the rule being enforced was adopted under the instruments and provided to every unit owner.',
    'Send the notice and give any hearing your instruments call for. If they are silent and you plan to seek an injunction, send ten days’ written notice.',
    'Never suspend access to a unit, and never use a suspension that could cause a hazardous or unsanitary condition.',
    'Record which owners have a suspended vote so the quorum count is right.',
    'Talk to your attorney before you terminate any utility service or file for a judgment.',
  ],
  faqs: [
    {
      q: 'Can a Georgia condominium association fine an owner?',
      a: 'Section 44-3-76 says the association is empowered to impose and assess fines if and to the extent the condominium instruments provide. If your instruments do not, ask your attorney.',
    },
    {
      q: 'Can a condo board cut off an owner’s access to their unit?',
      a: 'No. The section says no suspension shall deny any unit owner or occupants access to the unit owned or occupied.',
    },
    {
      q: 'Can a condo association shut off an owner’s water for unpaid assessments?',
      a: 'Only to the extent the instruments provide, subject to the provider notice standards, and only after final judgments in excess of a total of $750.00. Ask your attorney before acting.',
    },
    {
      q: 'Does the section require a hearing before a fine?',
      a: 'The text we hold does not describe one. Your instruments may, so read them and ask your attorney.',
    },
    {
      q: 'Does a suspended owner count toward a quorum?',
      a: 'To the extent the instruments provide, a suspended owner’s vote does not count for establishing a quorum or taking an action that requires a vote of the owners.',
    },
  ],
  related: [
    'condo-vs-hoa-law',
    'fines-and-violation-hearings',
    'georgia-hoa-owner-compliance-and-remedies-44-3-223',
    'georgia-hoa-assessment-lien-rules',
    'violation-notice-checklist',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide whether your instruments allow a fine or suspension, hold hearings or shut off services. Your attorney answers legal questions about enforcement.',
}

export const GA_LIEN_PAYOFF: Guide = {
  slug: 'georgia-hoa-lien-paid-off-payoff-statement-and-release-44-3-232',
  path: '/guides/georgia-hoa-lien-paid-off-payoff-statement-and-release-44-3-232',
  title: 'Georgia HOA lien paid off: payoff statement, release and timing (§ 44-3-232)',
  metaTitle: 'Georgia HOA lien payoff statement and release',
  description:
    'What Georgia 44-3-232 says about the lien, the statement a buyer or lender can request, the five business days and the $10 fee, and its silence on a release.',
  eyebrow: 'Georgia · Assessment lien',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under § 44-3-232(a), the recording of the declaration is record notice of the lien, and no further recordation of any claim of lien for assessments is required.',
    'Under subsection (d), an owner, a mortgagee, a contract purchaser or a lender can request a written statement of the assessments past due, with late charges and interest. The association has five business days to furnish it, and the statement binds the association and every lot owner.',
    'The text allows a fee not exceeding $10.00 if the instrument provides. It does not use the words payoff letter, release or lien certificate, and we do not find a release procedure in it.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page is about the Georgia Property Owners’ Association Act, Article 6 of Title 44, Chapter 3, which uses the words lot and lot owner. A condominium association is under the Condominium Act instead, and its statement of amounts due is in Code Section 44-3-109. Check your declaration to see which Act you are under. Our guide on condominium fines and suspensions covers the condo side of enforcement.',
      ],
    },
    {
      heading: 'What the lien is, and how it is noticed',
      body: [
        'Georgia’s assessment lien arises by statute. Our guide on assessment lien rules covers its contents. For payoff questions, the notable point is that the text does not require a separate recorded claim of lien.',
      ],
      quotes: ['lienRecordNotice'],
    },
    {
      heading: 'The statement of amounts due',
      body: [
        'Boards, closing attorneys and title companies often say payoff letter or estoppel letter. The statute calls the document a statement. Four kinds of people are entitled to ask for it, and the content is the assessments past due with late charges and interest for that lot.',
        'The request has to be in writing, delivered to the registered office of the association, and say where to send the statement. A board should know where its registered office mail goes and who opens it.',
      ],
      quotes: ['stmtRight', 'stmtWriting'],
    },
    {
      heading: 'Timing: five business days',
      body: [
        'The deadline is five business days from receipt. The text spells out what a missed deadline does, and only as to the title or interest acquired by the purchaser or lender in the transaction the request was made for. The text ties that result to the purchaser or lender in the transaction the request was made for, and we do not read it as erasing what the owner owes. Ask your attorney about any request that is close to the deadline.',
      ],
      quotes: ['stmtFiveDays'],
    },
    {
      heading: 'Binding statement and the fee',
      body: [
        'The statement binds the association and every lot owner, so a board should check the figures before it goes out. The fee is permitted only if the instrument so provides, and the cap is stated in the text. The text does not address other charges a management company may add, so ask your attorney before billing more.',
      ],
      quotes: ['stmtBinding', 'stmtFee'],
    },
    {
      heading: 'What a buyer can rely on',
      body: [
        'Section 44-3-225(c) ties to the statement. Unless the instrument provides otherwise, a grantee is jointly and severally liable with the grantor for unpaid assessments up to the conveyance. If the grantor or grantee requests the statement, the grantee is not liable for, and the lot is not subject to a lien for, unpaid assessments against the grantor above the amount in the statement. Our guide on unpaid assessments when a lot is sold covers that section.',
      ],
      quotes: ['saleStatement'],
    },
    {
      heading: 'How long the lien lasts',
      body: [
        'The lien lapses by the passage of time. The text in force until December 31, 2026 says four years. The revised text from January 1, 2027, under Senate Bill 406, says six years. The text we hold has no transition rule for assessments that came due before 2027, so ask your attorney which period applies to an older assessment.',
      ],
      quotes: ['lapse2026', 'lapse2027'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'The text we hold has no provision on releasing or canceling a lien after payment, on a form of release, or on who records anything. Because the declaration itself gives record notice, we do not say whether a release document is needed or customary. Ask your attorney or the closing attorney before you promise one.',
      ],
    },
  ],
  steps: [
    'Receive the request in writing at the registered office and log the date and time of receipt.',
    'Count five business days from receipt and put the deadline on the calendar.',
    'Compute past due assessments, late charges and interest for that lot only.',
    'Check the instrument before charging a fee, and keep it at $10.00 or less.',
    'Send the statement to the address in the request and keep proof of delivery.',
    'Ask your attorney before you agree to sign or record any release.',
  ],
  faqs: [
    {
      q: 'Who can ask a Georgia HOA for a statement of amounts due?',
      a: 'A lot owner, a mortgagee of a lot, a person who has signed a contract to buy the lot, or a lender considering a loan secured by the lot.',
    },
    {
      q: 'How long does the HOA have to respond?',
      a: 'Five business days from receipt of a written request delivered to the registered office, under § 44-3-232(d).',
    },
    {
      q: 'Can the HOA charge for the statement?',
      a: 'A fee not exceeding $10.00 may be required if the instrument so provides. The text does not address other fees.',
    },
    {
      q: 'Does the statute say how to release a lien after payment?',
      a: 'Not in the text we hold. Ask your attorney or the closing attorney what is needed.',
    },
    {
      q: 'Does the lien have to be recorded?',
      a: 'Section 44-3-232(a) says the recording of the declaration is record notice and no further recordation of any claim of lien for assessments is required.',
    },
  ],
  related: [
    'georgia-hoa-estoppel-letter-resale',
    'georgia-hoa-assessment-lien-rules',
    'georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225',
    'georgia-hoa-lien-priority-taxes-and-mortgages-44-3-232',
    'certified-mail-collections-notices',
    'georgia-condo-fines-and-suspensions-44-3-76',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not issue payoff statements, record or release liens or search title. Your attorney answers legal questions about a lien.',
}

export const GA_CONDO_EXPENSES: Guide = {
  slug: 'georgia-condo-common-expense-assessments-44-3-80',
  path: '/guides/georgia-condo-common-expense-assessments-44-3-80',
  title: 'How a Georgia condominium assesses common expenses (§ 44-3-80)',
  metaTitle: 'Georgia condo common expense assessments',
  description:
    'How Georgia 44-3-80 divides condominium common expenses: limited common elements, expenses for some units, the declaration formula and no exemptions.',
  eyebrow: 'Georgia · Condominiums',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under Code Section 44-3-80, expenses for a limited common element are specially assessed to the unit it was assigned to, unless the condominium instruments provide otherwise.',
    'Other expenses that benefit fewer than all units may be assessed to those units, but only to the extent the instruments expressly so provide.',
    'The remaining common expenses are assessed according to the allocation in the declaration, which may be a percentage, fraction, formula or other method. The association makes the assessments annually or more often if the instruments so provide.',
    'This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'Which law this is',
      body: [
        'This page covers the Georgia Condominium Act. A community governed by the Property Owners’ Association Act has a parallel section, covered in our guide on charging some lots and not all. Check your declaration to see which Act applies.',
      ],
    },
    {
      heading: 'Limited common elements',
      body: [
        'A limited common element is a part of the common elements assigned to some units. Subsection (a) is the default for the cost of maintaining it, and the instruments can provide otherwise. A board should read the declaration before it charges a single unit.',
      ],
      quotes: ['condoLimitedCE'],
    },
    {
      heading: 'Expenses that benefit only some units',
      body: [
        'Subsection (b) lists other special assessments, and each applies only to the extent the instruments expressly so provide. One example is expenses benefiting less than all of the units. Another covers expenses caused by the conduct of an occupant, licensee or invitee. The full subsection also has a third paragraph and a fourth that limits special allocation of periodic maintenance, which we do not quote here.',
      ],
      quotes: ['condoBenefitLess1'],
    },
    {
      heading: 'Everything else follows the declaration',
      body: [
        'Subsection (c) covers the rest of the common expenses. They are assessed according to the allocation set out in the declaration, and the text lets the declaration choose any method that shows relative liabilities.',
        'The text says assessments are made annually or more often if the instruments so provide, and are payable in the manner the association decides. It does not say here when the budget must be given to owners, so check your instruments and ask your attorney.',
      ],
      quotes: ['condoRemainder', 'condoMethod', 'condoAssessAnnual'],
    },
    {
      heading: 'Changing the allocation, and equal charges',
      body: [
        'The allocations generally do not change except as the Act expressly provides or permits, and a reallocation does not reach an assessment already due. The text separately lets the association levy equal charges for services or items provided to owners on request or giving uniform benefit, such as pool keys.',
      ],
      quotes: ['condoAllocFixed', 'condoUniform'],
    },
    {
      heading: 'No exemption for nonuse',
      body: [
        'Once the first common expense assessment is due from a unit owner, the text says no unit owner other than the association is exempt from any assessment for any reason whatsoever. The words include abandonment, nonuse and waiver of use.',
        'Special assessments are capped separately for newer condominium instruments. Our guide on special assessments covers section 44-3-80(g).',
      ],
      quotes: ['condoNoExempt'],
    },
  ],
  steps: [
    'Read the allocation clause in the declaration and write down the formula in plain words.',
    'Check which expenses your declaration treats as limited common element costs.',
    'Before you assess one unit separately, find the clause that expressly allows it.',
    'Put the assessment in writing for the year, with the due dates the association chose.',
    'Do not excuse a unit from assessments because the owner does not use a facility.',
    'Ask your attorney before you change an allocation or charge a unit separately.',
  ],
  faqs: [
    {
      q: 'How are condominium common expenses divided in Georgia?',
      a: 'Under § 44-3-80(c), the remaining common expenses are assessed in accordance with the allocation in the declaration, which may use a percentage, fraction, formula or another method.',
    },
    {
      q: 'Who pays to maintain a limited common element?',
      a: 'Unless the instruments provide otherwise, the unit to which the element was assigned. Check your declaration.',
    },
    {
      q: 'How often does the association assess?',
      a: 'The text says annually or more often if the condominium instruments so provide.',
    },
    {
      q: 'Can an owner skip assessments by not using the pool?',
      a: 'The text says no unit owner other than the association is exempt for any reason whatsoever, including nonuse.',
    },
    {
      q: 'Can the board change the allocation?',
      a: 'The text says allocations shall not be altered except as the Act expressly provides or permits. Ask your attorney.',
    },
  ],
  related: [
    'condo-vs-hoa-law',
    'special-assessments',
    'georgia-hoa-charging-some-lots-not-all-44-3-225',
    'georgia-hoa-reserve-fund-and-reserve-study',
    'hoa-treasurer-duties',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not decide how your declaration allocates expenses or whether a charge is allowed. Your attorney answers legal questions about assessments.',
}
