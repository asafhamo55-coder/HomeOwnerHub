// SEO batch 14, Florida template: the pre-lien notice of intent.
// Statute text: Fla. Stat. § 720.3085 from flsenate-ch720-2026.html, through
// the flLien* quotes. The fill-in follows the form printed in
// § 720.3085(4)(a). Product claim: the Florida collections letters in
// STATE_COVERAGE (release 2026-10-19-1759-collections-letters). Chapter 720
// only. Nothing claims mail tracking for Florida; that is Georgia only.

import type { Checklist } from './checklists'

export const FL_LIEN_NOTICE: Checklist = {
  slug: 'florida-hoa-notice-of-intent-to-lien',
  path: '/templates/florida-hoa-notice-of-intent-to-lien',
  title: 'Florida HOA notice of intent to record a claim of lien',
  metaTitle: 'Florida HOA notice of intent to lien',
  description:
    'A free, printable checklist and fill-in 45-day notice of intent to record a claim of lien for a Florida HOA, from Fla. Stat. 720.3085(4).',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when a Florida homeowners’ association plans to record a claim of lien for unpaid assessments. Each field below is tagged: statute means the quoted Florida text calls for it, practice means it is our suggestion.',
    'The quoted text is Fla. Stat. § 720.3085, which covers homeowners’ associations under Chapter 720. Condominiums are governed by a different chapter. This is not legal advice, and your attorney should read the final notice before it goes out.',
  ],
  items: [
    { text: 'Confirm the account is past due and the amounts match the ledger.', detail: 'List maintenance, late fee, interest, certified mail charges and other costs separately.', basis: 'practice' },
    { text: 'Check that a written notice or demand for the past due amounts has been made before any lien is filed.', detail: 'The statute bars a record of lien unless this notice or demand has been made.', basis: 'statute' },
    { text: 'Give the owner 45 days from the date the notice is deposited in the mail to pay everything due.', detail: 'That includes attorney’s fees and the actual costs of preparing and delivering the demand.', basis: 'statute' },
    { text: 'Use the statute’s form, or one substantially like it, headed “Notice of intent to record a claim of lien.”', basis: 'statute' },
    { text: 'Fill in the parcel, the association’s name and each amount: maintenance, late fee, interest through a date, certified mail charges, other costs and the total.', basis: 'statute' },
    { text: 'State the interest rate that applies.', detail: 'Interest runs at the rate in the declaration or bylaws, or 18 percent simple if none is set. Compound interest may not accrue.', basis: 'statute' },
    { text: 'If the declaration or bylaws allow an administrative late fee, check it is within the greater of $25 or 5 percent of the installment.', basis: 'statute' },
    { text: 'Send it by registered or certified mail, return receipt requested, and also by first-class mail.', basis: 'statute' },
    { text: 'Address it to the owner at the last address in the association’s records.', detail: 'If that is not the parcel address, send a copy to the parcel address too.', basis: 'statute' },
    { text: 'If the owner’s address in the records is outside the United States, send to that address and to the parcel address by first-class mail.', basis: 'statute' },
    { text: 'Save the receipt, the return receipt and a copy of what was sent.', basis: 'practice' },
    { text: 'Put the day 45 on the calendar. Do not record the claim of lien before it passes.', detail: 'The form says no sooner than 45 days after receipt of the letter. Ask your attorney which date your board uses.', basis: 'statute' },
    { text: 'Check whether an earlier notice of late assessment was sent for the attorney’s fees.', detail: 'Attorney fees on a past due assessment require a written notice of late assessment first. HomeownerHub will not draft the intent-to-lien letter until a late notice was recorded at least 30 days earlier.', basis: 'statute' },
    { text: 'Before foreclosure, a second notice of intent to foreclose is required, 45 days before suit and not before the first 45 days pass.', detail: 'That is a separate notice with its own form. Ask your attorney.', basis: 'statute' },
    { text: 'Ask your attorney whether a bankruptcy, a mortgage foreclosure or another sale affects the timing.', detail: 'The statute says the time limits in the foreclosure subsection do not apply in those cases.', basis: 'statute' },
  ],
  letter: {
    heading: 'Notice of intent to record a claim of lien (fill-in)',
    intro: 'Fill the blanks in brackets. This sample follows the form in § 720.3085(4)(a). Have your attorney review it against your governing documents before it is sent.',
    lines: [
      '[Association name]',
      '[Date of notice]',
      '',
      'To: [owner name]',
      'Sent to: [last address in the association’s records], and [parcel address, if different]',
      '',
      'NOTICE OF INTENT TO RECORD A CLAIM OF LIEN',
      'RE: Parcel [lot/block, lot/parcel number] of [association name]',
      '',
      'The following amounts are currently due on your account to [association name], and must be paid within 45 days after your receipt of this letter. This letter shall serve as the association’s notice of intent to record a Claim of Lien against your property no sooner than 45 days after your receipt of this letter, unless you pay in full the amounts set forth below:',
      '',
      'Maintenance due [dates]: $[amount]',
      'Late fee, if applicable: $[amount]',
      'Interest through [date]*: $[amount]',
      'Certified mail charges: $[amount]',
      'Other costs: $[amount]',
      'TOTAL OUTSTANDING: $[total]',
      '',
      '*Interest accrues at the rate of [percent] percent per annum.',
      '',
      'Questions: [name, office, phone, e-mail]',
    ],
  },
  quotes: ['flLienDemand', 'flLien45', 'flLienFormIntent', 'flLienMail', 'flLienAbroad', 'flLienLateNotice', 'flLienInterest', 'flLienLateFee', 'flLienApply', 'flLienForeclose', 'flLienSecondNotice', 'flLienRecover', 'flLienExcept'],
  quotesHeading: 'The Florida text behind these fields',
  faqs: [
    {
      q: 'How long must a Florida HOA wait before recording a claim of lien?',
      a: 'The owner gets 45 days following the date the notice is deposited in the mail to pay. The statute’s form says the lien will be recorded no sooner than 45 days after receipt of the letter. See the quotes above.',
    },
    {
      q: 'How must the notice be sent?',
      a: 'By registered or certified mail, return receipt requested, and by first-class mail, to the owner’s last address in the association’s records and to the parcel address if it is different.',
    },
    {
      q: 'What amounts go on the notice?',
      a: 'Maintenance due, late fee if any, interest through a date, certified mail charges, other costs and the total outstanding, as the statute’s form lists.',
    },
    {
      q: 'Is there a second notice before foreclosure?',
      a: 'Yes. A foreclosure action may not be brought until 45 days after the owner is given notice of intent to foreclose, and that notice cannot be given until the first 45 days have passed.',
    },
    {
      q: 'Is this a required form?',
      a: 'The statute says the notice must be in substantially the form it prints. This page follows that form but is not legal advice. Have your attorney review the final notice.',
    },
  ],
  related: ['florida-hoa-estoppel-certificate-rules', 'florida-hoa-fine-hearing-notice', 'texas-hoa-third-party-collections-notice', 'california-hoa-pre-lien-notice-and-collections', 'georgia-hoa-collections-notice'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'For Florida, the collections letters are the Notice of Late Assessment (§ 720.3085(3)(d)) and the 45-day Notice of Intent to Record a Lien (§ 720.3085(4)), using the statute’s own wording. The intent letter can be drafted only once a late notice was recorded at least 30 days earlier.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
    {
      text: 'Letters wait in Approvals, and nothing is emailed. You print and mail them yourself. HomeownerHub does not track certified mail for Florida letters.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
  ],
}
