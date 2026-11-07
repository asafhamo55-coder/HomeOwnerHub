// SEO batch 34, three Georgia templates: a fine hearing notice, a records
// inspection response checklist and an estoppel or payoff statement request
// checklist.
//
// Statute text, only through existing quotes in georgia-quotes.ts:
//  - Fine hearing notice: fineAuth and reasonableRules (O.C.G.A. § 44-3-223,
//    ga-ocga-44-3-art6-2026.txt). The Georgia fixtures hold NO statutory fine
//    hearing rule, so every item is tagged practice and the page says plainly
//    that the notice rests on the governing documents. The two quotes are shown
//    only to say where the power to fine comes from and that a rule must have
//    been provided to owners.
//  - Records checklist: O.C.G.A. §§ 14-3-1602(a) to (e), the Nonprofit
//    Corporation Code, through memberInspect, recCopyIntro, recBylaws,
//    recMinutes3yr, recOfficers, recInspectIntro, recMemberListInspect,
//    memberInspectPurpose and memberInspectRestrict. It applies only if the
//    association is a nonprofit corporation, and the page says so.
//  - Estoppel checklist: O.C.G.A. § 44-3-232(d), through stmtRight, stmtWriting,
//    stmtFiveDays, stmtBinding and stmtFee. The Act calls this a statement of
//    amounts due, not an estoppel certificate.
// Product claims limited to shipped features with a route and a release note.
// HomeownerHub does not decide a fine, a records request or a payoff figure,
// and gives no legal advice. Property Owners' Association Act only, not
// condominiums.

import type { Checklist } from './checklists'

