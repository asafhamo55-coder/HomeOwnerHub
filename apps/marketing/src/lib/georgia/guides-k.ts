// SEO batch 10: Florida and California records inspection, and the Texas
// management certificate. Statute text only through the quote bank
// (state-quotes.ts, checked word for word against the fixtures). Product
// claims only with an apps/hoa route and a release note that exist, and only
// what STATE_COVERAGE in state-law.ts lists. STATE_COVERAGE lists no records
// workflow for Florida, California or Texas, so these pages say the app does
// not run those rules (hoaDoesNot) instead of listing a feature.
//
// Fixture limits, stated on the pages: the Florida fixture is Chapter 720 (not
// the condominium chapter). The California text holds Civ. Code §§ 5200, 5210
// and 5220 only; § 5205 (the right to inspect, redaction and copy charges) and
// Corp. Code § 8330 are not in it, so the page does not describe them
// (docs/research/2026-10-ca-rules-verification.md). The Texas fixture holds
// § 209.004 only.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_RECORDS: Guide = {
  slug: 'florida-hoa-official-records-inspection',
  path: '/guides/florida-hoa-official-records-inspection',
  state: 'FL',
  title: 'Florida HOA official records: how an owner inspects them',
  metaTitle: 'Florida HOA official records inspection rules',
  description:
    'A Florida owner can inspect HOA records within 10 business days of a written request, with no reason given. The deadline, fees and penalties, quoted.',
  eyebrow: 'Florida · Records',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Under Fla. Stat. § 720.303(5), a Florida homeowners’ association must make its official records available to a parcel owner within 10 business days of a written request. The records are kept for at least 7 years.',
    'The board can set reasonable written rules for when and how owners inspect. It cannot ask why the owner wants to look, and it cannot limit inspection to less than one 8-hour business day a month.',
    'Missing the deadline has a price. A certified-mail request creates a presumption of willful failure, and the owner can claim minimum damages of $50 a day for up to 10 days.',
    'This is a plain-language guide to one subsection of Chapter 720, not legal advice. Condominiums fall under a different chapter that this page does not cover.',
  ],
  sections: [
    {
      heading: 'The core rule: 10 business days, inside 45 miles or the county',
      body: [
        'The clock starts when the board or its designee receives a written request from the owner. The association then has 10 business days to make the records available. Unless the law or your governing documents say otherwise, the records must be kept inside Florida, and they must be open for inspection or copying within 45 miles of the community or inside the county where the association is located.',
        'The request has to be in writing, so a hallway question does not start the clock.',
      ],
      quotes: ['flRecInspect'],
    },
    {
      heading: 'Paper, screen or phone camera',
      body: [
        'The statute lets you meet the duty in more than one way. You can keep a copy of the records in the community, post them for the owner online, or let the owner view them on a screen and print on request.',
        'Owners can also bring their own device. The association has to allow a member or an authorized representative to photograph or scan the records, and it cannot charge a fee for that.',
      ],
      quotes: ['flRecDevice'],
    },
    {
      heading: 'What the board can regulate, and what it cannot',
      body: [
        'A board that gets frequent requests can adopt written rules. The statute names the subjects: how often, what time, where, how much notice, which records and the manner of inspection. Those rules have limits. The board may not ask for a proper purpose, may not demand a reason, and may not hold inspection below one 8-hour business day each month.',
      ],
      quotes: ['flRecRules'],
    },
    {
      heading: 'Copy fees',
      body: [
        'The statute lists fees for copies. The association may recover its costs, including staff time to retrieve and copy once that time passes half an hour, capped at $20 an hour. No staff time can be charged on a request that ends in 25 pages or fewer. On the association’s own photocopier the ceiling is 25 cents a page. Copies sent to an outside duplicating service are billed at actual cost with the vendor invoice behind them.',
      ],
      quotes: ['flRecFees'],
    },
    {
      heading: 'When the association is late',
      body: [
        'Lateness is not neutral. If the owner sent the request by certified mail with a return receipt, a miss past the 10 business days creates a rebuttable presumption that the association willfully failed to comply. A denied member can recover actual damages or minimum damages. Minimum damages are $50 for each calendar day, up to 10 days, counted from the 11th business day.',
        'The statute also makes it a second-degree misdemeanor for a director, board member or manager to knowingly, willfully and repeatedly violate the access rule with intent to harm.',
      ],
      quotes: ['flRecPresumption', 'flRecDamages'],
    },
    {
      heading: 'Records an owner cannot see',
      body: [
        'The access right has a list of exceptions. They include attorney-client and work-product material, information gathered while approving a lease, sale or transfer, personnel and medical records, security measures such as passwords, and personal identifying information. The personal-information exception comes up most, because owners’ phone numbers and email addresses sit in the same files as their names.',
        'The exception is narrow on names. The statute keeps the person’s name, parcel designation, mailing address and property address out of the protected group.',
      ],
      quotes: ['flRecPersonal'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of Chapter 720 only. Subsection (4) of the same section says which items count as official records, and this page does not list them. We cannot tell you whether your governing documents give owners more access than the statute does, or whether a specific document falls under an exception. Ask your attorney before you withhold anything.',
      ],
    },
  ],
  steps: [
    'Log the date and time each written records request arrives, and who received it.',
    'Count 10 business days from receipt and put the deadline on the board calendar.',
    'Decide how you will provide access: in the community, online, or on a screen with printing on request.',
    'Adopt short written inspection rules covering frequency, time, place, notice and manner, and check they allow at least one 8-hour business day a month.',
    'Do not ask the owner why they want the records.',
    'Before you hand anything over, have the person who holds the files remove protected items such as attorney-client material and personal contact details.',
    'Charge only the copy fees the statute allows, and send the owner an itemized note of what the fee covers.',
  ],
  faqs: [
    {
      q: 'How long does a Florida HOA have to produce records?',
      a: 'Ten business days after the board or its designee receives a written request from the parcel owner, under § 720.303(5)(a).',
    },
    {
      q: 'Can the board ask why an owner wants to see the records?',
      a: 'No. The board may adopt reasonable written rules, but may not require a proper purpose or any stated reason for the inspection.',
    },
    {
      q: 'Can an owner take photos of the records instead of paying for copies?',
      a: 'Yes. The association must allow a member or authorized representative to use a smartphone, tablet, portable scanner or similar device, and may not charge a fee for that use.',
    },
    {
      q: 'What happens if the association misses the deadline?',
      a: 'For a request sent by certified mail with a return receipt, there is a rebuttable presumption of willful failure. The owner can claim actual damages or minimum damages of $50 a day for up to 10 days.',
    },
    {
      q: 'Does this apply to a Florida condominium?',
      a: 'This page covers Chapter 720 only. Condominiums are governed by a different chapter, so ask your attorney.',
    },
  ],
  related: ['records-inspection-requests', 'florida-hoa-fine-hearing-committee', 'florida-hoa-estoppel-certificate-rules', 'hoa-board-meeting-minutes', 'florida-hoa-records-request-response-checklist'],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub’s records request tracking is built around Georgia’s five-business-day rule. It does not apply Florida’s 10-business-day deadline, the inspection-day floor or the damages, so keep your own request log and calendar for Florida records requests.',
}

