// SEO batch 14, two collections guides.
//
// 1. Texas: Tex. Prop. Code § 209.0064, the certified-mail notice before a
//    collection agent's fees can be charged. Statute text: tx-prop-209-2026.txt
//    (txColl* quotes) plus the existing txPlan* and txPrio* quotes from
//    tx-prop-209-0062-2026.txt. Product claim: the Texas collections letter,
//    which STATE_COVERAGE lists, and the generic Payment plans page. Nothing
//    claims mail tracking for Texas: the certified-mail record is Georgia only.
// 2. California: Civ. Code §§ 5650 to 5665, the pre-lien notice. Statute text:
//    ca-civ-davis-stirling-2026.txt (caColl* quotes). Caveats kept from
//    docs/research/2026-10-ca-rules-verification.md: the text is the
//    Legislative Counsel's bulk data (leginfo pages block scripts), California
//    letters cite sections but the page does not claim they quote the statute,
//    and the app encodes no IDR or ADR step.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const TX_COLLECTIONS: Guide = {
  slug: 'texas-hoa-third-party-collections-notice',
  path: '/guides/texas-hoa-third-party-collections-notice',
  state: 'TX',
  title: 'Texas HOA notice before collections: what Property Code 209.0064 requires',
  metaTitle: 'Texas HOA notice before collections',
  description:
    'Tex. Prop. Code 209.0064 requires a certified-mail notice and a 45-day cure period before an owner owes a collection agent’s fees. Quoted.',
  eyebrow: 'Texas · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In a Texas property owners’ association, an owner is not held liable for a collection agent’s fees unless the association first sends a written notice by certified mail. Section 209.0064(b) lists what it must say.',
    'The notice states each delinquent amount and the total needed to bring the account current, describes the owner’s options including a payment plan, and gives at least 45 days to cure before further collection action.',
    'The section also limits what the association can agree with its collection agent, and what an owner can still do while the account is with that agent.',
    'This is a plain-language guide to the statute text we hold, not legal advice. Your attorney decides how it applies to your dedicatory instruments.',
  ],
  sections: [
    {
      heading: 'Who the section is about',
      body: [
        'Section 209.0064 uses the federal definition of a debt collector. In practice it covers the point where a board hands a delinquent account to a collection company or a firm collecting debts.',
        'It sits in Chapter 209, which applies to residential subdivisions with mandatory property owners’ association membership. Condominiums are governed by a different chapter, so ask your attorney if you are one.',
      ],
      quotes: ['txCollAgent'],
    },
    {
      heading: 'The certified-mail notice comes first',
      body: [
        'The statute does not forbid hiring a collection agent. It ties the owner’s liability for the agent’s fees to a notice sent first, and it names the delivery method: certified mail.',
        'Keep the mailing receipt and the tracking record with the owner’s account. The statute quoted here says certified mail and does not say how the 45 days are counted, so ask your attorney which date your board should treat as the start.',
      ],
      quotes: ['txCollNotice'],
    },
    {
      heading: 'What the notice has to contain',
      body: [
        'Three things, in the statute’s order. First, each delinquent amount and the total payment required to make the account current.',
        'Second, the options the owner has to avoid having the account turned over, including whether a payment plan is available. This applies if the association is subject to § 209.0062 or its documents require offering a plan.',
        'Third, a cure period of at least 45 days before further collection action is taken.',
      ],
      quotes: ['txCollAmounts', 'txCollOptions', 'txCollCure'],
    },
    {
      heading: 'Payment plans and the 45 days',
      body: [
        'Section 209.0062 sets the payment plan rules: a minimum term of three months, and no duty to offer a plan that runs past 18 months. Our Texas payment plans guide covers them in full.',
        'The two sections meet at the cure period. The association does not have to offer a plan after the § 209.0064(b)(3) period expires. A board that wants to offer one should put the option in the notice and answer a request while the period is still running.',
      ],
      quotes: ['txPlanMinTerm', 'txPlanMax', 'txPlanCure'],
    },
    {
      heading: 'Fee rules the section adds',
      body: [
        'An owner is not liable for the agent’s fees if the association’s obligation to pay the agent depends on what is recovered, or if the agreement does not require the association to pay all the agent’s fees for the work done. Read the collection agreement against both tests before you sign it.',
        'The agreement also cannot stop the owner from contacting the board or the managing agent about the debt, and the association cannot sell its accounts receivable except as collateral for a loan.',
      ],
      quotes: ['txCollContingent', 'txCollAgreement', 'txCollContact', 'txCollReceivables'],
    },
    {
      heading: 'Where fees fall in the payment order',
      body: [
        'When a payment arrives, § 209.0063 sets the order. Assessments come first, then reasonable attorney’s fees or third-party collection costs tied to assessments. Fines come later in the list.',
        'While a plan is running, the statute says no additional monetary penalties accrue, and it excludes reasonable plan administration costs and interest from that term.',
      ],
      quotes: ['txPrio3', 'txPlanPenalty'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of § 209.0064, § 209.0062 and § 209.0063. We do not hold the rest of Chapter 209, so this page says nothing about the notice and hearing steps before a foreclosure, or about liens. Your attorney should cover those.',
        'We cannot tell you what your declaration adds, whether your fees are reasonable, or how to count the 45 days. The statute is amended from time to time, so check the current text before you send.',
      ],
    },
  ],
  steps: [
    'Confirm the account is past due and list each delinquent amount from the ledger, by type.',
    'Work out the total payment that brings the account current.',
    'Write the options the owner has, including your payment plan terms if § 209.0062 or your documents require one.',
    'Set a cure date at least 45 days after the notice goes out, and have your attorney confirm how your board counts it.',
    'Send the notice by certified mail and save the receipt and tracking record.',
    'Read the collection agent’s agreement against the contingency and full-fee tests in § 209.0064(c).',
    'Answer any payment plan request before the cure period ends, and calendar the date.',
    'If the account is still unpaid after the cure date, ask your attorney before the next step.',
  ],
  faqs: [
    {
      q: 'Does a Texas HOA have to send a notice before using a collection agent?',
      a: 'It must before it can hold an owner liable for the agent’s fees. The notice goes by certified mail and must meet the three points in § 209.0064(b).',
    },
    {
      q: 'How long must the owner have to cure?',
      a: 'At least 45 days before further collection action is taken, under § 209.0064(b)(3).',
    },
    {
      q: 'Does the notice have to offer a payment plan?',
      a: 'It must describe the options to avoid turnover, including whether a payment plan is available, if the association is subject to § 209.0062 or its documents require offering one.',
    },
    {
      q: 'Can an owner still talk to the board once the account is with an agent?',
      a: 'Yes. The agreement between the association and the agent may not prohibit the owner from contacting the board or the managing agent about the delinquency.',
    },
    {
      q: 'Is the owner liable if the agent is paid only from what it collects?',
      a: 'The statute says an owner is not liable for the agent’s fees if the association’s payment obligation is in any way dependent or contingent on amounts recovered.',
    },
  ],
  related: ['texas-hoa-payment-plans-and-payment-priority', 'texas-hoa-payment-plan-agreement', 'texas-hoa-violation-notice-and-hearing-209-006', 'texas-hoa-management-certificate', 'texas-hoa-resale-certificate-chapter-207', 'certified-mail-collections-notices', 'florida-hoa-notice-of-intent-to-lien', 'california-hoa-pre-lien-notice-and-collections'],
  hoaDoes: [
    {
      text: 'For Texas, the collections letter is the delinquency notice under § 209.0064, with at least 45 days to cure and payment-plan options. It waits in Approvals, and nothing is emailed. You print it and mail it yourself.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
    {
      text: 'Accounting has a Payment plans page. A plan moves to Completed on its own when every installment is paid, waived or written off, and the board can see which plans are behind.',
      route: '/accounting/payment-plans',
      release: '2026-10-18-0810-plans-recurring-vendors',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not send certified mail, track the mailing for Texas letters, choose a collection agent or review your agreement with one. The certified-mail record is for Georgia letters only.',
}

export const CA_COLLECTIONS: Guide = {
  slug: 'california-hoa-pre-lien-notice-and-collections',
  path: '/guides/california-hoa-pre-lien-notice-and-collections',
  state: 'CA',
  title: 'California HOA pre-lien notice and collections: what Civil Code 5650 to 5665 require',
  metaTitle: 'California HOA pre-lien notice rules',
  description:
    'California Civil Code 5660 requires a certified-mail notice 30 days before an HOA records a lien. What it says, the caps and payment plans.',
  eyebrow: 'California · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under the Davis-Stirling Act, assessments become delinquent 15 days after they are due. The association may then recover collection costs, a capped late charge and capped interest.',
    'Before recording a lien, the association must notify the owner of record in writing by certified mail, at least 30 days ahead. Section 5660 lists six items the notice must contain, including a boldface warning about foreclosure.',
    'The owner can ask to meet the board about a payment plan under § 5665, and has dispute resolution rights that the notice must describe.',
    'This is a plain-language guide to current statute text, not legal advice. Your attorney decides how it applies to your documents.',
  ],
  sections: [
    {
      heading: 'When an assessment is delinquent',
      body: [
        'Regular and special assessments are delinquent 15 days after they come due, unless the declaration gives a longer period. Everything in the sections below starts from that point.',
        'The assessment and the late charges, collection costs, attorney’s fees and interest are a debt of the owner at the time they are levied.',
      ],
      quotes: ['caCollDelinquent'],
    },
    {
      heading: 'What the association can add: costs, late charge and interest',
      body: [
        'Once an assessment is delinquent, the association may recover three things. Each has a cap or a test, and the declaration can set a lower number.',
      ],
      list: [
        'Reasonable collection costs, including reasonable attorney’s fees.',
        'A late charge of the greater of 10 percent of the delinquent assessment or $10, unless the declaration sets a smaller amount.',
        'Interest at no more than 12 percent a year, starting 30 days after the assessment came due, unless the declaration sets a lower rate.',
      ],
      quotes: ['caCollCosts', 'caCollLate', 'caCollInterest'],
    },
    {
      heading: 'The certified-mail notice before a lien',
      body: [
        'Section 5660 sets the clock and the method. The association must notify the owner of record in writing by certified mail at least 30 days before recording a lien for a debt that is past due under § 5650.',
        'The statute says “at least 30 days prior to recording.” Keep the certified-mail receipt and record the date the lien is eventually recorded, so the gap is easy to show. Ask your attorney how your board should count it.',
      ],
      quotes: ['caCollNotice'],
    },
    {
      heading: 'What the notice must say',
      body: [
        'The first item is a description of the association’s collection and lien procedures and how the amount is calculated, a statement of the owner’s right to inspect association records, and a warning in 14-point boldface type if printed, or capital letters if typed.',
        'The second is an itemized statement: delinquent assessments, collection costs, attorney’s fees, late charges and interest, each shown. The third is a statement that the owner does not owe the charges if the assessment was in fact paid on time.',
      ],
      quotes: ['caCollDescription'],
    },
    {
      heading: 'The owner’s rights the notice must describe',
      body: [
        'The last three items are rights: to ask for a meeting with the board, to dispute the debt through the association’s meet and confer program, and to ask for alternative dispute resolution with a neutral third party before the association starts foreclosure.',
        'The meet and confer program is the internal dispute resolution process covered in our California guide to Civil Code 5900 to 5920. The notice only needs to tell the owner the right exists.',
      ],
      quotes: ['caCollMeeting', 'caCollAdr'],
    },
    {
      heading: 'Payment plans under § 5665',
      body: [
        'An owner may ask in writing to meet with the board about a payment plan for the debt noticed under § 5660. The association has to give the owner its payment plan standards, if it has any.',
        'The board meets the owner in executive session within a set window, unless no regular board meeting falls in it. A plan may include assessments that accrue during the plan, and no more late fees accrue while the owner keeps to the plan. A plan does not stop the association from recording a lien, and on default the association may resume where it left off.',
      ],
      quotes: ['caCollPlanStandards', 'caCollPlanMeeting', 'caCollPlanLien'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of §§ 5650, 5655, 5658, 5660 and 5665. The statute text comes from the Legislative Counsel’s published database, which is the same text the state’s website serves. We do not hold the sections on recording and foreclosing a lien, so this page stops at the notice.',
        'We cannot tell you what your declaration adds, whether a late charge or interest rate in your documents is lower than the cap, or what your attorney needs on the notice. Statutes change, often in January, so check the current section before you send.',
      ],
    },
  ],
  steps: [
    'Confirm the assessment is delinquent: 15 days after the due date, or the longer period in your declaration.',
    'Add up the charges by type: assessments, collection costs, attorney’s fees, late charges and interest, each within the caps and your declaration.',
    'Draft the notice with every item in § 5660(a) to (f), including the boldface or capital-letter warning.',
    'Send the notice by certified mail and keep the receipt.',
    'Calendar 30 days from the mailing. Do not record a lien before then.',
    'If the owner asks to meet about a payment plan, schedule the executive session within the statute’s window.',
    'Ask your attorney before recording a lien or starting foreclosure.',
  ],
  faqs: [
    {
      q: 'How much notice must a California HOA give before recording a lien?',
      a: 'At least 30 days, in writing, by certified mail to the owner of record, under Civil Code § 5660.',
    },
    {
      q: 'What is the maximum late charge?',
      a: 'Under § 5650(b)(2), not more than 10 percent of the delinquent assessment or $10, whichever is greater, unless the declaration sets a smaller late charge. Your declaration may set a lower number.',
    },
    {
      q: 'What is the maximum interest rate?',
      a: 'Not more than 12 percent a year, starting 30 days after the assessment came due, unless the declaration sets a lower rate.',
    },
    {
      q: 'Does a payment plan stop a lien?',
      a: 'No. Section 5665(d) says payment plans do not impede the association’s ability to record a lien to secure payment of delinquent assessments.',
    },
    {
      q: 'Can the owner dispute the debt?',
      a: 'The notice must tell the owner of the right to request dispute resolution through the association’s meet and confer program, and to request alternative dispute resolution before foreclosure.',
    },
  ],
  related: ['california-hoa-internal-dispute-resolution', 'california-hoa-fine-hearing-and-penalty-rules', 'florida-hoa-notice-of-intent-to-lien', 'texas-hoa-third-party-collections-notice', 'florida-hoa-estoppel-certificate-rules', 'texas-hoa-resale-certificate-chapter-207'],
  hoaDoes: [
    {
      text: 'For California, the collections letter is the pre-lien notice under § 5660, including the required “IMPORTANT NOTICE” text. It can be drafted only once the assessment is delinquent, which is 15 days after it was due. It waits in Approvals, and nothing is emailed.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not send certified mail, track the 30 days, handle a payment plan meeting request under § 5665 or run a dispute resolution request. California letters cite the sections and do not quote the statute.',
}