export const GA_FINE_HEARING_NOTICE: Checklist = {
  slug: 'georgia-hoa-fine-hearing-notice',
  path: '/templates/georgia-hoa-fine-hearing-notice',
  title: 'Georgia HOA fine hearing notice template',
  metaTitle: 'Georgia HOA fine hearing notice template',
  description:
    'A free, printable fine hearing notice for a Georgia HOA board. The sections we hold set no hearing step, so it follows your documents. Check your declaration.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when the board is thinking about a fine and wants to give the owner a written notice and a chance to be heard first. The checklist helps the board set up the notice. The fill-in notice at the end is for the board to complete and send.',
    'Read this part first. The Georgia text we hold does not require a hearing before a fine, and it sets no notice period, panel or fine amount. So this notice rests on your own governing documents, not on a statute. Every item below is tagged practice, which means it is our suggestion. If your declaration or bylaws set a hearing step, follow them to the letter and use this form only as a starting point. Check your declaration and bylaws, and ask your attorney. This is not legal advice.',
  ],
  items: [
    { text: 'Read the fine and hearing provisions of your declaration and bylaws before you use this form.', detail: 'Note whether they set a notice period, a panel, a hearing, an appeal, a cap or a fine schedule. If they do, the form must match them.', basis: 'practice' },
    { text: 'Confirm your documents give the association the power to fine for this kind of violation.', detail: 'The Act’s sentence on fines says the power exists if and to the extent the instrument provides, and it speaks of enforcing compliance with the instrument and the rules. The instrument means the declaration, plats and plans recorded under the Act. If your documents are silent, ask your attorney before you go further.', basis: 'practice' },
    { text: 'Find the rule the owner is said to have broken, and check that it was provided to owners.', detail: 'The Act’s sentence on rules refers to reasonable rules adopted under the instrument that have been provided to the lot owners, and to the lawful provisions of the bylaws. A rule that was never sent out is a weak base for a fine.', basis: 'practice' },
    { text: 'Write down the facts: what was seen, where, when and by whom.', detail: 'Attach dated photos or the report. Stick to what was observed.', basis: 'practice' },
    { text: 'Send a first written notice of the violation and a chance to fix it, unless your documents say otherwise.', detail: 'A hearing notice for a problem the owner was never told about is hard to defend.', basis: 'practice' },
    { text: 'Address the notice to the owner at the address on file, and to the occupant if someone else lives there.', detail: 'Use the method your documents call for. If they are silent, a method that leaves a record, such as certified mail plus email, is the safer choice.', basis: 'practice' },
    { text: 'Describe the alleged violation in plain words and name the rule or section.', detail: 'Say "alleged". The notice is not a decision.', basis: 'practice' },
    { text: 'State what the owner can do to fix it, and by what date.', detail: 'If nothing can fix it, say so.', basis: 'practice' },
    { text: 'Say what the board is considering, such as a fine amount or a suspension, only as your documents allow.', detail: 'Copy the amount from your fine schedule. Do not invent one.', basis: 'practice' },
    { text: 'Give the hearing date, time and place, and a way to take part by phone or video if you can offer one.', detail: 'Pick a date that gives the owner real time to prepare. If your documents set a minimum notice, count from the day the notice is mailed or delivered, as they say.', basis: 'practice' },
    { text: 'Tell the owner how to respond: attend, send a written reply, bring a representative, or ask to move the date.', basis: 'practice' },
    { text: 'Decide who will hear the matter, and keep anyone with a personal stake out of it.', detail: 'If your documents name a committee, use it. If a director is the neighbor who complained, record that and keep that director out of the decision.', basis: 'practice' },
    { text: 'Check the registration and complaint position before any fine goes out.', detail: 'Our Georgia fines and violation hearings guide covers the 2027 registration rule and the Secretary of State complaint pause.', basis: 'practice' },
    { text: 'Keep a copy of the notice and proof of how and when it was sent.', detail: 'Add the photos, the rule and the letter to the same file.', basis: 'practice' },
    { text: 'After the hearing, decide in writing, give the reason, and send the decision to the owner.', detail: 'Record who attended and what was said in the minutes or a short file note.', basis: 'practice' },
    { text: 'Have your attorney read the notice once before the first one goes out.', detail: 'A short review now costs less than a challenge to a notice that skipped a step in your documents.', basis: 'practice' },
  ],
  letter: {
    heading: 'Notice of hearing before any fine (fill-in)',
    intro: 'The board fills the blanks in brackets. The notice quotes no law and is a starting point only. Match it to your declaration and bylaws, and have your attorney review it before it is sent.',
    lines: [
      '[Association full legal name]',
      '[Date of notice]',
      '',
      'To: [owner name] and, if applicable, [occupant name]',
      'Sent to: [address on file, and method of delivery]',
      'Lot: [lot address]',
      '',
      'NOTICE OF HEARING',
      '',
      'The board is considering [a fine of $[amount] / a suspension of [privilege] for [period] / other action allowed by our documents] for the following alleged violation: [description of what was seen, with dates].',
      'The rule at issue is: [rule title and section of the declaration, bylaws or rules].',
      'This notice is not a decision. The board has not decided anything yet.',
      '',
      'To fix the problem: [what the owner can do]. Please do this by [date].',
      '',
      'Hearing date and time: [date and time]',
      'Place: [address and room]',
      'To take part by phone or video: [number or link, or "not offered"]',
      '',
      'You may attend, bring a representative, or send a written reply to [name and address or email] before the hearing. If you cannot attend on this date, contact [name, phone, email] as soon as you can.',
      '',
      'Our documents provide for this hearing in [section of declaration or bylaws, or "no hearing provision; the board is offering this hearing as a courtesy"].',
      '',
      'Questions: [name, office, phone, email]',
    ],
  },
  quotes: ['fineAuth', 'reasonableRules'],
  quotesHeading: 'The Georgia text on fines and rules (it sets no hearing)',
  faqs: [
    {
      q: 'Does a Georgia HOA have to hold a hearing before it fines an owner?',
      a: 'The sections of the Property Owners’ Association Act we hold do not say so. They do not set a hearing step, a notice period or a fine amount. Your declaration and bylaws may. Read them and ask your attorney.',
    },
    {
      q: 'Where does the power to fine come from?',
      a: 'From your instrument. The Act’s sentence on fines says the association may fine if and to the extent the instrument provides. If your documents say nothing about fines, ask your attorney before you fine.',
    },
    {
      q: 'Why send a hearing notice if the statute does not ask for one?',
      a: 'Because a written notice and a chance to be heard make a decision fairer and easier to explain. That is our suggestion, not a legal rule. If your documents ask for a hearing, it is also a step you must follow.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute does not print a form. This template is our suggestion and is not legal advice. Have your attorney review it. Condominiums are under a different Act and are not covered here.',
    },
  ],
  related: ['fines-and-violation-hearings', 'georgia-hoa-owner-compliance-and-remedies-44-3-223', 'hoa-violation-letter-georgia', 'georgia-hoa-rules-adoption-resolution', 'late-fee-limits'],
  datePublished: '2026-11-07',
  dateModified: '2026-11-07',
  howTo: true,
  hoaDoes: [
    {
      text: 'From a violation, the board can draft a hearing notice letter. The letter waits in Approvals, and nothing is sent to the owner from that step.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
  ],
}