export const CA_RECORDS: Guide = {
  slug: 'california-hoa-records-inspection-rules',
  path: '/guides/california-hoa-records-inspection-rules',
  state: 'CA',
  title: 'California HOA records: what members can inspect and how fast',
  metaTitle: 'California HOA records inspection rules',
  description:
    'California Civil Code 5200 and 5210 define association records and set 10-business-day and 30-day response times. The rules, quoted.',
  eyebrow: 'California · Records',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Civ. Code § 5200 lists what counts as an association record: financial statements, contracts, tax returns, reserve records, minutes, the membership list, the governing documents and more. Section 5210 sets how long records stay open and how quickly the association must respond.',
    'Records from the current fiscal year are due within 10 business days of the request. Records from the previous two fiscal years are due within 30 calendar days. Minutes are open permanently.',
    'Member names and addresses are handled separately. A member can opt out of sharing them under § 5220, and the opt-out stays until the member changes it.',
    'This is a plain-language guide to three sections, not legal advice. The sections on how a member makes a request and what the association may redact or charge are not covered here.',
  ],
  sections: [
    {
      heading: 'What counts as an association record',
      body: [
        'Section 5200(a) is a list, and the list is long. It reaches the financial documents the Act already requires boards to give members, interim financial statements (balance sheet, income and expense statement, budget comparison and general ledger), executed contracts that are not privileged, written board approval of vendor proposals or invoices, tax returns, reserve balances and payments from reserves, check registers, the governing documents and inspector’s reports. Interim statements have to be prepared on an accrual or modified accrual basis.',
        'Two entries deserve a closer look because boards ask about them most: meeting minutes and the membership list.',
      ],
      quotes: ['caRecDef', 'caRecMinutes', 'caRecMembers'],
    },
    {
      heading: 'Enhanced records and election materials',
      body: [
        'The statute adds two groups with their own definitions. "Enhanced association records" are the underlying paper behind the books: invoices, receipts, canceled checks, bank statements for accounts that hold assessments, credit card statements in the association’s name and reimbursement requests. "Association election materials" are returned ballots, signed voter envelopes, the voter list, proxies, the candidate registration list and the tally sheet.',
        'Election materials come with a twist. A member can look at a signed voter envelope but cannot copy it, and the association keeps election materials for one year after the vote.',
      ],
      quotes: ['caRecEnhanced', 'caRecElection'],
    },
    {
      heading: 'How long records stay open',
      body: [
        'Section 5210(a) gives the default window: the current fiscal year and the two before it. That is three fiscal years of records a member can ask to see. Minutes of member and board meetings are the exception, because they stay open permanently. For a committee that has decisionmaking authority, the statute starts the clock at January 1, 2007 and then keeps those minutes open permanently too.',
        'The statute also removes liability for failing to keep records created before January 1, 2006. If an old binder is missing, that cutoff matters.',
      ],
      quotes: ['caRecPeriod', 'caRecMinutesForever'],
    },
    {
      heading: 'The response clock: 10 business days or 30 calendar days',
      body: [
        'Once a member properly requests access, the deadline depends on the record’s age. Current-year records are due in 10 business days. Records from the two previous years get 30 calendar days. Counting is different for each, so write the two deadlines down separately instead of using one number for everything.',
        'Some records follow their own clocks. Financial documents under the statutes named in § 5210(b)(3) and minutes under § 4950 are due on the timeframe in those provisions. Minutes of a committee with decisionmaking authority are due within 15 calendar days after approval.',
      ],
      quotes: ['caRecCurrent', 'caRecPrevious'],
    },
    {
      heading: 'The membership list and the opt-out',
      body: [
        'The membership list has a built-in privacy valve. Under § 5220 a member can tell the association in writing that they prefer the alternative contact process under Corporations Code § 8330. After that, the member’s name, property address, email address and mailing address are not shared, and the opt-out holds until the member changes it.',
        'For the response time on the list itself, § 5210 sends you to § 8330 of the Corporations Code. That section is not in the text we checked, so this page does not give you a number for the list.',
      ],
      quotes: ['caRecMemberList', 'caRecOptOut'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We checked Civ. Code §§ 5200, 5210 and 5220 against the official text. We did not check the neighboring sections, so we cannot tell you how a member must submit a request, what the association may redact, or what it may charge for copies. We also cannot tell you how your bylaws handle access. Read those sections and your documents, and ask your attorney before you refuse or limit a request.',
        'The text here is the version amended by SB 410 and effective January 1, 2026. If you are looking at older guidance, compare it before you rely on it.',
      ],
    },
  ],
  steps: [
    'Log the date each member request arrives and which fiscal year the records belong to.',
    'Set two deadlines: 10 business days for the current fiscal year, 30 calendar days for the previous two.',
    'Check whether the request touches a record with its own clock, such as minutes or a financial document under another section.',
    'Pull minutes from executive sessions out of the set before you share anything.',
    'Check the membership list against the opt-outs on file before you release it.',
    'Allow a member to look at signed voter envelopes without making copies of them.',
    'Keep election materials for one year after the vote, and keep a record of what you gave the member.',
  ],
  faqs: [
    {
      q: 'How fast must a California HOA respond to a records request?',
      a: 'Current fiscal year records are due within 10 business days of the request. Records from the previous two fiscal years are due within 30 calendar days. Some records follow their own timeframes.',
    },
    {
      q: 'Are meeting minutes open to members?',
      a: 'Yes. Section 5210 says minutes of member and board meetings are subject to inspection permanently. Executive session minutes are excluded from the definition in § 5200(a)(8).',
    },
    {
      q: 'Can a member opt out of having their contact details shared?',
      a: 'Yes. A member can opt out by notifying the association in writing, and the opt-out remains in effect until the member changes it.',
    },
    {
      q: 'How long must we keep election materials?',
      a: 'One year after the date of the election, under § 5200(c).',
    },
    {
      q: 'Does this page say what we can charge for copies?',
      a: 'No. The text we checked does not cover charges or redaction. Ask your attorney and read the neighboring sections.',
    },
  ],
  related: ['records-inspection-requests', 'california-hoa-fine-hearing-and-penalty-rules', 'florida-hoa-official-records-inspection', 'hoa-board-meeting-minutes'],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub’s records request tracking is built around Georgia’s five-business-day rule. It does not apply California’s 10-business-day and 30-calendar-day deadlines or manage the membership-list opt-out, so keep your own request log for California records requests.',
}

