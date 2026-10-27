/**
 * BL-164 / BL-162: Georgia owners' rights, O.C.G.A. § 43-17A-7 (SB 406,
 * § 2), in force from 2027-01-01 (SB 406 § 9(a)).
 *
 * Every quote is copied word for word from
 * scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt, and law.test.ts
 * checks each one against that file's § 43-17A-7, in order, all twelve.
 *
 * Pure and dependency-free: lib/records-requests/law.ts (which
 * packages/jobs imports by relative path) imports the (1) and (2) quotes
 * from here, so no `@/` imports.
 */

export interface OwnerRightQuote {
  cite: string
  /** Verbatim from the fixture. */
  quote: string
}

/** The day Chapter 43-17A takes effect. */
export const GA_OWNER_RIGHTS_FROM = '2027-01-01'

/** "takes effect Jan 1, 2027" — shown before GA_OWNER_RIGHTS_FROM. */
export const GA_OWNER_RIGHTS_TAKES_EFFECT = 'takes effect Jan 1, 2027'

/** True on and after 2027-01-01 (a 'YYYY-MM-DD' day in the association's zone). */
export function gaOwnerRightsInForce(today: string): boolean {
  return today >= GA_OWNER_RIGHTS_FROM
}

export const GA_OWNER_RIGHTS_INTRO: OwnerRightQuote = {
  cite: 'O.C.G.A. § 43-17A-7',
  quote: 'Owners shall have the right to:',
}

export const GA_OWNER_RIGHT_RECORDS: OwnerRightQuote = {
  cite: 'O.C.G.A. § 43-17A-7(1)',
  quote:
    "Inspect and obtain copies of owners' association records, accounting records, and other records of the owners' association upon written demand and in compliance with the laws of this state and the governing documents. Such accounting records shall be the finalized balance sheet, budget, profit and loss statements, and bank statements for the past three years;",
}

export const GA_OWNER_RIGHT_INSURANCE: OwnerRightQuote = {
  cite: 'O.C.G.A. § 43-17A-7(2)',
  quote:
    "Upon written demand to the owners' association, a copy of the owners' association certificate of insurance for all such insurance obtained by the owners' association for the benefit of the owner and that may apply to a potential claim or submitted claim;",
}

/** Where an owner uses a right in the resident portal. */
export type OwnerRightPlace = 'records' | 'insurance' | 'meetings' | 'documents' | 'dues' | 'ask_board'

export interface OwnerRight extends OwnerRightQuote {
  n: number
  /** A short plain-English heading; the quote is the law. */
  title: string
  place: OwnerRightPlace
}

export const GA_OWNER_RIGHTS: readonly OwnerRight[] = [
  { n: 1, title: 'See and copy the association’s records', place: 'records', ...GA_OWNER_RIGHT_RECORDS },
  { n: 2, title: 'Get the certificate of insurance', place: 'insurance', ...GA_OWNER_RIGHT_INSURANCE },
  {
    n: 3,
    title: 'Notice of members’ meetings',
    place: 'meetings',
    cite: 'O.C.G.A. § 43-17A-7(3)',
    quote: 'Notice of meetings of members in a fair and reasonable manner consistent with the governing documents and the laws of this state;',
  },
  {
    n: 4,
    title: 'Attend members’ meetings, held at least once a year',
    place: 'meetings',
    cite: 'O.C.G.A. § 43-17A-7(4)',
    quote:
      "Attend meetings of the members of the owners' association, which shall be called and held by the board of directors at least annually;",
  },
  {
    n: 5,
    title: 'Use the common areas',
    place: 'documents',
    cite: 'O.C.G.A. § 43-17A-7(5)',
    quote: 'Access to common areas, amenities, and common elements subject to the terms contained in the governing documents;',
  },
  {
    n: 6,
    title: 'Get to and from your own property',
    place: 'ask_board',
    cite: 'O.C.G.A. § 43-17A-7(6)',
    quote: 'Ingress, egress, and access to their individually owned property;',
  },
  {
    n: 7,
    title: 'Notice and due process before any foreclosure',
    place: 'dues',
    cite: 'O.C.G.A. § 43-17A-7(7)',
    quote:
      "Statutory notice and process requirements under the laws of this state should an owners' association proceed with foreclosure action against an individually owned property;",
  },
  {
    n: 8,
    title: 'Amend the governing documents',
    place: 'documents',
    cite: 'O.C.G.A. § 43-17A-7(8)',
    quote: 'Amend governing documents with the approval thresholds required by the laws of this state and the governing documents;',
  },
  {
    n: 9,
    title: 'Directors who act in good faith',
    place: 'meetings',
    cite: 'O.C.G.A. § 43-17A-7(9)',
    quote:
      "Expect, unless otherwise provided by the laws of this state, that a director of an owners' association board of directors shall perform his or her duties in good faith and with the degree of care an ordinary, prudent person in a like position would exercise under similar circumstances;",
  },
  {
    n: 10,
    title: 'Directors who disclose conflicts of interest',
    place: 'meetings',
    cite: 'O.C.G.A. § 43-17A-7(10)',
    quote:
      "Expect directors to disclose to the other directors on the owners' association's board of directors any conflicting interest with respect to a transaction;",
  },
  {
    n: 11,
    title: 'Decide who lives in your household',
    place: 'documents',
    cite: 'O.C.G.A. § 43-17A-7(11)',
    quote:
      "Be free from governing documents that interfere with the freedom of residents to determine the composition of their household, except that owners' associations shall have the power, subject to the laws of this state and federal law, to require that all occupants of a household be members of a single housekeeping unit, and to limit the total number of occupants permitted in each individually owned property and its fair share use of the common facilities, including parking; and",
  },
  {
    n: 12,
    title: 'Challenge discrimination',
    place: 'ask_board',
    cite: 'O.C.G.A. § 43-17A-7(12)',
    quote: "Challenge discriminatory practices by an owners' association as authorized by the laws of this state or federal law.",
  },
]

/** The records request form, preset to the insurance certificate (BL-162). */
export const INSURANCE_CERTIFICATE_REQUEST_HREF = '/resident/records/new?kind=insurance_certificate'

export interface OwnerRightLink {
  href: string
  label: string
}

/**
 * Where the owner uses each right. `recordsLive` is RECORDS_REQUESTS_LIVE:
 * while it is off the records form 404s, so the records rights point at a
 * plain request to the board instead.
 */
export function ownerRightLink(place: OwnerRightPlace, recordsLive: boolean): OwnerRightLink {
  switch (place) {
    case 'records':
      return recordsLive
        ? { href: '/resident/records/new', label: 'Request records' }
        : { href: '/resident/tickets/new', label: 'Ask the board' }
    case 'insurance':
      return { href: '/resident/insurance', label: 'Association insurance' }
    case 'meetings':
      return { href: '/resident/meetings', label: 'Meetings and minutes' }
    case 'documents':
      return { href: '/resident/documents', label: 'Governing documents' }
    case 'dues':
      return { href: '/resident/dues', label: 'Your account' }
    case 'ask_board':
      return { href: '/resident/tickets/new', label: 'Ask the board' }
  }
}

/** Every quote this module shows: what law.test.ts checks against the fixture. */
export const ALL_OWNER_RIGHTS_QUOTES: readonly OwnerRightQuote[] = [GA_OWNER_RIGHTS_INTRO, ...GA_OWNER_RIGHTS]
