// SEO batch 19, Florida estoppel certificate request checklist.
// Statute text: Fla. Stat. § 720.30851 from flsenate-ch720-2026.html, through
// the flEstop* quotes (already used by the estoppel guide, never by a
// template). Every statute-tagged item restates a quote. The fee figures are
// the ones in the quoted text, which says they adjust every 5 years, so the
// page tells the board to check the current amounts. Product claim: the
// estoppel certificate on a property (releases 2026-10-19-1539-estoppel and
// 2026-10-20-2205-estoppel-and-ui-fixes). Chapter 720 only.

import type { Checklist } from './checklists'

export const FL_ESTOPPEL_CHECKLIST: Checklist = {
  slug: 'florida-hoa-estoppel-certificate-request-checklist',
  path: '/templates/florida-hoa-estoppel-certificate-request-checklist',
  title: 'Florida HOA estoppel certificate request checklist',
  metaTitle: 'Florida HOA estoppel request checklist',
  description:
    'A free, printable checklist for answering an estoppel request in a Florida HOA: the 10 business days, delivery, fees and validity (Fla. Stat. 720.30851).',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this when a Florida homeowners’ association gets a request for an estoppel certificate from an owner, a mortgagee or their designee, usually during a sale or a refinance. Each item is tagged: statute means the quoted Fla. Stat. § 720.30851 text calls for it, practice means it is our suggestion.',
    'Our guide to Florida estoppel certificates explains the rules in prose. This page is the working list for one request. Chapter 720 only, not condominiums. The statute says the fee amounts are adjusted every 5 years, so confirm the current figures with your attorney before you charge. This is not legal advice.',
  ],
  items: [
    { text: 'Write down the date and time the written or electronic request arrived, and who sent it.', detail: 'The 10 business days run from receipt. The requestor can be the owner, the mortgagee or either one’s designee.', basis: 'statute' },
    { text: 'Calendar the tenth business day the same day.', detail: 'The association shall issue the certificate within 10 business days after receiving the request.', basis: 'statute' },
    { text: 'Check that the association’s website names a person or entity with a street or e-mail address for these requests.', detail: 'The statute requires each association to designate one on its website.', basis: 'statute' },
    { text: 'Pull the parcel’s account from the ledger: the balance, the regular assessment and the paid-through date.', detail: 'Check each figure against the ledger before it goes on the certificate.', basis: 'practice' },
    { text: 'Check whether any amount is delinquent on the day the certificate will be issued.', detail: 'The fee limit depends on it. See the quotes below.', basis: 'statute' },
    { text: 'Check that the board adopted a written resolution that sets the fee, or that a written management, bookkeeping or maintenance contract provides for it.', detail: 'The authority to charge must be established that way.', basis: 'statute' },
    { text: 'If you charge a fee, keep it at or under the limit for this request, and confirm the current amount.', detail: 'The quoted limit is $250 with nothing delinquent. An expedited certificate delivered within 3 business days may add $100, and with a delinquent amount an additional fee may not exceed $150. The fees adjust every 5 years.', basis: 'statute' },
    { text: 'Do not charge a fee if the certificate will not go out in 10 business days.', detail: 'A late certificate carries no fee for preparation and delivery.', basis: 'statute' },
    { text: 'Have a board member or the manager read the certificate before it is issued.', detail: 'An association that waives amounts in excess of those stated cannot collect them later from a person who relied on the certificate in good faith. A wrong figure costs the association.', basis: 'statute' },
    { text: 'Deliver it by hand, regular mail or e-mail, on the date of issuance.', detail: 'The statute requires delivery to the requestor on the date the certificate is issued.', basis: 'statute' },
    { text: 'Write the effective period on your copy: 30 days if hand delivered or sent electronically, 35 days if sent by regular mail.', basis: 'statute' },
    { text: 'If the requestor sends a correction, issue an amended certificate and charge nothing for it.', basis: 'statute' },
    { text: 'Keep the request, the certificate, the delivery record and the fee receipt in the parcel file.', detail: 'A summary proceeding can be brought to compel compliance, and the prevailing party recovers reasonable attorney fees, so a clear record helps.', basis: 'statute' },
  ],
  letter: {
    heading: 'Estoppel request log (fill-in)',
    intro: 'Fill the blanks in brackets for each request. This log quotes no law and is a starting point only. Have your attorney review it against your governing documents.',
    lines: [
      '[Association name]',
      '',
      'Parcel: [address]',
      'Requestor: [name, owner / mortgagee / designee]',
      'Request received: [date and time, how]',
      'Tenth business day: [date]',
      '',
      'Balance on the issue date: $[amount]',
      'Regular assessment: $[amount] [frequency], paid through [date]',
      'Any delinquent amount on the issue date: [yes / no], $[amount]',
      'Fee authority: [resolution date / contract name]',
      'Fee charged: $[amount] [standard / expedited], confirmed against current limits on [date]',
      '',
      'Issued: [date] by [name]',
      'Delivered: [hand / mail / e-mail] on [date]',
      'Effective until: [date, 30 days or 35 days after issue]',
      'Amended certificate issued: [date, no fee]',
    ],
  },
  quotes: ['flEstopIssue', 'flEstopWebsite', 'flEstopDelivery', 'flEstopEffective', 'flEstopAmended', 'flEstopFee', 'flEstopFeeExtra', 'flEstopAuthority', 'flEstopLate', 'flEstopReliance', 'flEstopSuit', 'flEstopCpi'],
  quotesHeading: 'The Florida text behind these steps',
  faqs: [
    {
      q: 'How long does a Florida HOA have to issue an estoppel certificate?',
      a: 'Within 10 business days after receiving a written or electronic request, under § 720.30851.',
    },
    {
      q: 'How long is the certificate good for?',
      a: 'The statute gives a 30-day effective period for one hand delivered or sent electronically, and 35 days for one sent by regular mail.',
    },
    {
      q: 'What happens if the association is late?',
      a: 'It may not charge a fee for preparing and delivering that certificate.',
    },
    {
      q: 'Can the association charge for an amended certificate?',
      a: 'No. The statute says a fee may not be charged for an amended estoppel certificate.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute asks for the certificate and sets its deadline, delivery and fee limits. This log is our suggestion and is not legal advice.',
    },
  ],
  related: ['florida-hoa-estoppel-certificate-rules', 'florida-hoa-assessment-lien-and-foreclosure-timeline', 'florida-hoa-notice-of-intent-to-lien', 'florida-hoa-records-request-response-checklist'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'On a property, the board can prepare an estoppel certificate filled in from the home’s account: the balance, the regular assessment and paid-through date, special assessments, and any payment plan.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
    {
      text: 'For Florida it shows the 10-business-day deadline, the 30 or 35 day validity, and the fee limits, with a reminder to check the state’s current inflation-adjusted amounts.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
  ],
}
