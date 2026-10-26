/**
 * BL-141: what the statute text in the repo says about electing directors.
 * Pure and client-safe. Citations as text, never legal advice.
 *
 * Only statute text kept in scripts/fixtures/state-law is quoted, and
 * law.test.ts checks every quote word for word against it. Where a
 * provision is not loaded, the planner says "check your governing
 * documents" and gives no number.
 *
 * GEORGIA (launch state) — ga-ocga-44-3-art6-2026.txt, the Property
 *   Owners' Association Act (O.C.G.A. §§ 44-3-220 to 44-3-235; snapshot
 *   valid until 2027-07-01; SB 406's 2027 text adds no election rule). Article 6 governs the members' MEETING, not the
 *   election procedure:
 *   - § 44-3-230(a): members meet at least annually; 21 days' notice of an
 *     annual or regularly scheduled meeting, 7 days for any other, stating
 *     time and place (and purpose, for a special meeting).
 *   - § 44-3-230(b): no annual meeting by fiscal year end → 5% of the voting
 *     power may call it.
 *   - § 44-3-228: quorum is more than one-third of the votes present at the
 *     start, unless the instrument or bylaws say otherwise.
 *   - § 44-3-224(a)/(b): one co-owner may cast a lot's votes in person or
 *     by proxy, ballot or written consent; an undated proxy is void.
 *   - § 44-3-235(a): only property submitted to the Article.
 *   Article 6 has NO nomination procedure, secret-ballot rule, inspector,
 *   results notice or challenge window (law.test.ts checks "nominat",
 *   "secret" and "inspector" are absent) → governing documents. The Georgia
 *   Nonprofit Corporation Code (Title 14, Ch. 3), which many associations
 *   are incorporated under, is not loaded.
 * FLORIDA — flsenate-ch720-2026.html, § 720.306:
 *   - (9)(a) election by the governing documents' procedure; self-nomination
 *     at the meeting unless nominations are taken in advance; no election
 *     unless more candidates than vacancies, and then they take office
 *     regardless of quorum; plurality; 60-day challenge window.
 *   - (9)(b) a candidate delinquent on the last day to nominate may not be
 *     on the ballot (any parcel).
 *   - (2) election at or with the annual meeting; (5) 14 days' notice;
 *     (8)(b) absentee secret ballots in an inner and an outer envelope.
 * CALIFORNIA — ca-civ-davis-stirling-2026.txt, §§ 5100–5145 (official
 *   pubinfo text): secret ballot (§ 5100); acclamation (§ 5103); nominee
 *   qualifications (§ 5105); inspectors (§ 5110); the § 5115 timeline
 *   (nomination notice, general notice, ballots, quorum, reconvened
 *   meeting); count in public and results within 15 days (§ 5120);
 *   custody (§ 5125); proxies are not ballots (§ 5130); one-year challenge
 *   (§ 5145).
 * TEXAS — tcss-pr209-2026-excerpt.htm, § 209.0058 (ballots): written and
 *   signed in a board election, not for an uncontested race, secret-ballot
 *   rules with a counting observer per candidate. §§ 209.00592–.00594
 *   (election notice, nominations, tellers) and § 209.0051 (meeting notice)
 *   are NOT loaded → governing documents.
 * EVERY OTHER STATE: nothing quoted.
 */

import { GA_APPLIES } from '@/lib/dues-rates/law'
import { CA_BALLOTS, CA_ELECTION_NOTICE, FL_MEMBERS, type StatuteCitation } from '@/lib/meetings/notice-law'

export type { StatuteCitation }
export { CA_BALLOTS, CA_ELECTION_NOTICE, FL_MEMBERS, GA_APPLIES }

// ─── Georgia ─────────────────────────────────────────────────────────

export const GA_ANNUAL_MEETING: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'Meetings of the members of the association shall be held in accordance with the provisions of the association’s bylaws and in any event shall be called not less frequently than annually.',
}

export const GA_MEMBER_NOTICE: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'Notice shall be given to each lot owner at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting and shall state the time, place, and, for any special meeting, purpose of such meeting.',
}

export const GA_MISSED_ANNUAL: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-230(b)',
  quote:
    'In the event an association fails to hold an annual meeting on or before the last day of the association’s fiscal year, such meeting may be called by the holders of at least 5 percent of the voting power of the association',
}

