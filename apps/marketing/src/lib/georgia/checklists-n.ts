// SEO batch 17, Florida director certification checklist.
// Statute text: Fla. Stat. § 720.3033(1) from flsenate-ch720-2026.html, through
// the flCert* quotes. The 2026 text in the fixture asks each director for a
// certificate of completing the department-approved education. The only place
// it still says "written certification" is the retention sentence in (1)(c), so
// the page quotes that sentence and does not describe a separate certification
// form. Chapter 720 only. Product claim: director certification tracking in
// settings/members (release 2026-10-21-1130-budget-hearings-directors), which
// tracks the 90-day deadline and the 4-year renewal and has a "Mark certified"
// action. It does not track the continuing-education hours, and the page says so.

import type { Checklist } from './checklists'

export const FL_DIRECTOR_CERTIFICATION: Checklist = {
  slug: 'florida-hoa-director-certification-checklist',
  path: '/templates/florida-hoa-director-certification-checklist',
  title: 'Florida HOA director certification checklist',
  metaTitle: 'Florida HOA director certification checklist',
  description:
    'A free, printable checklist for a Florida HOA board to collect and keep each director’s education certificate (Fla. Stat. 720.3033).',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this each time a Florida homeowners’ association seats a new director, and once a year as a tidy-up. It lists what the board secretary collects and keeps for each director under Fla. Stat. § 720.3033(1). Our guide to Florida board meetings covers the notice rules for the meeting where a vacancy is filled, and our records guide covers what owners can inspect.',
    'Each item is tagged: statute means the quoted § 720.3033 text calls for it, practice means it is our suggestion. Chapter 720 only, not condominiums. The department sets the curriculum and approves the providers, so confirm the course with the department or your attorney. This is not legal advice.',
  ],
  items: [
    { text: 'Write down the date each new director was elected or appointed.', detail: 'The 90 days run from that date, so put the last day on the calendar the same day.', basis: 'statute' },
    { text: 'Tell the director in writing what to file and by when.', detail: 'Within 90 days after election or appointment, each director must submit a certificate of having satisfactorily completed the education curriculum from a department-approved provider.', basis: 'statute' },
    { text: 'Check the provider is department-approved before the director pays for the course.', detail: 'Ask the provider, or check the department’s list. The statute says the curriculum is administered by a department-approved education provider.', basis: 'statute' },
    { text: 'Collect the certificate and read it: the director’s name, the provider, the course and the date of completion.', detail: 'File the certificate itself. A note that the director says they finished is not the certificate.', basis: 'practice' },
    { text: 'Record the date the certificate was filed with the board.', detail: 'A director who does not timely file is suspended from the board until they comply, so the filing date matters.', basis: 'statute' },
    { text: 'If a certificate is late, tell the board and your attorney before the next meeting.', detail: 'The statute suspends the director until compliance and lets the board temporarily fill the vacancy. Do not decide this alone.', basis: 'statute' },
    { text: 'Note when each certificate stops being valid.', detail: 'A certificate of completion is valid for up to 4 years, and a director must repeat the new-director education at least every 4 years. Calendar the renewal.', basis: 'statute' },
    { text: 'Record the continuing education each director must complete every year.', detail: 'At least 4 hours annually for an association with fewer than 2,500 parcels, at least 8 hours for 2,500 parcels or more. Ask the provider what proof it issues and keep it with the certificate.', basis: 'statute' },
    { text: 'Keep each director’s certificate on file for at least 5 years after the director’s election.', detail: 'The statute says the association retains the certificate for inspection by the members for that period.', basis: 'statute' },
    { text: 'Decide how an owner will inspect the certificates, and put it in your records request process.', detail: 'A certificate is a record members may ask to see. Our Florida records response checklist walks through a request. Remove personal contact details before showing anything else on the file.', basis: 'practice' },
    { text: 'Do not treat a missing certificate as a reason to undo a board decision without asking your attorney.', detail: 'The statute says the failure to have the written certification or educational certificate on file does not affect the validity of any board action.', basis: 'statute' },
    { text: 'Keep one list: director, date seated, certificate filed, renewal due, annual hours done.', detail: 'Hand it to the next secretary with the other board records.', basis: 'practice' },
  ],
  letter: {
    heading: 'Director certificate reminder (fill-in)',
    intro: 'Fill the blanks in brackets. This form quotes no law and is a starting point only. Send it to a newly seated director, and have your attorney review it against your governing documents.',
    lines: [
      '[Association name]',
      '[Date of this note]',
      '',
      'To: [director name]',
      '',
      'RE: Your director education certificate',
      '',
      'You were [elected / appointed] to the board on [date]. Florida law asks each director to submit a certificate of having completed the department-approved director education within 90 days after that date. Your last day to file is [date, 90 days after election or appointment].',
      '',
      'Please send the certificate to [name, office, address, e-mail].',
      '',
      'Received on: [date]',
      'Provider: [name]',
      'Completed on: [date]',
      'Valid until: [date, no later than 4 years after completion]',
      'Annual continuing education: [4 hours / 8 hours] due each year. Last completed: [date]',
      '',
      'Questions: [name, office, phone, e-mail]',
    ],
  },
  quotes: ['flCertSubmit', 'flCertCurriculum', 'flCertValid', 'flCertRepeat', 'flCertSmall', 'flCertLarge', 'flCertSuspend', 'flCertRetain'],
  quotesHeading: 'The Florida text behind these steps',
  faqs: [
    {
      q: 'How long does a new Florida HOA director have to file the education certificate?',
      a: 'Within 90 days after being elected or appointed, under § 720.3033(1)(a). A director who does not timely file is suspended from the board until they comply.',
    },
    {
      q: 'How long is the certificate valid?',
      a: 'The statute says the certificate of completion is valid for up to 4 years, and a director must complete the new-director education at least every 4 years.',
    },
    {
      q: 'How long must the association keep the certificates?',
      a: 'The association retains each director’s educational certificate for inspection by the members for 5 years after the director’s election, under § 720.3033(1)(c).',
    },
    {
      q: 'Is there continuing education too?',
      a: 'Yes. A director must complete at least 4 hours annually in an association with fewer than 2,500 parcels, and at least 8 hours in an association with 2,500 parcels or more.',
    },
    {
      q: 'Does a missing certificate undo a board vote?',
      a: 'The statute says failing to have the written certification or educational certificate on file does not affect the validity of any board action. The director can still be suspended for not filing, so ask your attorney how to handle it.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute asks for the certificate, not for a form from the association. This template is our suggestion and is not legal advice.',
    },
  ],
  related: ['florida-hoa-board-meeting-notice-rules', 'florida-hoa-elections-and-quorum', 'florida-hoa-official-records-inspection', 'florida-hoa-records-request-response-checklist', 'hoa-board-meeting-minutes'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'For Florida associations, Members shows each director’s 90-day deadline to file the education certificate and the 4-year renewal, and "Mark certified" records it. The dashboard and the morning email remind you as the date nears. It does not track continuing-education hours.',
      route: '/settings/members',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
  ],
}
