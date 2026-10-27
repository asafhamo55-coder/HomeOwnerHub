/**
 * BL-118: how far ahead a meeting notice must go out, per state, and
 * whether a notice sent today meets it. Pure and client-safe.
 *
 * Only statute text that is in the repo is cited
 * (scripts/fixtures/state-law, checked word for word by
 * notice-law.test.ts). Where the text is not loaded, the answer is
 * "check your bylaws", never a remembered number.
 *
 * FLORIDA — flsenate-ch720-2026.html (the Florida Senate's 2026 ch. 720):
 *   - § 720.303(2)(c)1: board meeting notices posted conspicuously at
 *     least 48 hours ahead, except in an emergency; if not posted, mailed
 *     or delivered at least 7 days ahead.
 *   - § 720.303(2)(c)2: 14 days if special assessments or parcel-use rule
 *     amendments will be considered.
 *   - § 720.306(5): members' meetings, 14 days.
 * CALIFORNIA — ca-civ-davis-stirling-2026.txt holds § 5115 (elections) but
 *   NOT § 4920 (board meeting notice) or the member-meeting notice period,
 *   so those are "check your bylaws"; an annual meeting gets the § 5115
 *   election note.
 * GEORGIA — ga-ocga-44-3-art6-2026.txt (BL-141): § 44-3-230(a) sets the
 *   MEMBERS' meeting notice: 21 days for an annual or regularly scheduled
 *   meeting, 7 days for any other. Article 6 sets nothing for board
 *   meetings, so a regular (board) or emergency meeting is "check your
 *   bylaws"; a special meeting may be the board's or the members', so
 *   under 7 days is a caution, not a failure.
 * GEORGIA CONDOMINIUMS (BL-155) — a Georgia association whose type is
 *   'condo' gets the Condominium Act instead, ga-ocga-44-3-art3-2026.txt:
 *   § 44-3-102 sets the same 21 / 7 days for MEMBERS' meetings, but its
 *   notice states "the time, place, and purpose" of every meeting (the
 *   POA Act asks for the purpose only for a special meeting). The Property
 *   Owners' Association Act does not apply to condominium associations
 *   (§ 44-3-235(b)), so a condo never gets § 44-3-230 text. Board meetings
 *   stay "check your bylaws". The quote lives in lib/ga-condo/law.ts.
 * TEXAS — § 209.0051 is not in tx-prop-209-2026.txt or the tcss excerpt:
 *   "check your bylaws". Every other state: the same.
 *
 * Days are association calendar days from today to the meeting date; the
 * 48-hour rule counts as 2 days (the same reading as
 * lib/fl-compliance/rules.ts board_48h).
 */

import { GA_CONDO_MEETING_NOTICE, isGaCondo } from '@/lib/ga-condo/law'

export interface StatuteCitation {
  /** As printed, e.g. "Fla. Stat. § 720.306(5)". */
  cite: string
  /** Verbatim from the fixture. */
  quote: string
}

export const FL_BOARD_POSTED: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(2)(c)1',
  quote:
    'Notices of all board meetings must specifically identify agenda items for the meetings and must be posted in a conspicuous place in the community at least 48 hours in advance of a meeting, except in an emergency.',
}

export const FL_BOARD_DELIVERED: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(2)(c)1',
  quote:
    'In the alternative, if notice is not posted in a conspicuous place in the community, notice of each board meeting must be mailed or delivered to each member at least 7 days before the meeting, except in an emergency.',
}

export const FL_SPECIAL_ASSESSMENT: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(2)(c)2',
  quote:
    'Written notice of any meeting at which special assessments will be considered or at which amendments to rules regarding parcel use will be considered must be mailed, delivered, or electronically transmitted to the members and parcel owners and posted conspicuously on the property or broadcast on closed-circuit cable television not less than 14 days before the meeting.',
}

export const FL_MEMBERS: StatuteCitation = {
  cite: 'Fla. Stat. § 720.306(5)',
  quote:
    'The association shall give all parcel owners and members actual notice of all membership meetings, which shall be mailed, delivered, or electronically transmitted to the members not less than 14 days prior to the meeting.',
}

export const CA_ELECTION_NOTICE: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(b)',
  quote:
    'For elections of directors and for recall elections, an association shall provide general notice of all of the following at least 30 days before the ballots are distributed:',
}

export const CA_ELECTION_MEETING: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(b)(3)',
  quote:
    'The date, time, and location of the meeting at which a quorum will be determined, if the association’s governing documents require a quorum, and at which ballots will be counted.',
}

export const CA_BALLOTS: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5115(c)',
  quote:
    'Ballots and two preaddressed envelopes with instructions on how to return ballots shall be mailed by first-class mail or delivered by the association to every member not less than 30 days prior to the deadline for voting',
}

export const GA_MEMBERS: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'Notice shall be given to each lot owner at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting and shall state the time, place, and, for any special meeting, purpose of such meeting.',
}

/** BL-155: § 44-3-102 for a Georgia condominium association (checked in lib/ga-condo/law.test.ts). */
export const GA_CONDO_MEMBERS: StatuteCitation = { cite: GA_CONDO_MEETING_NOTICE.cite, quote: GA_CONDO_MEETING_NOTICE.quote }

