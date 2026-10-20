/**
 * What the quorum kit says about the law, per state. Citations only where
 * the text is in scripts/fixtures/state-law; everywhere else the kit says
 * "check your bylaws". General information, not legal advice.
 *
 * Florida — checked against flsenate-ch720-2026.html:
 *   - § 720.306(1)(a): "Unless a lower number is provided in the bylaws, the
 *     percentage of voting interests required to constitute a quorum at a
 *     meeting of the members shall be 30 percent of the total voting
 *     interests."
 *   - § 720.306(8)(a): "To be valid, a proxy must be dated, must state the
 *     date, time, and place of the meeting for which it was given, and must
 *     be signed by the authorized person who executed the proxy. A proxy is
 *     effective only for the specific meeting for which it was originally
 *     given, as the meeting may lawfully be adjourned and reconvened from
 *     time to time, and automatically expires 90 days after the date of the
 *     meeting for which it was originally given. A proxy is revocable at any
 *     time at the pleasure of the person who executes it. If the proxy form
 *     expressly so provides, any proxy holder may appoint, in writing, a
 *     substitute to act in his or her place."
 *   Chapter 720 does not define general and limited proxies for members'
 *   meetings (it mentions "limited proxy" only for developer-era votes), so
 *   the form offers both and tells the board to check its bylaws.
 *
 * California — checked against ca-civ-davis-stirling-2026.txt:
 *   - § 5130(b): proxies may not be used in lieu of a ballot; an association
 *     may use proxies if permitted or required by its bylaws.
 *   - § 5130(c): directions in a proxy for an election go on a separate,
 *     detachable page; the proxyholder casts the vote by secret ballot.
 */

import { FL_QUORUM_PCT } from '@/lib/properties/statutory-roster/model'

export interface ProxyLawNote {
  state: string
  title: string
  lines: string[]
  verified: boolean
  /** The statute's quorum figure, shown as context only (never a default). */
  statuteQuorumPct: number | null
  /** Florida: the form needs the meeting's time and place written in. */
  requiresTimeAndPlace: boolean
  /** Florida: a substitute is allowed only if the form says so. */
  substitutionClause: boolean
  /** California: election directions go on a separate, detachable page. */
  detachableDirections: boolean
}

export const CHECK_BYLAWS =
  'Check your bylaws: they say whether proxies are allowed, what form they must take, who may hold one, and what counts as a quorum.'

export const KIT_DISCLAIMER =
  'This is general information, not legal advice. Use your governing documents and the current statute, and ask your association’s attorney before relying on a form.'

export function proxyLaw(state: string | null): ProxyLawNote {
  switch (state?.toUpperCase()) {
    case 'FL':
      return {
        state: 'FL',
        title: 'Florida — Fla. Stat. § 720.306',
        verified: true,
        statuteQuorumPct: FL_QUORUM_PCT,
        requiresTimeAndPlace: true,
        substitutionClause: true,
        detachableDirections: false,
        lines: [
          `§ 720.306(1)(a): unless your bylaws set a lower number, a quorum at a members’ meeting is ${FL_QUORUM_PCT}% of the total voting interests.`,
          '§ 720.306(8)(a): to be valid, a proxy must be dated, state the date, time and place of the meeting, and be signed by the person giving it. It is good only for that meeting (and its lawful adjournments), expires 90 days after the meeting date, and can be revoked at any time.',
          'A proxy holder may appoint a substitute only if the proxy form says so; this form does.',
          CHECK_BYLAWS,
        ],
      }
    case 'CA':
      return {
        state: 'CA',
        title: 'California — Civ. Code § 5130',
        verified: true,
        statuteQuorumPct: null,
        requiresTimeAndPlace: false,
        substitutionClause: false,
        detachableDirections: true,
        lines: [
          '§ 5130(b): a proxy cannot be used in place of a ballot. Your association may use proxies only if its bylaws permit or require them.',
          '§ 5130(c): any directions on how to vote in an election go on a separate page the proxyholder can detach and keep, and the proxyholder casts the vote by secret ballot.',
          CHECK_BYLAWS,
        ],
      }
    default:
      return {
        state: state?.toUpperCase() || '',
        title: 'Your governing documents',
        verified: false,
        statuteQuorumPct: null,
        requiresTimeAndPlace: false,
        substitutionClause: false,
        detachableDirections: false,
        lines: ['HomeownerHub doesn’t hold verified proxy rules for your state.', CHECK_BYLAWS],
      }
  }
}