export const GA_QUORUM: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-228',
  quote:
    'Unless the instrument or bylaws provide otherwise, a quorum shall be deemed present throughout any meeting of the members of the association if persons entitled to cast more than one-third of the votes are present at the beginning of the meeting.',
}

export const GA_CO_OWNERS: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-224(a)',
  quote:
    'Since a lot owner may be more than one person, if only one of those persons is present at a meeting of the association, or is voting by proxy, ballot, or written consent, that person shall be entitled to cast the votes pertaining to that lot.',
}

export const GA_PROXY_DATED: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-224(b)',
  quote: 'Any proxy shall be void if it is not dated or if it purports to be revocable without such notice.',
}

/** § 44-3-228's "more than one-third", as a fraction of the votes. */
export const GA_QUORUM_FRACTION = 1 / 3
/** § 44-3-230(a), in days. */
export const GA_ANNUAL_NOTICE_DAYS = 21
export const GA_OTHER_NOTICE_DAYS = 7

// ─── Florida ─────────────────────────────────────────────────────────

export const FL_BY_GOVERNING_DOCS: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote: 'Elections of directors must be conducted in accordance with the procedures set forth in the governing documents of the association.',
}

export const FL_SELF_NOMINATION: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote:
    'a member may nominate himself or herself as a candidate for the board at a meeting where the election is to be held; provided, however, that if the election process allows candidates to be nominated in advance of the meeting, the association is not required to allow nominations at the meeting.',
}

export const FL_NO_ELECTION: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote: 'An election is not required unless more candidates are nominated than vacancies exist.',
}

export const FL_SEATED_WITHOUT_QUORUM: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote:
    'If an election is not required because there are either an equal number or fewer qualified candidates than vacancies exist, and if nominations from the floor are not required pursuant to this section or the bylaws, write-in nominations are not permitted and such qualified candidates shall commence service on the board of directors, regardless of whether a quorum is attained at the annual meeting.',
}

export const FL_PLURALITY: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote: 'Except as otherwise provided in the governing documents, boards of directors must be elected by a plurality of the votes cast by eligible voters.',
}

export const FL_CHALLENGE: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(a)',
  quote: 'Any challenge to the election process must be commenced within 60 days after the election results are announced.',
}

export const FL_DELINQUENT_CANDIDATE: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(b)',
  quote:
    'A person who is delinquent in the payment of any fee, fine, or other monetary obligation to the association on the day that he or she could last nominate himself or herself or be nominated for the board may not seek election to the board, and his or her name shall not be listed on the ballot.',
}

export const FL_ANY_PARCEL: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(9)(b)',
  quote: 'means any delinquency to the association with respect to any parcel.',
}

export const FL_AT_ANNUAL_MEETING: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(2)',
  quote:
    'The election of directors, if one is required to be held, must be held at, or in conjunction with, the annual meeting or as provided in the governing documents.',
}

export const FL_ABSENTEE_ENVELOPES: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(8)(b)',
  quote:
    'If the governing documents permit voting by secret ballot by members who are not in attendance at a meeting of the members for the election of directors, such ballots must be placed in an inner envelope with no identifying markings and mailed or delivered to the association in an outer envelope bearing identifying information reflecting the name of the member, the lot or parcel for which the vote is being cast, and the signature of the lot or parcel owner casting that ballot.',
}

export const FL_ONE_BALLOT_PER_PARCEL: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(8)(b)',
  quote: 'If more than one ballot is submitted for a lot or parcel, the ballots for that lot or parcel shall be disqualified.',
}

/** § 720.306(9)(a), in days after the results are announced. */
export const FL_CHALLENGE_DAYS = 60
/** § 720.306(5), in days. */
export const FL_MEMBER_NOTICE_DAYS = 14

// ─── California ──────────────────────────────────────────────────────

export const CA_SECRET_BALLOT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5100(a)(1)',
  quote:
    'Notwithstanding any other law or provision of the governing documents, elections regarding assessments legally requiring a vote, election and removal of directors, amendments to the governing documents, or the grant of exclusive use of common area pursuant to Section 4600 shall be held by secret ballot in accordance with the procedures set forth in this article.',
}

export const CA_EVERY_FOUR_YEARS: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5100(a)(2)',
  quote:
    'An association shall hold an election for a seat on the board of directors in accordance with the procedures set forth in this article at the expiration of the corresponding director’s term and at least once every four years.',
}

