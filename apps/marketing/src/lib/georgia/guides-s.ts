// SEO batch 19: Florida assessment lien and foreclosure timeline.
// Statute text only through the quote bank (flLien*), checked word for word by
// georgia-guides.test.ts. Every other sentence restates a quote and adds no
// deadline of its own. The statute counts the first 45 days from mailing in
// (4)(a) and the form counts them from receipt, so the page quotes both and
// does not pick one. Chapter 720 only, not condominiums.
// Product claim: the Florida collections letters in STATE_COVERAGE (release
// 2026-10-19-1759-collections-letters): the late-assessment notice and the
// 45-day notice of intent to lien. The app drafts no foreclosure notice and
// does not track certified mail for Florida (certified-mail tracking is
// Georgia only), and the page says so.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_LIEN_TIMELINE: Guide = {
  slug: 'florida-hoa-assessment-lien-and-foreclosure-timeline',
  path: '/guides/florida-hoa-assessment-lien-and-foreclosure-timeline',
  state: 'FL',
  title: 'Florida HOA assessment lien and foreclosure timeline',
  metaTitle: 'Florida HOA lien and foreclosure timeline',
  description:
    'Fla. Stat. 720.3085 in order: interest, the late fee cap, how payments are applied, the 45-day notice before a lien and the second notice before foreclosure.',
  eyebrow: 'Florida · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.3085 of the Florida Homeowners’ Association Act sets a sequence for collecting unpaid assessments. Interest and an optional late fee come first. A written notice of late assessment comes before attorney fees. A written demand with 45 days to pay comes before a lien. A second notice and a second 45 days come before a foreclosure action.',
    'The section covers homeowners’ associations under chapter 720, not condominiums. This is a plain-language guide to the text we hold, not legal advice. Your attorney decides how it applies to a particular account.',
  ],
  sections: [
    {
      heading: 'Step 1: interest from the due date',
      body: [
        'Unpaid assessments and installments bear interest from the due date until paid. The rate comes from your declaration or bylaws, and it can never be more than the law allows. If your documents set no rate, read the statute and ask your attorney before you charge interest.',
      ],
      quotes: ['flLienInterest'],
    },
    {
      heading: 'Step 2: the administrative late fee',
      body: [
        'A late fee is allowed only if the declaration or bylaws provide for it, and then only up to a cap. The cap applies to each installment that is paid past its due date. It is a separate item from interest, and the notice lists it separately.',
      ],
      quotes: ['flLienLateFee'],
    },
    {
      heading: 'Step 3: where a payment goes',
      body: [
        'When money comes in and is accepted, the statute fixes the order it is applied. Interest and the late fee are cleared before collection costs and fees, and the assessment itself is last. A partial payment can therefore leave the oldest assessment still open.',
      ],
      quotes: ['flLienApply'],
    },
    {
      heading: 'Step 4: the notice of late assessment',
      body: [
        'Before the association can require payment of attorney fees for a past due assessment, it must deliver a written notice of late assessment. The notice states the amount owed and gives the owner a chance to pay without attorney fees being assessed.',
      ],
      quotes: ['flLienLateNotice'],
    },
    {
      heading: 'Step 5: the demand and the first 45 days',
      body: [
        'The association may not file a record of lien for unpaid assessments unless it has first made a written notice or demand for the past due amounts. The owner then has 45 days to pay everything due, including the attorney fees and costs of the demand.',
        'The statute counts the 45 days from the date the notice is deposited in the mail. The wording of the statute’s own form counts them from receipt. The two are quoted below, and this guide does not choose between them. Ask your attorney which date your board will use, and write it on the calendar.',
      ],
      quotes: ['flLienDemand', 'flLien45', 'flLienFormIntent'],
    },
    {
      heading: 'How the notice is sent',
      body: [
        'The demand goes by registered or certified mail, return receipt requested, and also by first-class mail. Keep the receipts and the mailing record together with the notice.',
      ],
      quotes: ['flLienMail'],
    },
    {
      heading: 'Step 6: the second notice before foreclosure',
      body: [
        'A lien is not a foreclosure. Before the association brings an action to foreclose, the owner must be given a second notice of the association’s intent to foreclose, and a further 45 days must pass.',
        'The second notice follows the same mailing rules as the first, and it cannot be given until the first 45 days are over. That means two waits, one after the other.',
      ],
      quotes: ['flLienForeclose', 'flLienSecondNotice'],
    },
    {
      heading: 'When the clock does not apply',
      body: [
        'The time limits in this subsection do not apply in two situations, listed below. If either one may apply to your account, take it to your attorney before you act.',
      ],
      quotes: ['flLienExcept'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only. We say nothing about the contents of a claim of lien, how long a lien lasts, or the rules for condominiums. We give no rate, fee or deadline of our own. Check the current text before the board relies on a date.',
      ],
    },
  ],
  steps: [
    'Read your declaration and bylaws for the interest rate and any late fee. Confirm the late fee is within the statute’s cap.',
    'Set up the ledger so every payment is applied in the statute’s order: interest, late fee, costs and attorney fees, then the assessment.',
    'Deliver the written notice of late assessment before any attorney fees are charged to the owner. Keep proof of delivery.',
    'Send the 45-day notice of intent to lien by certified mail, return receipt requested, and by first-class mail. Calendar the end of the 45 days with your attorney.',
    'Record a claim of lien only after the demand has been made and the 45 days have run, on your attorney’s advice.',
    'Before any foreclosure action, give the second notice by the same mailing methods and calendar a further 45 days.',
  ],
  faqs: [
    {
      q: 'How long must a Florida HOA wait before recording a lien?',
      a: 'The owner gets 45 days to pay after a written demand. Section 720.3085(4)(a) counts the days from the date the notice is deposited in the mail, and the statute’s form refers to receipt. Ask your attorney which date to use.',
    },
    {
      q: 'Can a Florida HOA charge a late fee?',
      a: 'Only if the declaration or bylaws provide for it, and then not more than the greater of $25 or 5 percent of each installment paid past its due date, under § 720.3085(3)(a).',
    },
    {
      q: 'In what order are payments applied?',
      a: 'First to interest, then to any administrative late fee, then to costs and reasonable attorney fees, and then to the delinquent assessment, under § 720.3085(3)(b).',
    },
    {
      q: 'Is there a second notice before foreclosure?',
      a: 'Yes. An action to foreclose may not be brought until 45 days after the owner has been given notice of intent to foreclose, and that notice cannot be given until the first 45 days have passed.',
    },
    {
      q: 'Can attorney fees be charged right away?',
      a: 'Not for a past due assessment until the association has delivered a written notice of late assessment that gives the owner a chance to pay without attorney fees, under § 720.3085(3)(d).',
    },
  ],
  related: [
    'florida-hoa-notice-of-intent-to-lien',
    'florida-hoa-estoppel-certificate-rules',
    'florida-hoa-fine-hearing-committee',
    'certified-mail-collections-notices',
  ],
  hoaDoes: [
    {
      text: 'For Florida, the collections letters are the Notice of Late Assessment (§ 720.3085(3)(d)) and the 45-day Notice of Intent to Record a Lien (§ 720.3085(4)), using the statute’s own wording. The intent letter can be drafted only once a late notice was recorded at least 30 days earlier.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
    {
      text: 'Letters wait in Approvals, and nothing is emailed. You print and mail them yourself.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
  ],
  hoaDoesNot:
    'HomeownerHub does not draft the second notice before foreclosure, record a lien, track certified mail for Florida letters or decide which date starts a 45-day count. Keep your own calendar and your mailing receipts.',
}