export const TX_MANAGEMENT_CERT: Guide = {
  slug: 'texas-hoa-management-certificate',
  path: '/guides/texas-hoa-management-certificate',
  state: 'TX',
  title: 'Texas HOA management certificate: what to record and when to update it',
  metaTitle: 'Texas HOA management certificate requirements',
  description:
    'A Texas HOA must record a management certificate in each county and update it within 30 days of a change. What it holds and what a lapse costs.',
  eyebrow: 'Texas · Filings',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Tex. Prop. Code § 209.004 requires a property owners’ association to record a management certificate in each county where any part of the subdivision lies. An officer or the managing agent signs and acknowledges it.',
    'When anything in it changes, the association has 30 days from notice to record an amended certificate. Within 7 days of recording either one, it must also file the certificate electronically with the Texas Real Estate Commission.',
    'The cost of skipping it is real. A lien of an association that has not filed can be enforced only for amounts incurred after a sale to a bona fide purchaser, and owners are not liable for collection attorney’s fees or interest while the certificate is missing.',
    'This is a plain-language guide to one section, not legal advice. Condominiums are governed by a different chapter, so this page does not cover them.',
  ],
  sections: [
    {
      heading: 'What the duty is',
      body: [
        'The statute applies to a property owners’ association in a residential subdivision, and it requires a recording in every county that holds a piece of the subdivision.',
        'It must be signed and acknowledged by an officer or the managing agent.',
      ],
      quotes: ['txMcRecord'],
    },
    {
      heading: 'What goes in the certificate',
      body: [
        'Section 209.004(a) lists nine items. The first five identify the subdivision and the association: the subdivision name, the association name, the recording data for the subdivision, the recording data for the declaration and any amendments, and the association’s name and mailing address. Item 9 lets the association add other information it considers appropriate.',
        'The three items boards get wrong are the contact line, the website and the transfer fee. The contact line has to name a person or representative with a mailing address, telephone number and email address. The website line points to where your dedicatory instruments are posted. The fee line has to state the amount and describe each fee tied to a property transfer in the subdivision.',
      ],
      quotes: ['txMcContact', 'txMcTransferFee'],
    },
    {
      heading: 'Recording, indexing and the Real Estate Commission',
      body: [
        'The county clerk records the certificate in the real property records and indexes it under a fixed title. After the association files for recording, it has a second deadline: seven days to file the certificate electronically with the Texas Real Estate Commission. The Commission collects it only to make the data available to the public on a website.',
      ],
      quotes: ['txMcClerk', 'txMcTrec'],
    },
    {
      heading: 'Updating it: the 30-day clock',
      body: [
        'A certificate goes stale the day a manager changes, the mailing address moves or a transfer fee is revised. The association has until the 30th day after it has notice of the change to record an amended certificate in every county. The 7-day Commission filing applies to the amended certificate too.',
      ],
      quotes: ['txMcAmend'],
    },
    {
      heading: 'Who pays when it is not filed',
      body: [
        'Section 209.004(c) protects the association, its officers, directors, employees and agents from liability to anyone for a delay or a failure to record or file, unless the delay is wilful or the result of gross negligence. Subsections (d) and (e) then set the consequences for the association’s collections.',
        'A purchaser, lender or title company that closes without a recorded certificate is not liable to the association for what the seller owed on the transfer date or for debts that accrued earlier. The association’s lien is enforceable only for amounts incurred after the effective date of the sale. And while no certificate is recorded and filed, the owner is not liable for the association’s collection attorney’s fees or interest on the delinquent assessment.',
      ],
      quotes: ['txMcLiability', 'txMcPurchaser', 'txMcLien', 'txMcOwnerFees'],
    },
    {
      heading: 'Who counts as a bona fide purchaser',
      body: [
        'The protections run to a bona fide purchaser. The statute defines that as a person who pays valuable consideration without notice of outstanding rights of others and acts in good faith, or a third-party lender that takes a security interest under a deed of trust.',
      ],
      quotes: ['txMcBfp'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of § 209.004 only. We cannot tell you what recording data your declaration has, which counties your subdivision touches, what a county clerk charges, or whether your attorney or management company already files for you. Check your own recorded certificate before you assume it is current, and ask your attorney about any collection that may have been affected by a gap.',
      ],
    },
  ],
  steps: [
    'Find your recorded certificate in each county where the subdivision lies and read what it says today.',
    'Compare it with the nine items in § 209.004(a), including the contact line, the website and each transfer fee.',
    'Have an officer or the managing agent sign and acknowledge any new or amended certificate.',
    'Record it in every county that holds part of the subdivision.',
    'File the same certificate electronically with the Texas Real Estate Commission within 7 days of filing it for recording.',
    'Set a 30-day reminder to start whenever the manager, address, website or a transfer fee changes.',
    'Keep the recording receipts and the Commission confirmation with the association’s records.',
  ],
  faqs: [
    {
      q: 'Who signs a Texas management certificate?',
      a: 'An officer or the managing agent of the association, signed and acknowledged, under § 209.004(a).',
    },
    {
      q: 'How soon must we amend it after a change?',
      a: 'Not later than the 30th day after the association has notice of a change in any information the certificate must contain.',
    },
    {
      q: 'Do we also file with the Texas Real Estate Commission?',
      a: 'Yes. Within 7 days of filing a certificate or an amended certificate for recording, the association files it electronically with the Commission.',
    },
    {
      q: 'What happens to our lien if we never filed?',
      a: 'The lien is enforceable only for amounts incurred after the effective date of a transfer to a bona fide purchaser. Ask your attorney how that applies to a specific sale.',
    },
    {
      q: 'Can an owner be charged attorney’s fees while the certificate is missing?',
      a: 'The statute says an owner is not liable for the association’s collection attorney’s fees or for interest that accrues during the period no certificate is recorded and filed.',
    },
  ],
  related: ['texas-hoa-payment-plans-and-payment-priority', 'florida-hoa-estoppel-certificate-rules', 'hoa-board-meeting-minutes', 'georgia-hoa-assessment-lien-rules', 'texas-hoa-third-party-collections-notice'],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not prepare, record or file a management certificate, and it does not watch the 30-day and 7-day deadlines. Your officer, managing agent or attorney does that, and a calendar reminder keeps it from slipping.',
}

export const RECORDS_STATE_GUIDES: readonly Guide[] = [FL_RECORDS, CA_RECORDS, TX_MANAGEMENT_CERT]