export const CA_ACCLAMATION: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103',
  quote: 'the association may, but is not required to, consider the qualified candidates elected by acclamation if all of the following conditions have been met:',
}

export const CA_ACCLAMATION_LAST_ELECTION: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103(a)',
  quote: 'The association has held a regular election for the directors in the last three years.',
}

export const CA_ACCLAMATION_INITIAL: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103(b)(1)',
  quote: 'Initial notice at least 90 days before the deadline for submitting nominations provided for in subdivision (a) of Section 5115.',
}

export const CA_ACCLAMATION_REMINDER: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103(b)(2)',
  quote: 'A reminder notice between 7 and 30 days before the deadline for submitting nominations provided for in subdivision (a) of Section 5115.',
}

export const CA_ACCLAMATION_ACKNOWLEDGE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103(c)(1)',
  quote:
    'The association provides, within seven business days of receiving a nomination, a written or electronic communication acknowledging the nomination to the member who submitted the nomination.',
}

export const CA_ACCLAMATION_BOARD_VOTE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5103(e)',
  quote:
    'The association board votes to consider the qualified candidates elected by acclamation at a meeting pursuant to Article 2 (commencing with Section 4900) for which the agenda item reflects the name of each qualified candidate that will be seated by acclamation if the item is approved.',
}

export const CA_CURRENT_IN_ASSESSMENTS: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5105(c)(1)',
  quote:
    'an association may require a nominee for a board seat, and a director during their board tenure, to be current in the payment of regular and special assessments, which are consumer debts subject to validation.',
}

export const CA_NOT_FOR_FINES: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5105(d)',
  quote:
    'An association may disqualify a person from nomination for nonpayment of regular and special assessments, but may not disqualify a nominee for nonpayment of fines, fines renamed as assessments, collection charges, late charges, or costs levied by a third party.',
}

export const CA_INSPECTORS: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5110(a)',
  quote: 'The association shall select an independent third party or parties as an inspector of elections. The number of inspectors of elections shall be one or three.',
}

export const CA_INSPECTOR_NOT_DIRECTOR: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5110(b)',
  quote:
    'An independent third party may be a member, but may not be a director or a candidate for director or be related to a director or to a candidate for director.',
}

export const CA_INSPECTOR_NOT_CONTRACTOR: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5110(b)',
  quote:
    'An independent third party may not be a person, business entity, or subdivision of a business entity who is currently employed or under contract to the association for any compensable services other than serving as an inspector of elections.',
}

export const CA_NOMINATION_NOTICE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(a)',
  quote:
    'An association shall provide general notice of the procedure and deadline for submitting a nomination at least 30 days before any deadline for submitting a nomination.',
}

export const CA_CANDIDATE_LIST: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(b)(4)',
  quote: 'The list of all candidates’ names that will appear on the ballot.',
}

export const CA_NO_VOTER_ON_BALLOT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(c)',
  quote: 'In order to preserve confidentiality, a voter may not be identified by name, address, or lot, parcel, or unit number on the ballot.',
}

export const CA_TWO_ENVELOPES: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(c)(1)',
  quote:
    'The ballot itself is not signed by the voter, but is inserted into an envelope that is sealed. This envelope is inserted into a second envelope that is sealed. In the upper left-hand corner of the second envelope, the voter shall sign the voter’s name, indicate the voter’s name, and indicate the address or separate interest identifier that entitles the voter to vote.',
}

export const CA_TO_INSPECTOR: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(c)(2)',
  quote: 'The second envelope is addressed to the inspector or inspectors of elections, who will be tallying the votes.',
}

export const CA_BALLOT_COUNTS_AS_PRESENT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(d)(1)',
  quote:
    'If a quorum is required by the governing documents, each ballot received by the inspector or inspectors of elections shall be treated as a member present at a meeting for purposes of establishing a quorum.',
}

export const CA_RECONVENE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(d)(2)',
  quote:
    'the association may adjourn the meeting to a date at least 20 days after the adjourned meeting, at which time the quorum required for purposes of a reconvened meeting to elect directors shall be 20 percent of the association’s members, voting in person, by proxy, or by secret ballot.',
}

export const CA_RECONVENE_NOTICE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(d)(3)',
  quote:
    'No less than 15 days prior to the date of the reconvened meeting described in paragraph (2), the association shall provide general notice of the reconvened meeting, which shall include:',
}

