/**
 * What the quorum kit says about the law, per state. Citations only where
 * the text is in scripts/fixtures/state-law; everywhere else the kit says
 * "check your bylaws". General information, not legal advice.
 *
 * Georgia (launch state, BL-150) — every entry in `quotes` is checked word
 * for word against ga-ocga-44-3-art6-2026.txt by law.test.ts:
 *   - § 44-3-228: unless the instrument or bylaws provide otherwise, a
 *     quorum is present for the whole members' meeting if persons entitled
 *     to cast MORE THAN one-third of the votes are present at the start.
 *     The bylaws override, and the kit says so. The counter's target is
 *     GA_KIT_QUORUM_PCT (33.34%): quorumNeeded(n, 33.34) equals
 *     floor(n / 3) + 1 for every n up to 5,000 votes, and is never below it
 *     (law.test.ts).
 *   - § 44-3-224(a): joint owners. One may vote alone; if more than one
 *     acts, the vote is cast only as they unanimously agree.
 *   - § 44-3-224(b): an owner that is not a natural person must vote by
 *     proxy; a proxy is revocable only by written notice to the association
 *     (or under §§ 14-2-722 / 14-3-724), and is void if undated or if it
 *     says it is revocable without that notice. The form therefore carries
 *     a date line and the notice-only revocation sentence.
 *   - § 44-3-230(b): no annual meeting by fiscal year end → holders of 5% of
 *     the voting power (or the bylaws' figure, at most 25%) may call one.
 *   BL-159: the Nonprofit Corporation Code's § 14-3-724 is quoted word for
 *   word from ga-ocga-14-3-2026.txt: (a) proxies allowed unless the
 *   articles or bylaws prohibit or limit them, (b) electronic appointment,
 *   (c) valid 11 months unless the form says otherwise, (f) revoked by
 *   voting in person or delivering a revocation or a later proxy. It
 *   applies only to associations incorporated as Georgia nonprofit
 *   corporations, and the kit says so (check the articles). The printed
 *   form is unchanged: it already defers to § 14-3-724 for revocation.
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

import {
  GA_CO_OWNERS,
  GA_MISSED_ANNUAL,
  GA_PROXY_DATED,
  GA_QUORUM,
  electionJurisdiction,
  type StatuteCitation,
} from '@/lib/elections/law'
import { FL_QUORUM_PCT } from '@/lib/properties/statutory-roster/model'

export type { StatuteCitation }
export { GA_CO_OWNERS, GA_MISSED_ANNUAL, GA_PROXY_DATED, GA_QUORUM }

// ─── Georgia quotes (word for word; law.test.ts) ─────────────────────

export const GA_JOINT_OWNERS_UNANIMOUS: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-224(a)',
  quote:
    'However, if more than one of those persons is present, or executes a proxy, ballot, or written consent, the vote pertaining to that lot shall be cast only in accordance with their unanimous agreement unless the instrument expressly provides otherwise',
}

export const GA_ENTITY_OWNER_PROXY: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-224(b)',
  quote:
    'The votes pertaining to any lot may, and, in the case of any lot owner not a natural person or persons, shall, be cast pursuant to a proxy or proxies duly executed by or on behalf of the lot owner',
}

export const GA_PROXY_REVOCATION: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-224(b)',
  quote:
    'No such proxy shall be revocable except as provided in Code Section 14-2-722 or Code Section 14-3-724 or by written notice delivered to the association by the lot owner or by any joint owners of a lot.',
}

// ─── Georgia Nonprofit Corporation Code (BL-159; ga-ocga-14-3-2026.txt) ──
// Only for associations incorporated as Georgia nonprofit corporations.

export const GA_NONPROFIT_PROXY_ALLOWED: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-724(a)',
  quote: 'Unless the articles or bylaws prohibit or limit proxy voting, a member may vote in person or by proxy.',
}

export const GA_NONPROFIT_PROXY_ELECTRONIC: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-724(b)',
  quote:
    'A member or his or her agent or attorney in fact may appoint a proxy to vote or otherwise act for the member by signing an appointment form either personally or by an electronic transmission.',
}

export const GA_NONPROFIT_PROXY_TERM: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-724(c)',
  quote: 'An appointment is valid for 11 months unless a different period is expressly provided in the appointment form.',
}

export const GA_NONPROFIT_PROXY_REVOKED: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-724(f)',
  quote:
    'Appointment of a proxy is revoked by the person appointing the proxy: (1) Attending any meeting and voting in person; or (2) Signing and delivering to the secretary or other officer or agent authorized to tabulate proxy votes either a writing stating that the appointment of the proxy is revoked or a subsequent appointment form.',
}

export const GA_NONPROFIT_PROXY_QUOTES: readonly StatuteCitation[] = [
  GA_NONPROFIT_PROXY_ALLOWED,
  GA_NONPROFIT_PROXY_ELECTRONIC,
  GA_NONPROFIT_PROXY_TERM,
  GA_NONPROFIT_PROXY_REVOKED,
]

/** BL-159: who § 14-3-724 covers, said wherever the kit shows it. */
export const GA_NONPROFIT_PROXY_NOTE =
  'If your association is incorporated as a Georgia nonprofit corporation (most are: check your articles of incorporation), the Nonprofit Corporation Code § 14-3-724 also applies. Unless the articles or bylaws prohibit or limit proxies, an owner may vote by proxy, signed personally or sent electronically. A proxy is valid for 11 months unless the form states a different period, and it is revoked when the owner votes in person at a meeting, or delivers a written revocation or a later proxy to whoever counts the votes. An unincorporated association: check your bylaws.'