export const GA_RECORDS_RESPONSE: Checklist = {
  slug: 'georgia-hoa-records-inspection-response-checklist',
  path: '/templates/georgia-hoa-records-inspection-response-checklist',
  title: 'Georgia HOA records inspection request response checklist',
  metaTitle: 'Georgia HOA records inspection checklist',
  description:
    'A free, printable checklist and fill-in reply for a Georgia nonprofit HOA that gets a written records inspection request, with the five business days.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this the day a written request to inspect records reaches a Georgia homeowners’ association. It is a working list for the board member or manager who has to answer.',
    'The quoted text is the Nonprofit Corporation Code, O.C.G.A. § 14-3-1602. It applies if the association is a nonprofit corporation, so check your articles of incorporation first. Each item is tagged: statute means the quoted text calls for it, practice means it is our suggestion. The sections we hold do not say how to answer a request for a record they do not list, and we do not cover the separate rules for condominiums. Check your declaration and bylaws, and ask your attorney before you refuse or narrow a request. This is not legal advice.',
  ],
  items: [
    { text: 'Check your articles of incorporation to confirm the association is a Georgia nonprofit corporation.', detail: 'The rest of this list applies only if it is. If it is a business corporation or something else, stop and ask your attorney which rule applies.', basis: 'practice' },
    { text: 'Write down the date the request arrived, who sent it, and whether it is a written notice or a written demand.', detail: 'If the association is a nonprofit corporation, the Code says the member gives written notice or a written demand at least five business days before the date they want to inspect and copy.', basis: 'statute' },
    { text: 'Count five business days from the date the member says they want to inspect, and put both dates on the calendar.', detail: 'Reply before then, even if only to offer a time and place.', basis: 'practice' },
    { text: 'Confirm the person is a member of the association.', detail: 'The right described is a member’s right. If the person is not an owner or member, ask your attorney.', basis: 'statute' },
    { text: 'Sort what they asked for into two groups: the records the Code says the corporation keeps a copy of, and the records that need a stated purpose.', detail: 'The first group is listed in subsection (a) and includes the articles, the bylaws, member meeting minutes for the past three years and the list of current directors and officers. The second group, in subsection (c), is board minute excerpts, accounting records and the membership list.', basis: 'statute' },
    { text: 'For the first group, pull the copies and offer a reasonable time and location.', detail: 'The Code says the member inspects and copies at a reasonable time and location specified by the corporation.', basis: 'statute' },
    { text: 'For the second group, check that the request meets the conditions in subsection (d).', detail: 'The conditions are a good-faith demand for a proper purpose, a description of the purpose and the records with reasonable particularity, records directly connected with the purpose, and use only for that purpose. If the request does not say, write back and ask. Ask your attorney before you refuse.', basis: 'statute' },
    { text: 'Do not hand over the membership list without asking your attorney about Code Section 14-3-1605.', detail: 'The membership list is subject to that section, which we do not quote, so we cannot say when it may be withheld.', basis: 'practice' },
    { text: 'If you will ask for limits on how the records are used, put them in writing.', detail: 'The Code lets the corporation impose reasonable restrictions on the confidentiality, use or distribution of the second group. Keep the restrictions plain and short.', basis: 'statute' },
    { text: 'Pull only what was asked for, and keep a list of what you pulled.', detail: 'Remove anything outside the request, such as unrelated owner files.', basis: 'practice' },
    { text: 'Decide whether you will charge for copies, and tell the member before you copy.', detail: 'The sections we hold set no copy fee. Check your bylaws and policy, and keep any charge reasonable and itemized.', basis: 'practice' },
    { text: 'Reply in writing before the inspection date.', detail: 'Use the fill-in below. Say what is available, when and where.', basis: 'practice' },
    { text: 'Record what was shown or copied, to whom and when, and file it with the request.', basis: 'practice' },
    { text: 'If a director wants to refuse the request, or the request is unclear, call your attorney before the date passes.', basis: 'practice' },
  ],
  letter: {
    heading: 'Reply to a written request to inspect records (fill-in)',
    intro: 'Fill the blanks in brackets. This form quotes no law and is a starting point only. Send it before the inspection date, and have your attorney review it if any record is being withheld.',
    lines: [
      '[Association full legal name]',
      '[Date of reply]',
      '',
      'To: [member name]',
      'Property: [address]',
      '',
      'RE: Your written request of [date received] to inspect and copy records',
      '',
      'We received your written request on [date received]. You asked to inspect and copy the records on [date requested].',
      '',
      'Records available: [list the records]',
      'When: [date and time]',
      'Where: [place]',
      'Copies: [no charge / $[amount], itemized as [pages and rate]]',
      '',
      'Records we need more information about: [none / list]. Please tell us in writing the purpose of your request and which records it covers, so that we can respond. Please send it to [name and address or email].',
      '',
      'Records not provided: [none / description of the category and the reason, as your attorney advises]',
      '',
      'Use of the records: [none / any restriction the board is asking for, in one or two sentences, as your attorney advises]',
      '',
      'Questions: [name, office, phone, email]',
    ],
  },
  quotes: ['memberInspect', 'recCopyIntro', 'recBylaws', 'recMinutes3yr', 'recOfficers', 'recInspectIntro', 'recMemberListInspect', 'memberInspectPurpose', 'memberInspectRestrict'],
  quotesHeading: 'The Georgia text behind these steps',
  faqs: [
    {
      q: 'How long does a Georgia nonprofit HOA have to respond to a records request?',
      a: 'The Code does not set a response deadline in the text we hold. It says the member gives written notice or a written demand at least five business days before the date they want to inspect and copy. Reply before that date.',
    },
    {
      q: 'Can the association ask why the member wants the records?',
      a: 'For the second group of records, the Code makes a good-faith demand for a proper purpose one of the conditions, so asking for the purpose is part of that process. For the first group, the text we hold sets no such condition. Ask your attorney before you refuse a request.',
    },
    {
      q: 'Does this apply to every Georgia HOA?',
      a: 'It applies if the association is a nonprofit corporation, which many are. Check your articles of incorporation. A different rule may apply to a condominium or a business corporation, and we do not cover those here.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute does not print a form. This template is our suggestion and is not legal advice. Have your attorney review it.',
    },
  ],
  related: ['georgia-hoa-records-the-association-must-keep-14-3-1601', 'records-inspection-requests', 'owners-rights-2027', 'hoa-board-meeting-minutes', 'hoa-treasurer-duties'],
  datePublished: '2026-11-07',
  dateModified: '2026-11-07',
  howTo: true,
  hoaDoes: [
    {
      text: 'Tickets has a Records requests page. For Georgia it shows the five-business-day rule, and notes that minutes, financial records and the owner list also need a stated purpose.',
      route: '/tickets/records',
      release: '2026-10-22-2000-georgia-2027-nonprofit-marketing',
    },
    {
      text: 'The page has a printable three-year financial packet, with balance sheets, income statements and adopted budgets, to help answer a records request. The board decides what to share.',
      route: '/tickets/records',
      release: '2026-10-26-1700-ga-complaint-stay-owner-rights',
    },
  ],
}