export const CA_COUNT_IN_PUBLIC: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5120(a)',
  quote:
    'All votes shall be counted and tabulated by the inspector or inspectors of elections, or the designee of the inspector or inspectors of elections, in public at a properly noticed open meeting of the board or members.',
}

export const CA_RESULTS_NOTICE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5120(b)',
  quote: 'Within 15 days of the election, the board shall give general notice pursuant to Section 4045 of the tabulated results of the election.',
}

export const CA_CUSTODY: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5125',
  quote:
    'The sealed ballots, signed voter envelopes, voter list, proxies, candidate registration list, and tally sheet of votes cast by electronic secret ballot shall at all times be in the custody of the inspector or inspectors of elections or at a location designated by the inspector or inspectors until after the tabulation of the vote, and until the time allowed by Section 5145 for challenging the election has expired, at which time custody shall be transferred to the association.',
}

export const CA_PROXY_NOT_BALLOT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5130(b)',
  quote: 'Proxies shall not be construed or used in lieu of a ballot.',
}

export const CA_CHALLENGE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5145(a)',
  quote:
    'A member of an association may bring a civil action for declaratory or equitable relief for a violation of this article by the association, including, but not limited to, injunctive relief, restitution, or a combination thereof, within one year of the date that the inspector or inspectors of elections notifies the board and membership of the election results or the cause of action accrues, whichever is later.',
}

/** § 5115 / § 5103 / § 5120 day counts. */
export const CA_DAYS = {
  nominationNotice: 30,
  generalNotice: 30,
  ballots: 30,
  acclamationInitial: 90,
  acclamationReminderEarliest: 30,
  acclamationReminderLatest: 7,
  reconveneAfter: 20,
  reconveneNotice: 15,
  results: 15,
} as const
/** § 5115(d)(2): the reconvened meeting's quorum, in percent of members. */
export const CA_RECONVENE_QUORUM_PCT = 20

// ─── Texas ───────────────────────────────────────────────────────────

export const TX_WRITTEN_SIGNED: StatuteCitation = {
  cite: 'Tex. Prop. Code § 209.0058(a)(2)',
  quote: 'in an election to fill a position on the board',
}

export const TX_UNCONTESTED: StatuteCitation = {
  cite: 'Tex. Prop. Code § 209.0058(c)',
  quote: "In a property owners' association election, written and signed ballots are not required for uncontested races.",
}

export const TX_SECRET_BALLOT_RULES: StatuteCitation = {
  cite: 'Tex. Prop. Code § 209.0058(d)',
  quote: "A property owners' association may adopt rules to allow voting by secret ballot by association members.",
}

export const TX_COUNT_OBSERVER: StatuteCitation = {
  cite: 'Tex. Prop. Code § 209.0058(d)(3)',
  quote:
    'in any election for the board, each candidate may name one person to observe the counting of the ballots, provided that this does not entitle any observer to see the name of the person who cast any ballot, and that any disruptive observer may be removed.',
}

/** Every quote the election planner can show — what law.test.ts checks. */
export const ALL_ELECTION_CITATIONS: readonly StatuteCitation[] = [
  GA_APPLIES,
  GA_ANNUAL_MEETING,
  GA_MEMBER_NOTICE,
  GA_MISSED_ANNUAL,
  GA_QUORUM,
  GA_CO_OWNERS,
  GA_PROXY_DATED,
  FL_MEMBERS,
  FL_BY_GOVERNING_DOCS,
  FL_SELF_NOMINATION,
  FL_NO_ELECTION,
  FL_SEATED_WITHOUT_QUORUM,
  FL_PLURALITY,
  FL_CHALLENGE,
  FL_DELINQUENT_CANDIDATE,
  FL_ANY_PARCEL,
  FL_AT_ANNUAL_MEETING,
  FL_ABSENTEE_ENVELOPES,
  FL_ONE_BALLOT_PER_PARCEL,
  CA_SECRET_BALLOT,
  CA_EVERY_FOUR_YEARS,
  CA_ACCLAMATION,
  CA_ACCLAMATION_LAST_ELECTION,
  CA_ACCLAMATION_INITIAL,
  CA_ACCLAMATION_REMINDER,
  CA_ACCLAMATION_ACKNOWLEDGE,
  CA_ACCLAMATION_BOARD_VOTE,
  CA_CURRENT_IN_ASSESSMENTS,
  CA_NOT_FOR_FINES,
  CA_INSPECTORS,
  CA_INSPECTOR_NOT_DIRECTOR,
  CA_INSPECTOR_NOT_CONTRACTOR,
  CA_NOMINATION_NOTICE,
  CA_ELECTION_NOTICE,
  CA_CANDIDATE_LIST,
  CA_BALLOTS,
  CA_NO_VOTER_ON_BALLOT,
  CA_TWO_ENVELOPES,
  CA_TO_INSPECTOR,
  CA_BALLOT_COUNTS_AS_PRESENT,
  CA_RECONVENE,
  CA_RECONVENE_NOTICE,
  CA_COUNT_IN_PUBLIC,
  CA_RESULTS_NOTICE,
  CA_CUSTODY,
  CA_PROXY_NOT_BALLOT,
  CA_CHALLENGE,
  TX_WRITTEN_SIGNED,
  TX_UNCONTESTED,
  TX_SECRET_BALLOT_RULES,
  TX_COUNT_OBSERVER,
]