/** Every quote this module can show — what notice-law.test.ts checks against the fixtures. */
export const ALL_NOTICE_CITATIONS: readonly StatuteCitation[] = [
  FL_BOARD_POSTED,
  FL_BOARD_DELIVERED,
  FL_SPECIAL_ASSESSMENT,
  FL_MEMBERS,
  CA_ELECTION_NOTICE,
  CA_ELECTION_MEETING,
  CA_BALLOTS,
  GA_MEMBERS,
  GA_CONDO_MEMBERS,
]

export const CHECK_BYLAWS =
  'The notice period for this state isn’t loaded in HomeownerHub. Check your bylaws and governing documents for how far ahead to send it.'

export const NOT_LEGAL_ADVICE = 'General information, not legal advice.'

/**
 * short    — a notice sent today is too late for the rule (danger).
 * caution  — enough for one reading, short for another (warning).
 * ok       — a notice sent today meets the rule.
 * bylaws   — no loaded statute: check the bylaws.
 * exempt   — emergency meeting.
 * past     — the meeting date has passed.
 */
export type NoticeLevel = 'short' | 'caution' | 'ok' | 'bylaws' | 'exempt' | 'past'

export interface NoticeCheck {
  level: NoticeLevel
  /** Normalised two-letter state, or null when unknown. */
  state: string | null
  /** Calendar days from today to the meeting (association days); null when a date is unreadable. */
  daysAhead: number | null
  /** The minimum days the governing rule needs; null when none applies or none is loaded. */
  minDays: number | null
  /** One plain sentence for the board. */
  message: string
  citations: StatuteCitation[]
}

