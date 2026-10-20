/**
 * What the roster page says about the law, per state. Citations as text,
 * no legal advice. Florida wording was checked against the official 2026
 * chapter 720 text (scripts/fixtures/state-law/flsenate-ch720-2026.html):
 *   - § 720.303(4)(a)7: the member roster with designated mailing
 *     addresses and parcel identifications; the property address is the
 *     designated mailing address unless the member asked otherwise.
 *   - § 720.303(5): e-mail addresses and telephone numbers are not
 *     accessible to members (a printed directory of names, parcel
 *     addresses and phone numbers is allowed, with an opt-out).
 *   - § 720.305(4): voting rights may be suspended for an obligation more
 *     than 90 days delinquent; § 720.305(5): the suspension must be
 *     approved at a properly noticed board meeting.
 *   - § 720.306(1)(a): quorum is 30% of the voting interests unless the
 *     bylaws set a lower number.
 * California wording was checked (BL-054) against the official Civil Code
 * text recorded in scripts/fixtures/state-law/ca-civ-davis-stirling-2026.txt
 * (see docs/research/2026-10-ca-rules-verification.md):
 *   - § 5200(a)(9): membership lists are association records, "not
 *     including information for members who have opted out pursuant to
 *     Section 5220"; § 5220: a member may opt out of sharing their name,
 *     property address, email address and mailing address.
 *   - § 5105(h)(1): election rules must prohibit denying a ballot to a
 *     member for any reason other than not being a member when ballots are
 *     distributed — so there is no vote suspension for unpaid assessments.
 */

export interface LawNote {
  state: string
  title: string
  lines: string[]
  verified: boolean
}

export const VERIFY_DISCLAIMER =
  'This is general information, not legal advice. Verify against your governing documents and the current statute, and ask your association’s attorney before relying on it.'

export const CONTACT_WARNING =
  'This document contains owners’ personal contact information. Keep it with the board. It must not be shared with residents unless state law requires it.'

export function ownerRosterLaw(state: string | null): LawNote | null {
  switch (state?.toUpperCase()) {
    case 'FL':
      return {
        state: 'FL',
        title: 'Florida — Fla. Stat. § 720.303',
        verified: true,
        lines: [
          '§ 720.303(4)(a)7 lists, among the official records, a current roster of all members with their designated mailing addresses and parcel identifications. The designated mailing address is the property address unless the member asked in writing for a different one.',
          '§ 720.303(5) keeps e-mail addresses and telephone numbers out of the records members may inspect. A copy for an owner’s records request should leave out the email and phone columns.',
        ],
      }
    case 'CA':
      return {
        state: 'CA',
        title: 'California — Civ. Code § 5200 et seq.',
        verified: true,
        lines: [
          'The Davis-Stirling records rules (Civ. Code § 5200 et seq.) treat the membership list — name, property address, mailing address and email address — as an association record a member may request (§ 5200(a)(9)).',
          '§ 5220 lets a member opt out of having their name, property address, email address and mailing address shared. Leave opted-out members off a copy you release to a member.',
        ],
      }
    default:
      return null
  }
}

export const RECORDS_COPY_NOTICE =
  'This copy is for giving to an owner who asked for the membership roster. It has names, property and mailing addresses only — no phone numbers, no balances. Email is left out unless your state’s records rules include it and the owner has not opted out.'

/** California § 5220, while no opt-out is stored (SHARING_OPT_OUT_STORED). */
export const CA_OPT_OUT_CHECK =
  'HomeownerHub doesn’t record California § 5220 opt-outs yet. Before you release this copy, check the written opt-outs your association has received and remove every member who opted out — their name, property address and mailing address must not be shared. No email addresses are included for that reason.'

/**
 * What the records-request copy says per state. FL and CA lines come from
 * the verified texts above. TX and GA have no verified records-access text
 * in the app (scripts/fixtures/state-law holds none), so their notes are
 * marked unverified, quote nothing, and the copy leaves out email.
 */
export function recordsCopyLaw(state: string | null): LawNote | null {
  switch (state?.toUpperCase()) {
    case 'FL':
      return {
        state: 'FL',
        title: 'Florida — Fla. Stat. § 720.303',
        verified: true,
        lines: [
          '§ 720.303(4)(a)7: the official records include a current roster of all members with their designated mailing addresses and parcel identifications. This copy shows the lot as the parcel; add the county parcel number if your roster uses it.',
          '§ 720.303(5) keeps e-mail addresses and telephone numbers out of the records members may inspect, unless the owner consented in writing. This copy leaves both out.',
        ],
      }
    case 'CA':
      return {
        state: 'CA',
        title: 'California — Civ. Code §§ 5200, 5220',
        verified: true,
        lines: [
          '§ 5200(a)(9): the membership list — name, property address, mailing address and email address — is an association record, not including information for members who opted out under § 5220.',
          '§ 5220: a member may opt out, in writing, of sharing their name, property address, email address and mailing address. The opt-out stays in effect until the member changes it.',
        ],
      }
    case 'TX':
      return {
        state: 'TX',
        title: 'Texas — Tex. Prop. Code § 209.005',
        verified: false,
        lines: [
          'Texas Property Code § 209.005 covers owners’ access to association books and records. HomeownerHub doesn’t hold verified text of it yet, so this copy leaves out email addresses. Check the statute and your dedicatory instruments before releasing owner information.',
        ],
      }
    case 'GA':
      return {
        state: 'GA',
        title: 'Georgia — O.C.G.A. Title 44, Ch. 3',
        verified: false,
        lines: [
          'HomeownerHub doesn’t hold verified Georgia records-access text yet, so this copy leaves out email addresses. Check the Georgia Property Owners’ Association Act or Condominium Act and your governing documents before releasing owner information.',
        ],
      }
    default:
      return null
  }
}

export function voterListLaw(state: string | null): LawNote | null {
  switch (state?.toUpperCase()) {
    case 'FL':
      return {
        state: 'FL',
        title: 'Florida — Fla. Stat. §§ 720.305, 720.306',
        verified: true,
        lines: [
          '§ 720.305(4) lets the association suspend the voting rights of a parcel for a fee, fine or other obligation more than 90 days delinquent. § 720.305(5) requires the suspension to be approved at a properly noticed board meeting, with written notice to the owner.',
          'This list only flags homes more than 90 days past due. It does not suspend anyone: a flagged home votes unless the board has voted the suspension.',
          'A suspended voting interest is subtracted from the total when counting a quorum. § 720.306(1)(a) sets the quorum at 30% of the voting interests unless the bylaws set a lower number.',
        ],
      }
    case 'CA':
      return {
        state: 'CA',
        title: 'California — Civ. Code § 5100 et seq.',
        verified: true,
        lines: [
          'No homes are flagged for late dues. California’s election rules (Civ. Code § 5100 et seq.) do not provide for suspending a member’s vote over unpaid assessments the way Florida’s § 720.305(4) does, so a past-due balance is shown for information only.',
          '§ 5105(h)(1) requires the election rules to prohibit denying a ballot to a member for any reason other than not being a member when ballots are distributed.',
        ],
      }
    default:
      return null
  }
}