// ─── Jurisdiction and plain-language notes ───────────────────────────

export const CHECK_GOVERNING_DOCS =
  'HomeownerHub doesn’t have your state’s election rules loaded. Check your declaration, bylaws and election rules (and ask your association’s attorney) for nominations, ballots, quorum and how results are announced.'

export const NOT_LEGAL_ADVICE = 'General information, not legal advice.'

export const ELECTION_DISCLAIMER =
  'This planner is general information, not legal advice. Your governing documents and the current statute decide how your election runs. Ask your association’s attorney before relying on a date or a form.'

export type ElectionJurisdiction = 'GA' | 'FL' | 'CA' | 'TX' | 'generic'

export function electionJurisdiction(state: string | null | undefined): ElectionJurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  if (s === 'GA' || s === 'GEORGIA') return 'GA'
  if (s === 'FL' || s === 'FLORIDA') return 'FL'
  if (s === 'CA' || s === 'CALIFORNIA') return 'CA'
  if (s === 'TX' || s === 'TEXAS') return 'TX'
  return 'generic'
}

export const JURISDICTION_TITLE: Record<ElectionJurisdiction, string> = {
  GA: 'Georgia — O.C.G.A. § 44-3, Article 6',
  FL: 'Florida — Fla. Stat. § 720.306',
  CA: 'California — Civ. Code §§ 5100–5145',
  TX: 'Texas — Prop. Code § 209.0058',
  generic: 'Your governing documents',
}

export interface ElectionNote {
  tone: 'info' | 'warn'
  text: string
  citations: StatuteCitation[]
}