export interface NoticeCheckInput {
  state: string | null | undefined
  /** hoa_meeting_minutes.meeting_type: regular | special | annual | emergency (or null). */
  meetingType: string | null | undefined
  /** YYYY-MM-DD */
  meetingDate: string
  /** The association's today, YYYY-MM-DD. */
  today: string
  /** BL-155: associations.type ('hoa' | 'condo' | 'coop'); a GA 'condo' gets § 44-3-102. */
  associationType?: string | null
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

export function daysUntil(today: string, meetingDate: string): number | null {
  const a = dayMs(today)
  const b = dayMs(meetingDate)
  if (a === null || b === null) return null
  return Math.round((b - a) / 86_400_000)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function normaliseState(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : null
}

function florida(type: string | null | undefined, ahead: number): Omit<NoticeCheck, 'state' | 'daysAhead'> {
  if (type === 'emergency') {
    return {
      level: 'exempt',
      minDays: null,
      message: 'Emergency meeting: the 48-hour posting rule does not apply in an emergency.',
      citations: [FL_BOARD_POSTED],
    }
  }
  if (type === 'regular') {
    if (ahead < 2) {
      return {
        level: 'short',
        minDays: 2,
        message: `The meeting is ${plural(ahead, 'day')} away. A board meeting notice must be posted at least 48 hours ahead.`,
        citations: [FL_BOARD_POSTED, FL_BOARD_DELIVERED],
      }
    }
    if (ahead < 7) {
      return {
        level: 'caution',
        minDays: 7,
        message: `The meeting is ${plural(ahead, 'day')} away. That meets the 48-hour rule only if the notice is also posted in a conspicuous place in the community. Mailed or delivered instead, it needs 7 days. Special assessments or parcel-use rule changes on the agenda need 14 days.`,
        citations: [FL_BOARD_POSTED, FL_BOARD_DELIVERED, FL_SPECIAL_ASSESSMENT],
      }
    }
    if (ahead < 14) {
      return {
        level: 'caution',
        minDays: 7,
        message: `The meeting is ${plural(ahead, 'day')} away: enough for a board meeting, but 14 days are needed if special assessments or parcel-use rule changes are on the agenda.`,
        citations: [FL_BOARD_DELIVERED, FL_SPECIAL_ASSESSMENT],
      }
    }
    return {
      level: 'ok',
      minDays: 7,
      message: `The meeting is ${plural(ahead, 'day')} away: enough notice for a board meeting, including one that considers special assessments.`,
      citations: [FL_BOARD_DELIVERED, FL_SPECIAL_ASSESSMENT],
    }
  }
  // annual, special and unknown: the 14-day reading (as lib/fl-compliance does).
  const what = type === 'annual' ? 'An owners’ meeting' : 'A special meeting of the owners, or one that considers special assessments,'
  const cites = type === 'annual' ? [FL_MEMBERS] : [FL_MEMBERS, FL_SPECIAL_ASSESSMENT]
  if (ahead < 14) {
    return {
      level: 'short',
      minDays: 14,
      message: `The meeting is ${plural(ahead, 'day')} away. ${what} needs at least 14 days’ notice.`,
      citations: cites,
    }
  }
  return {
    level: 'ok',
    minDays: 14,
    message: `The meeting is ${plural(ahead, 'day')} away: at least the 14 days’ notice owners’ meetings need.`,
    citations: cites,
  }
}

function california(type: string | null | undefined, ahead: number): Omit<NoticeCheck, 'state' | 'daysAhead'> {
  if (type === 'annual') {
    // § 5115: general notice ≥ 30 days before ballots go out, ballots
    // ≥ 30 days before the voting deadline — 60 days in all when the
    // ballots are counted at this meeting.
    return {
      level: ahead < 60 ? 'caution' : 'bylaws',
      minDays: null,
      message:
        (ahead < 60
          ? `The meeting is ${plural(ahead, 'day')} away. If directors are elected and ballots counted at it, § 5115 needs general notice of the meeting at least 30 days before the ballots go out, and the ballots at least 30 days before the voting deadline. `
          : 'If directors are elected at this meeting, § 5115 sets the election notice and ballot deadlines. ') +
        'For the meeting notice itself, check your bylaws.',
      citations: [CA_ELECTION_NOTICE, CA_ELECTION_MEETING, CA_BALLOTS],
    }
  }
  return { level: 'bylaws', minDays: null, message: CHECK_BYLAWS, citations: [] }
}

function georgia(type: string | null | undefined, ahead: number): Omit<NoticeCheck, 'state' | 'daysAhead'> | null {
  if (type === 'annual') {
    return ahead < 21
      ? {
          level: 'short',
          minDays: 21,
          message: `The meeting is ${plural(ahead, 'day')} away. Owners must get at least 21 days’ notice of the annual meeting, with its time and place.`,
          citations: [GA_MEMBERS],
        }
      : {
          level: 'ok',
          minDays: 21,
          message: `The meeting is ${plural(ahead, 'day')} away: at least the 21 days’ notice the annual meeting needs.`,
          citations: [GA_MEMBERS],
        }
  }
  if (type === 'special') {
    return ahead < 7
      ? {
          level: 'caution',
          minDays: 7,
          message: `The meeting is ${plural(ahead, 'day')} away. If this is a special meeting of the owners, they need at least 7 days’ notice stating its time, place and purpose. For a board meeting, check your bylaws.`,
          citations: [GA_MEMBERS],
        }
      : {
          level: 'ok',
          minDays: 7,
          message: `The meeting is ${plural(ahead, 'day')} away: enough for a special meeting of the owners (7 days, with its purpose). For a board meeting, check your bylaws.`,
          citations: [GA_MEMBERS],
        }
  }
  return null
}

/** BL-155: § 44-3-102, the Condominium Act's members' meeting notice (time, place and purpose, every meeting). */
function georgiaCondo(type: string | null | undefined, ahead: number): Omit<NoticeCheck, 'state' | 'daysAhead'> | null {
  if (type === 'annual') {
    return ahead < 21
      ? {
          level: 'short',
          minDays: 21,
          message: `The meeting is ${plural(ahead, 'day')} away. Unit owners must get at least 21 days’ notice of the annual meeting, stating its time, place and purpose.`,
          citations: [GA_CONDO_MEMBERS],
        }
      : {
          level: 'ok',
          minDays: 21,
          message: `The meeting is ${plural(ahead, 'day')} away: at least the 21 days’ notice the annual meeting needs. State its time, place and purpose.`,
          citations: [GA_CONDO_MEMBERS],
        }
  }
  if (type === 'special') {
    return ahead < 7
      ? {
          level: 'caution',
          minDays: 7,
          message: `The meeting is ${plural(ahead, 'day')} away. If this is a special meeting of the unit owners, they need at least 7 days’ notice stating its time, place and purpose. For a board meeting, check your bylaws.`,
          citations: [GA_CONDO_MEMBERS],
        }
      : {
          level: 'ok',
          minDays: 7,
          message: `The meeting is ${plural(ahead, 'day')} away: enough for a special meeting of the unit owners (7 days, with its time, place and purpose). For a board meeting, check your bylaws.`,
          citations: [GA_CONDO_MEMBERS],
        }
  }
  return null
}

/** Whether a notice sent today meets the state's minimum for this meeting. */
export function checkMeetingNotice(input: NoticeCheckInput): NoticeCheck {
  const state = normaliseState(input.state)
  const ahead = daysUntil(input.today, input.meetingDate)
  if (ahead === null) {
    return { level: 'bylaws', state, daysAhead: null, minDays: null, message: CHECK_BYLAWS, citations: [] }
  }
  if (ahead < 0) {
    return {
      level: 'past',
      state,
      daysAhead: ahead,
      minDays: null,
      message: 'This meeting date has passed.',
      citations: [],
    }
  }
  const type = input.meetingType ?? null
  const rule =
    state === 'FL'
      ? florida(type, ahead)
      : state === 'CA'
        ? california(type, ahead)
        : state === 'GA'
          ? isGaCondo(state, input.associationType)
            ? georgiaCondo(type, ahead)
            : georgia(type, ahead)
          : null
  if (!rule) return { level: 'bylaws', state, daysAhead: ahead, minDays: null, message: CHECK_BYLAWS, citations: [] }
  return { ...rule, state, daysAhead: ahead }
}