export const GA_ESTOPPEL_CHECKLIST: Checklist = {
  slug: 'georgia-hoa-estoppel-statement-request-checklist',
  path: '/templates/georgia-hoa-estoppel-statement-request-checklist',
  title: 'Georgia HOA estoppel or payoff statement request checklist',
  metaTitle: 'Georgia HOA estoppel request checklist',
  description:
    'A free, printable checklist for answering an estoppel or payoff request in a Georgia HOA: the five business days, the fee limit and the figures.',
  eyebrow: 'Free checklist · Print it',
  intro: [
    'Use this when a title company, a buyer, a lender or an owner asks for an estoppel letter or payoff figure during a sale or refinance. Georgia’s Property Owners’ Association Act does not use the word estoppel. It gives a statement of the assessments past due and unpaid, and that is what this list covers.',
    'Each item is tagged: statute means the quoted text of O.C.G.A. § 44-3-232(d) calls for it, practice means it is our suggestion. Our estoppel letter guide explains the rule in prose, and this page is the working list for one request. Condominiums are under a different Act and are not covered here. Check your declaration and bylaws, and ask your attorney, especially before a deadline passes. This is not legal advice.',
  ],
  items: [
    { text: 'Write down the date and time the request reached the association, and who sent it.', detail: 'The five business days run from receipt of the request.', basis: 'statute' },
    { text: 'Check who is asking.', detail: 'The Act names a lot owner, a mortgagee of the lot, a person who has signed a contract to buy the lot, or a lender considering a loan secured by the lot.', basis: 'statute' },
    { text: 'Check that the request is in writing, was delivered to the association’s registered office, and gives an address for the reply.', detail: 'The Act says the request is in writing, delivered to the registered office and states an address. If it came by email or to someone else, ask your attorney whether to treat it as received, and in the meantime treat the day it reached you as the start.', basis: 'statute' },
    { text: 'Count five business days from receipt and put the date on the board calendar the same day.', detail: 'Sending the statement on time matters. The Act says that a failure to mail or furnish it within five business days causes the lien to be extinguished as to the title or interest of the purchaser or lender in that transaction. Ask your attorney what that means for you.', basis: 'statute' },
    { text: 'Pull the lot’s account from the ledger: assessments past due and unpaid, late charges and interest.', detail: 'The statement sets out the amount of assessments past due and unpaid, together with late charges and interest applicable to them. Check each figure against the ledger and the receipts.', basis: 'statute' },
    { text: 'Decide whether to add anything else, such as the regular assessment, the paid-through date, special assessments or open violations.', detail: 'The Act does not ask for these. If you add them, add only what you are sure of, and ask your attorney first.', basis: 'practice' },
    { text: 'Have a second person check the figures before the statement goes out.', detail: 'The Act says the information in the statement binds the association and every lot owner. A wrong figure is hard to take back.', basis: 'statute' },
    { text: 'If you will charge a fee, check that your instrument provides for one, and keep it within the limit.', detail: 'The Act says a fee not exceeding $10.00 may be required if the instrument so provides.', basis: 'statute' },
    { text: 'Mail or otherwise furnish the statement to the address in the request, and keep proof.', detail: 'Use a method that leaves a record, such as email with a read receipt or certified mail. Do not send it only to the person you usually deal with.', basis: 'statute' },
    { text: 'Date the statement and say which day the figures are good through.', basis: 'practice' },
    { text: 'Keep the request, the statement, the delivery record and any fee receipt in the lot file.', basis: 'practice' },
    { text: 'If the request is unclear, late or comes from someone you do not recognize, call your attorney before the deadline passes.', basis: 'practice' },
  ],
  letter: {
    heading: 'Estoppel and payoff request log (fill-in)',
    intro: 'Fill the blanks in brackets for each request. This log quotes no law and is a starting point only. Have your attorney review it against your governing documents.',
    lines: [
      '[Association full legal name]',
      '',
      'Lot: [address]',
      'Requested by: [name, and role: owner / mortgagee / buyer under contract / lender]',
      'Request received: [date and time, how, and where]',
      'In writing: [yes / no]    Reply address given: [address]',
      'Fifth business day: [date]',
      '',
      'Assessments past due and unpaid on the issue date: $[amount]',
      'Late charges: $[amount]    Interest: $[amount]',
      'Anything else included, if the board chose to add it: [list]',
      'Figures checked by: [name]    Date: [date]',
      '',
      'Fee: [none / $[amount], within the instrument and the Act’s limit]    Instrument section: [section]',
      '',
      'Statement issued: [date] by [name]',
      'Sent to: [address from the request] by [method] on [date]',
      'Proof kept: [what and where]',
    ],
  },
  quotes: ['stmtRight', 'stmtWriting', 'stmtFiveDays', 'stmtBinding', 'stmtFee'],
  quotesHeading: 'The Georgia text behind these steps',
  faqs: [
    {
      q: 'How long does a Georgia HOA have to answer an estoppel or payoff request?',
      a: 'The Act gives five business days from receipt of the request to mail or otherwise furnish the statement. The text is quoted above. Ask your attorney about any request you are unsure of.',
    },
    {
      q: 'Does Georgia have an estoppel certificate law like Florida’s?',
      a: 'The Property Owners’ Association Act text we hold has a statement of the assessments past due and unpaid, and no separate estoppel certificate. Florida’s statute has different deadlines and fees.',
    },
    {
      q: 'Can the association charge for the statement?',
      a: 'The Act says a fee of no more than $10.00 may be required if the instrument so provides. Check your declaration and bylaws before you charge.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute does not print a form. This checklist is our suggestion and is not legal advice. Have your attorney review it.',
    },
  ],
  related: ['georgia-hoa-estoppel-letter-resale', 'georgia-hoa-unpaid-assessments-when-a-lot-is-sold-44-3-225', 'georgia-hoa-assessment-lien-rules', 'florida-hoa-estoppel-certificate-request-checklist', 'hoa-treasurer-duties'],
  datePublished: '2026-11-07',
  dateModified: '2026-11-07',
  howTo: true,
  hoaDoes: [
    {
      text: 'On a property, the board can prepare the paperwork a sale needs. For Georgia it is built on the statement of amounts due, with the five-business-day deadline and the $10.00 fee limit shown.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-20-1053-state-law-resale-roster',
    },
    {
      text: 'You cannot print until every blank is filled and you tick that you have verified the figures. Nothing is emailed, and each certificate prepared or printed is recorded in the activity log.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
  ],
}