/** What the board should know about running this state's election, in order. */
export function electionNotes(j: ElectionJurisdiction): ElectionNote[] {
  switch (j) {
    case 'GA':
      return [
        {
          tone: 'info',
          text: 'Georgia’s Property Owners’ Association Act (as loaded) covers the members’ meeting, not the election itself. It sets no nomination procedure, no secret-ballot rule, no inspector of elections, no results notice and no challenge window. Your bylaws decide those. The Act applies only if your declaration submits the community to it.',
          citations: [GA_APPLIES],
        },
        {
          tone: 'info',
          text: 'Owners must meet at least once a year. Give every owner at least 21 days’ notice of the annual meeting (7 days for a special meeting), with the time and place, and the purpose for a special meeting.',
          citations: [GA_ANNUAL_MEETING, GA_MEMBER_NOTICE],
        },
        {
          tone: 'info',
          text: 'Unless your declaration or bylaws say otherwise, there is a quorum when owners entitled to cast more than one-third of the votes are present at the start of the meeting. Proxies count toward that.',
          citations: [GA_QUORUM],
        },
        {
          tone: 'info',
          text: 'When a home has several owners, any one of them may cast its votes, in person or by proxy, ballot or written consent. A proxy that isn’t dated is void.',
          citations: [GA_CO_OWNERS, GA_PROXY_DATED],
        },
        {
          tone: 'info',
          text: 'If the association doesn’t hold the annual meeting by the last day of its fiscal year, owners holding 5% of the votes may call it themselves.',
          citations: [GA_MISSED_ANNUAL],
        },
      ]
    case 'FL':
      return [
        {
          tone: 'info',
          text: 'Run the election by your governing documents’ procedure, at or with the annual meeting. Owners get at least 14 days’ notice of the meeting.',
          citations: [FL_BY_GOVERNING_DOCS, FL_AT_ANNUAL_MEETING, FL_MEMBERS],
        },
        {
          tone: 'info',
          text: 'Any member may nominate themselves at the meeting, unless your process takes nominations in advance.',
          citations: [FL_SELF_NOMINATION],
        },
        {
          tone: 'warn',
          text: 'A candidate who owes the association anything (a fee, fine or other charge, on any home) on the last day to nominate can’t run and isn’t listed on the ballot. Check every candidate against the ledger on that day.',
          citations: [FL_DELINQUENT_CANDIDATE, FL_ANY_PARCEL],
        },
        {
          tone: 'info',
          text: 'No election is held unless there are more candidates than seats. Then the candidates take their seats even if the meeting doesn’t reach quorum.',
          citations: [FL_NO_ELECTION, FL_SEATED_WITHOUT_QUORUM],
        },
        {
          tone: 'info',
          text: 'Unless your documents say otherwise, the candidates with the most votes win (plurality). Any challenge must start within 60 days after the results are announced.',
          citations: [FL_PLURALITY, FL_CHALLENGE],
        },
        {
          tone: 'info',
          text: 'If your documents allow absentee secret ballots, each goes in a blank inner envelope inside an outer envelope with the owner’s name, lot and signature. Two ballots for one lot are both disqualified.',
          citations: [FL_ABSENTEE_ENVELOPES, FL_ONE_BALLOT_PER_PARCEL],
        },
      ]
    case 'CA':
      return [
        {
          tone: 'info',
          text: 'Directors are elected by secret ballot, at the end of each director’s term and at least every four years.',
          citations: [CA_SECRET_BALLOT, CA_EVERY_FOUR_YEARS],
        },
        {
          tone: 'warn',
          text: 'Select one or three independent inspectors of elections. An inspector may be a member, but not a director, a candidate, a relative of either, or anyone paid by the association for other work.',
          citations: [CA_INSPECTORS, CA_INSPECTOR_NOT_DIRECTOR, CA_INSPECTOR_NOT_CONTRACTOR],
        },
        {
          tone: 'info',
          text: 'Mail each member a ballot and two pre-addressed envelopes at least 30 days before voting closes. The ballot never shows the voter’s name, address or lot. The voter signs only the outer envelope, which goes to the inspector.',
          citations: [CA_BALLOTS, CA_NO_VOTER_ON_BALLOT, CA_TWO_ENVELOPES, CA_TO_INSPECTOR],
        },
        {
          tone: 'info',
          text: 'The inspector counts the ballots in public at a properly noticed open meeting. Each ballot received counts as a member present for quorum. Proxies can’t replace a ballot.',
          citations: [CA_COUNT_IN_PUBLIC, CA_BALLOT_COUNTS_AS_PRESENT, CA_PROXY_NOT_BALLOT],
        },
        {
          tone: 'info',
          text: 'Only if your bylaws or election rules require it may a nominee be disqualified for not being current in regular and special assessments. Fines, late charges and collection costs never count.',
          citations: [CA_CURRENT_IN_ASSESSMENTS, CA_NOT_FOR_FINES],
        },
        {
          tone: 'info',
          text: 'Give general notice of the results within 15 days. The inspector keeps the ballots and envelopes until the one-year challenge period ends.',
          citations: [CA_RESULTS_NOTICE, CA_CUSTODY, CA_CHALLENGE],
        },
      ]
    case 'TX':
      return [
        {
          tone: 'info',
          text: 'A vote in a board election must be in writing and signed, unless the race is uncontested.',
          citations: [TX_WRITTEN_SIGNED, TX_UNCONTESTED],
        },
        {
          tone: 'info',
          text: 'If your association adopted secret-ballot rules, each candidate may name one person to watch the count, without seeing who cast any ballot.',
          citations: [TX_SECRET_BALLOT_RULES, TX_COUNT_OBSERVER],
        },
        {
          tone: 'info',
          text: 'Texas’s election notice, nomination and vote-counting rules (Prop. Code §§ 209.00592–209.00594) and its meeting-notice rule (§ 209.0051) aren’t loaded in HomeownerHub. Check your governing documents for the notice period and how to take nominations.',
          citations: [],
        },
      ]
    default:
      return [{ tone: 'info', text: CHECK_GOVERNING_DOCS, citations: [] }]
  }
}
