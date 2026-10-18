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
 * California could not be checked against the official text (leginfo
 * refused our fetch, as for W3), so it carries "verify" wording.
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
        verified: false,
        lines: [
          'The Davis-Stirling records rules (Civ. Code § 5200 et seq.) treat the membership list as an association record a member may request, and § 5220 lets a member opt out of having their information shared.',
          'We could not check these sections against the official text, so confirm them before you release a list.',
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
        verified: false,
        lines: [
          'No homes are flagged for late dues. California’s election rules (Civ. Code § 5100 et seq.) do not provide for suspending a member’s vote over unpaid assessments the way Florida’s § 720.305(4) does, so a past-due balance is shown for information only.',
          'We could not check these sections against the official text, so confirm them before the meeting.',
        ],
      }
    default:
      return null
  }
}