/**
 * § 44-3-228's "more than one-third", as the percent the counter applies.
 * quorumNeeded(n, 33.34) = floor(n / 3) + 1 exactly for n ≤ 5,000 votes, and
 * never less above that (on a very large roster it may ask for a vote or
 * two more, never one fewer).
 */
export const GA_KIT_QUORUM_PCT = 33.34

/** The statute's default quorum, offered as the counter's target when the bylaws are silent. */
export interface StatuteQuorum {
  /** The percent the counter uses when the board picks the statute default. */
  pct: number
  /** How the "Needed" figure reads with it, e.g. "More than one-third". */
  counterLabel: string
  /** The field hint: what the statute says, and that the bylaws control. */
  rule: string
}

export interface ProxyLawNote {
  state: string
  title: string
  /** Printed in the proxy form's footer. */
  lines: string[]
  verified: boolean
  /** The statute's default quorum, offered (never applied on its own) as the counter's target. */
  statuteQuorum: StatuteQuorum | null
  /** Board-facing notes on the kit page (never printed on the owner's form). */
  boardNotes: string[]
  /** Sentences printed in the body of the proxy form, above the signatures. */
  formClauses: string[]
  /** Word for word from the fixture (law.test.ts), under "What the statute says". */
  quotes: StatuteCitation[]
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

/** Georgia: the statute's quorum is a default; the governing documents win. */
export const GA_BYLAWS_OVERRIDE =
  'Your declaration or bylaws can set a different quorum, and if they do, they control. Use the Georgia default only when they are silent.'

export function proxyLaw(state: string | null): ProxyLawNote {
  switch (electionJurisdiction(state)) {
    case 'GA':
      return {
        state: 'GA',
        title: 'Georgia — O.C.G.A. §§ 44-3-224 and 44-3-228 (and § 14-3-724 for nonprofit corporations)',
        verified: true,
        statuteQuorum: {
          pct: GA_KIT_QUORUM_PCT,
          counterLabel: 'More than one-third',
          rule: `O.C.G.A. § 44-3-228: unless your declaration or bylaws provide otherwise, the quorum is owners entitled to cast more than one-third of the votes, present at the start of the meeting. ${GA_BYLAWS_OVERRIDE}`,
        },
        requiresTimeAndPlace: false,
        substitutionClause: false,
        detachableDirections: false,
        boardNotes: [
          GA_BYLAWS_OVERRIDE,
          'Once a quorum is present at the start, Georgia’s Act treats it as present for the whole meeting, so count the room before you begin.',
          'A proxy must be dated, and it can be revoked only by written notice delivered to the association. Set aside any proxy that isn’t dated, or that says it can be revoked without that notice: Georgia law makes it void.',
          'A home owned by a company, trust or other entity votes by proxy, signed on the owner’s behalf.',
          'If a home has more than one owner and more than one of them votes or signs, the home’s vote counts only as they all agree, unless your declaration says otherwise. One owner acting alone casts the home’s vote unless another objects at once.',
          'If no annual meeting is held by the last day of the fiscal year, owners holding at least 5% of the voting power (or the figure in your articles or bylaws, never more than 25%) may call one with a signed, dated written demand to an officer.',
          GA_NONPROFIT_PROXY_NOTE,
        ],
        formClauses: [
          'Date this proxy on the signature line below. An undated proxy is void.',
          'This proxy may be revoked only by written notice delivered to the association by the owner(s) of the home, or as Georgia Code § 14-2-722 or § 14-3-724 provides.',
          'If more than one owner of the home signs, the home’s vote is cast only as all signing owners agree, unless the declaration provides otherwise.',
          'An owner that is a company, trust or other entity must vote by proxy: its authorized representative signs for it.',
        ],
        quotes: [
          GA_QUORUM,
          GA_PROXY_DATED,
          GA_PROXY_REVOCATION,
          GA_ENTITY_OWNER_PROXY,
          GA_CO_OWNERS,
          GA_JOINT_OWNERS_UNANIMOUS,
          GA_MISSED_ANNUAL,
          ...GA_NONPROFIT_PROXY_QUOTES,
        ],
        lines: [
          '§ 44-3-228: unless your declaration or bylaws provide otherwise, a quorum is present for the whole meeting if owners entitled to cast more than one-third of the votes are present at the start.',
          '§ 44-3-224(b): a proxy is void if it isn’t dated, or if it says it can be revoked without written notice to the association. An owner that isn’t a person must vote by proxy.',
          CHECK_BYLAWS,
        ],
      }
    case 'FL':
      return {
        state: 'FL',
        title: 'Florida — Fla. Stat. § 720.306',
        verified: true,
        statuteQuorum: {
          pct: FL_QUORUM_PCT,
          counterLabel: `${FL_QUORUM_PCT}%`,
          rule: `Fla. Stat. § 720.306(1)(a) sets ${FL_QUORUM_PCT}% unless your bylaws set a lower number.`,
        },
        boardNotes: [],
        formClauses: [],
        quotes: [],
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
        statuteQuorum: null,
        boardNotes: [],
        formClauses: [],
        quotes: [],
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
        state: state?.trim().toUpperCase() || '',
        title: 'Your governing documents',
        verified: false,
        statuteQuorum: null,
        boardNotes: [],
        formClauses: [],
        quotes: [],
        requiresTimeAndPlace: false,
        substitutionClause: false,
        detachableDirections: false,
        lines: ['HomeownerHub doesn’t hold verified proxy rules for your state.', CHECK_BYLAWS],
      }
  }
}

/** Every quote the quorum kit can show: what law.test.ts checks word for word. */
export const ALL_QUORUM_CITATIONS: readonly StatuteCitation[] = [
  GA_QUORUM,
  GA_PROXY_DATED,
  GA_PROXY_REVOCATION,
  GA_ENTITY_OWNER_PROXY,
  GA_CO_OWNERS,
  GA_JOINT_OWNERS_UNANIMOUS,
  GA_MISSED_ANNUAL,
  ...GA_NONPROFIT_PROXY_QUOTES,
]
