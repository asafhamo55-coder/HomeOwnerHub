// SEO batch 6: two guides. CPA and attorney access for a self-managed HOA
// (professional roles, live 2026-10-27) and certified mail and statutory
// overnight delivery for Georgia collections notices (mail tracking, live
// 2026-10-27). Same truth rules as the other guides: statute text only through
// the quote bank, product claims only with an apps/hoa route and a release
// note that exist, no invented figures or customers.

import type { Guide } from './types'

const PUBLISHED = '2026-10-28'

export const CPA_ATTORNEY_ACCESS: Guide = {
  slug: 'give-hoa-cpa-attorney-limited-access',
  path: '/guides/give-hoa-cpa-attorney-limited-access',
  title: 'How a self-managed HOA gives its CPA and attorney limited access',
  metaTitle: 'Limited access for an HOA’s CPA and attorney',
  description:
    'How a self-managed HOA board can give its CPA read-only books and its attorney only the collection matters it assigns, with an end date and no shared passwords.',
  eyebrow: 'Self-managed boards · Professionals',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Your CPA needs to see the books. Your attorney needs to see the one collection file you handed over. Neither needs your whole association, and neither should use a shared board login.',
    'In HomeownerHub the board invites a CPA or an attorney from Settings → Professionals. The CPA gets read-only books with owner names only. The attorney sees only the matters the board assigns.',
    'Every invitation uses a single-use link and carries an end date, at most a year out. When the engagement ends, so does the access.',
    'Access is a convenience for the board, not a legal opinion. Your attorney decides what the law requires.',
  ],
  sections: [
    {
      heading: 'Why shared logins are the wrong answer',
      body: [
        'A volunteer board often gets a professional their records the quick way: forward a few emails, share a spreadsheet, or hand over the treasurer’s password. It works once. Then the CPA has a stale export, the attorney has a folder nobody can account for, and a former board member still has a login.',
        'Limited access fixes three things at once. The professional works from the live record, so nothing goes stale. The board decides how much to show, and for how long. And there is a record of who was invited and when the access ends.',
      ],
    },
    {
      heading: 'What a CPA needs, and only that',
      body: [
        'A CPA preparing the year-end work needs the financial statements, the ledger, who owes what, bank reconciliation status and vendor payments. They do not need an owner’s email, phone number or address to do that.',
        'In HomeownerHub the CPA role is read-only. The books are visible, owners appear by name only, and the CPA cannot post a payment or change a figure. The board still decides which numbers are right.',
      ],
    },
    {
      heading: 'What an attorney needs, and only that',
      body: [
        'An association attorney is usually engaged for a particular matter: a delinquent account, a hard violation, a records request that needs care. Give them that matter, not the association.',
        'The attorney role sees only the collections cases, violations and records requests the board assigns. Anything not assigned stays out of view. If you assign a second matter later, it appears then.',
      ],
    },
    {
      heading: 'Why the attorney should see the notice trail',
      body: [
        'In Georgia, before an association may collect or be awarded attorney’s fees, the statute requires a written notice first. If the attorney is going to pick up a collection file, the first thing they will want to see is whether that notice went out and how.',
        'This is the statute’s own text on the point. It is quoted from the SB 406 fixture, and your attorney should confirm how it applies to your account.',
      ],
      quotes: ['feeIntro', 'feeNotice1'],
    },
    {
      heading: 'Records the association must keep',
      body: [
        'Georgia’s new registration law requires an association to keep its assessment, fine, fee, lien and foreclosure records for a long time. Giving your professionals a live view makes it easier to know that the record they work from is the record you keep.',
        'The same law gives owners their own right to inspect certain records on written demand. Professional access is separate from that right. It does not widen or narrow what an owner may ask for.',
      ],
      quotes: ['regRecords', 'right1'],
    },
    {
      heading: 'Set an end date and an owner of the relationship',
      body: [
        'Pick an end date that matches the engagement: the tax season, the collection matter, or at most a year. Name one board member who manages the relationship, usually the treasurer for a CPA and the president or secretary for an attorney.',
        'Officer titles help here. If your board routes money approvals to the Treasurer, the professional can see the books while the Treasurer still approves the spending.',
      ],
    },
  ],
  steps: [
    'Decide what the professional needs: the books for a CPA, or named matters for an attorney.',
    'Open Settings → Professionals and send the invitation to the professional’s own email.',
    'Set an end date that matches the engagement and is no more than a year away.',
    'For an attorney, assign the collection cases, violations or records requests they are handling.',
    'Ask the professional to accept the single-use link within seven days.',
    'Set your officer titles, especially the Treasurer, so money approvals reach the right person.',
    'When the work ends, let the date pass or end the access early, and note it in the board minutes.',
  ],
  faqs: [
    {
      q: 'Can a CPA see owners’ contact details?',
      a: 'No. The CPA role shows owners by name only, with no email, phone or address.',
    },
    {
      q: 'Can an attorney see every owner’s account?',
      a: 'No. An attorney sees only the collections cases, violations and records requests the board assigns to them.',
    },
    {
      q: 'How long does access last?',
      a: 'Every invitation carries an end date the board sets, at most a year out. The invitation link itself is single-use and works for seven days.',
    },
    {
      q: 'Does giving access replace asking my attorney for advice?',
      a: 'No. Access lets the professional see the record. What the law requires of your association is a question for your attorney.',
    },
    {
      q: 'Can the CPA change entries in the books?',
      a: 'No. The CPA role is read-only. Corrections stay with the board.',
    },
  ],
  related: ['hoa-treasurer-duties', 'attorney-fee-notice', 'georgia-hoa-collections-notice', 'records-inspection-requests'],
  hoaDoes: [
    {
      text: 'Settings → Professionals: the board invites a CPA or an attorney by a signed, single-use link. Each invitation has an end date, at most a year out.',
      route: '/settings/professionals',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
    {
      text: 'A CPA sees the books read-only, with owner names only and no email, phone or address. An attorney sees only the collections cases, violations and records requests the board assigns.',
      route: '/settings/professionals',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
    {
      text: 'Officer titles (President, Treasurer, Secretary and others) can be set, and an optional amount above which two board members must approve a money item.',
      route: '/settings/members',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
  ],
}

export const CERTIFIED_MAIL_COLLECTIONS: Guide = {
  slug: 'certified-mail-collections-notices',
  path: '/guides/georgia-hoa-certified-mail-collections-notices',
  title: 'Georgia HOA collections: certified mail, statutory overnight delivery and when the clock starts',
  metaTitle: 'Georgia HOA certified mail and notice clocks',
  description:
    'What Georgia’s statutes say about certified mail and statutory overnight delivery in collections, how the waiting periods are worded, and what to record.',
  eyebrow: 'Georgia · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Two Georgia notices turn on certified mail or statutory overnight delivery: the written notice before attorney’s fees, and the notice before a lien may be foreclosed.',
    'The wording of the waiting periods differs. The fee notice gives the owner 30 days from receipt. The foreclosure periods run from when notice is sent.',
    'Because the words differ, a board should record how it mailed, the tracking number and the delivery date, not only the day it went to the post office.',
    'This guide quotes the statute and does not interpret it for your case. Your attorney decides how the clocks apply.',
  ],
  sections: [
    {
      heading: 'Why the delivery method matters',
      body: [
        'A collections letter is not just a reminder. In Georgia, certain notices are conditions to the next step, and the statute names the delivery method. If the method or the proof is missing, the next step can be challenged.',
        'Certified mail and statutory overnight delivery both leave a paper trail: a tracking number, a record of who signed, and a delivery date. Ordinary first-class mail leaves none of that.',
      ],
    },
    {
      heading: 'The notice before attorney’s fees',
      body: [
        'SB 406 adds a requirement that applies before an association may collect or be awarded attorney’s fees. The first item is an initial written notice by certified mail or statutory overnight delivery that identifies the outstanding fines or delinquent fees.',
        'The statute then gives the owner a period measured from receipt. Notice the word: receipt, not mailing.',
      ],
      quotes: ['feeNotice1', 'feeNotice2'],
    },
    {
      heading: 'The notice before foreclosure',
      body: [
        'Foreclosing a lien for assessments has its own notice. The text in force until the end of 2026 uses 30 days. SB 406 changes it to 60 days from January 1, 2027. In both, the waiting period is counted from when the notice is sent by certified mail or statutory overnight delivery, return receipt requested.',
        'The notice must go to the address of the lot and to any other address the owner has designated to the association in writing. Keep the owners’ designated addresses current, or a notice to the lot alone may not be enough.',
      ],
      quotes: ['foreclose30', 'foreclose60'],
    },
    {
      heading: 'What the new notice must say',
      body: [
        'From 2027, the foreclosure notice must also specify the amount due, the authorized late charges and the interest rate, and must say that payment before the sixtieth day following receipt eliminates the right of foreclosure. That sentence refers to receipt again.',
      ],
      quotes: ['noticeContents60'],
    },
    {
      heading: 'Sent versus received: record both',
      body: [
        'The statute uses both words. Some periods are counted from when notice is sent. Others from receipt. A board does not have to settle which one controls in every case to protect itself. It has to hold the evidence for both: the mailing date, the tracking number and the delivery date.',
        'Counting from the delivery day is the later date. A board that waits until the delivery date before treating a period as over will not be early under either wording. Whether that is required is a question for your attorney.',
      ],
    },
    {
      heading: 'What to record for every collections letter',
      body: ['Keep one entry per letter, in the account’s file, with these details.'],
      list: [
        'Which notice it was: the fee notice or the foreclosure notice.',
        'The method: certified mail or statutory overnight delivery, return receipt requested.',
        'The addresses used: the lot and any address the owner designated in writing.',
        'The tracking number and the date it was mailed.',
        'The delivery date, and a copy of the return receipt when it comes back.',
        'The date the waiting period ends, counted from the date you chose with your attorney.',
      ],
    },
    {
      heading: 'Mistakes boards make',
      body: [
        'The common ones are sending the notice by regular mail, sending it only to the lot when the owner has designated another address, counting from the day the letter was written, and not keeping the return receipt. Each is avoidable with a log like the one above.',
      ],
    },
  ],
  steps: [
    'Confirm with your attorney which notice you are sending and which version of the statute applies.',
    'Check the owner’s designated addresses and add every one to the mailing list.',
    'Send the notice by certified mail or statutory overnight delivery, return receipt requested.',
    'Record the method, the addresses, the tracking number and the mailing date.',
    'Record the delivery date as soon as the carrier shows it, and file the return receipt.',
    'Count the waiting period from the date you agreed with your attorney, and put the end date on the calendar.',
  ],
  faqs: [
    {
      q: 'Is certified mail required for the attorney’s-fee notice?',
      a: 'The statute’s text names certified mail or statutory overnight delivery for the initial written notice. See the quote above.',
    },
    {
      q: 'Does the 30-day fee period run from mailing or receipt?',
      a: 'The statute’s text gives the owner 30 days from the receipt of the notice. See the quote above.',
    },
    {
      q: 'Does the foreclosure waiting period run from mailing or delivery?',
      a: 'The text quoted above counts from when notice is sent. Another sentence refers to payment before the sixtieth day following receipt. Ask your attorney how both apply.',
    },
    {
      q: 'What if the owner designated another address?',
      a: 'The foreclosure text names both the address of the lot and any other address the owner designated to the association in writing.',
    },
    {
      q: 'Does the statute change on January 1, 2027?',
      a: 'The foreclosure notice period goes from 30 to 60 days under SB 406, with the revised text quoted above.',
    },
  ],
  related: ['attorney-fee-notice', 'foreclosure-threshold-2027', 'georgia-hoa-collections-notice', 'attorney-fee-notice-checklist', 'late-fee-limits', 'texas-hoa-third-party-collections-notice', 'florida-hoa-notice-of-intent-to-lien', 'california-hoa-pre-lien-notice-and-collections'],
  hoaDoes: [
    {
      text: 'On a Georgia collections letter, record how it was mailed, the tracking number and the delivery date. Fee and foreclosure clocks then count from the delivery day.',
      route: '/properties/[id]',
      release: '2026-10-27-1758-roles-payments-holidays',
    },
    {
      text: 'Collections letters are drafted for the board to approve: the Georgia attorney’s-fee notice and the notice before foreclosure. A letter that claims attorney’s fees stays blocked until the fee notice has gone out.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
  ],
}
