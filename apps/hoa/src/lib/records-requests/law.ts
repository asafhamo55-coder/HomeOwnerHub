/**
 * BL-123 (3): the owner records-request deadline. Pure, client-safe and
 * dependency-free: packages/jobs (the daily digest) imports this file by
 * relative path, like lib/arc-review/clock.ts, so no `@/` imports here.
 *
 * Only statute text that is in the repo is cited (scripts/fixtures/state-law,
 * checked word for word by law.test.ts). Where the text is not loaded the
 * answer is "check your bylaws", never a remembered number.
 *
 * FLORIDA — flsenate-ch720-2026.html, § 720.303(5)(a): official records
 *   available "within 10 business days after receipt by the board or its
 *   designee of a written request"; (c): minimum damages of $50 per
 *   calendar day from the 11th business day.
 * CALIFORNIA — ca-civ-davis-stirling-2026.txt, § 5210(b): current fiscal
 *   year records within 10 business days of receipt; the previous two
 *   fiscal years within 30 calendar days. Minutes ((b)(4) → § 4950(a)) and
 *   the membership list ((b)(6) → Corp. Code § 8330) point at text that is
 *   NOT loaded, so those are "check your bylaws".
 * TEXAS — § 209.005 is not in tx-prop-209-2026.txt or the tcss excerpt:
 *   "check your bylaws".
 * GEORGIA (BL-152) — ga-ocga-14-3-2026.txt, the Nonprofit Corporation
 *   Code, for an association incorporated as a Georgia nonprofit
 *   corporation (§ 44-3-231(d) in the Article 6 snapshot says what to keep
 *   but sets no time). § 14-3-1602(b), (c): a member may inspect and copy
 *   on written notice given "at least five business days before" the day
 *   they want to, so the date shown is the earliest such day. Records in
 *   § 14-3-1602(a) need only the notice; those in (c) (board minutes,
 *   accounting records, the membership list) also need a good-faith,
 *   proper purpose described "with reasonable particularity" ((d)).
 *   Contracts and "something else" are not named: no date, the categories
 *   are shown. Every other state: "check your bylaws".
 *
 * Business days skip Saturdays and Sundays only. Public holidays are not
 * skipped, so the date shown can be a day or two EARLIER than the legal
 * one, never later. The day the request is received is not counted.
 *
 * STORAGE. tickets.records_due_at (migration 0066) holds the due DAY at
 * 17:00 UTC (dueInstant). Its UTC date part is the due day in every US
 * time zone, so readers take `.slice(0, 10)` and need no zone.
 */

// ─── The request ────────────────────────────────────────────────────

export const RECORDS_CATEGORY = 'records_request'

/** What the writes return while RECORDS_REQUESTS_LIVE is off. */
export const RECORDS_NOT_LIVE = 'Records requests aren’t available yet.'

export type RecordsKind = 'owner_list' | 'financial' | 'minutes' | 'contracts' | 'governing' | 'other'
export type RecordsPeriod = 'current' | 'prior' | 'both'
export type RecordsFormat = 'inspect' | 'electronic' | 'paper'

export const RECORDS_KINDS: ReadonlyArray<{ value: RecordsKind; label: string }> = [
  { value: 'financial', label: 'Financial records (budgets, statements, bank records)' },
  { value: 'minutes', label: 'Meeting minutes' },
  { value: 'owner_list', label: 'Owner list (membership roster)' },
  { value: 'contracts', label: 'Contracts and invoices' },
  { value: 'governing', label: 'Governing documents (declaration, bylaws, rules)' },
  { value: 'other', label: 'Something else' },
]

export const RECORDS_PERIODS: ReadonlyArray<{ value: RecordsPeriod; label: string }> = [
  { value: 'current', label: 'This fiscal year' },
  { value: 'prior', label: 'Earlier years' },
  { value: 'both', label: 'Both, or not sure' },
]

export const RECORDS_FORMATS: ReadonlyArray<{ value: RecordsFormat; label: string }> = [
  { value: 'electronic', label: 'Electronic copies' },
  { value: 'inspect', label: 'Inspect in person' },
  { value: 'paper', label: 'Paper copies' },
]

function labelOf<T extends string>(list: ReadonlyArray<{ value: T; label: string }>, v: T): string {
  return list.find((x) => x.value === v)?.label ?? v
}

export const KIND_SHORT: Record<RecordsKind, string> = {
  owner_list: 'Owner list',
  financial: 'Financial records',
  minutes: 'Meeting minutes',
  contracts: 'Contracts and invoices',
  governing: 'Governing documents',
  other: 'Other records',
}

export interface RecordsRequestFields {
  kind: RecordsKind
  period: RecordsPeriod
  format: RecordsFormat
  details: string
}

const KIND_LINE = 'Records requested: '
const PERIOD_LINE = 'Years: '
const FORMAT_LINE = 'Preferred format: '

/** The ticket subject and description a records request is filed as. */
export function composeRecordsRequest(f: RecordsRequestFields): { subject: string; description: string } {
  return {
    subject: `Records request: ${KIND_SHORT[f.kind]}`,
    description: [
      `${KIND_LINE}${labelOf(RECORDS_KINDS, f.kind)}`,
      `${PERIOD_LINE}${labelOf(RECORDS_PERIODS, f.period)}`,
      `${FORMAT_LINE}${labelOf(RECORDS_FORMATS, f.format)}`,
      '',
      f.details.trim(),
    ].join('\n'),
  }
}

/** Reads back what composeRecordsRequest wrote. Unknown labels → null fields (never a guess). */
export function parseRecordsRequest(description: string): {
  kind: RecordsKind | null
  period: RecordsPeriod | null
  format: RecordsFormat | null
} {
  const lines = description.split('\n')
  const pick = <T extends string>(prefix: string, list: ReadonlyArray<{ value: T; label: string }>): T | null => {
    const line = lines.find((l) => l.startsWith(prefix))
    if (!line) return null
    const label = line.slice(prefix.length).trim()
    return list.find((x) => x.label === label)?.value ?? null
  }
  return {
    kind: pick(KIND_LINE, RECORDS_KINDS),
    period: pick(PERIOD_LINE, RECORDS_PERIODS),
    format: pick(FORMAT_LINE, RECORDS_FORMATS),
  }
}

// ─── Citations ──────────────────────────────────────────────────────

export interface StatuteCitation {
  cite: string
  /** Verbatim from the fixture. */
  quote: string
}

export const FL_RECORDS_ACCESS: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(5)(a)',
  quote:
    'the official records must be maintained within this state for at least 7 years and be made available to a parcel owner for inspection or photocopying within 45 miles of the community or within the county in which the association is located within 10 business days after receipt by the board or its designee of a written request from the parcel owner.',
}

export const FL_RECORDS_DAMAGES: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(5)(c)',
  quote:
    'The minimum damages are to be $50 per calendar day up to 10 days, the calculation to begin on the 11th business day after receipt of the written request.',
}

export const CA_RECORDS_INTRO: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5210(b)',
  quote:
    'When a member properly requests access to association records, access to the requested records shall be granted within the following time periods:',
}

export const CA_RECORDS_CURRENT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5210(b)(1)',
  quote:
    'Association records prepared during the current fiscal year, within 10 business days following the association’s receipt of the request.',
}

export const CA_RECORDS_PRIOR: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5210(b)(2)',
  quote:
    'Association records prepared during the previous two fiscal years, within 30 calendar days following the association’s receipt of the request.',
}

export const CA_RECORDS_MINUTES: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5210(b)(4)',
  quote: 'Minutes of member and board meetings, within the timeframe specified in subdivision (a) of Section 4950.',
}

export const CA_RECORDS_MEMBERSHIP: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5210(b)(6)',
  quote: 'Membership list, within the timeframe specified in Section 8330 of the Corporations Code.',
}

// Georgia, O.C.G.A. § 14-3-1602 (ga-ocga-14-3-2026.txt).

export const GA_RECORDS_KEPT: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)',
  quote: 'A corporation shall keep a copy of the following records:',
}
export const GA_RECORDS_ARTICLES: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(1)',
  quote: 'Its articles or restated articles of incorporation and all amendments to them currently in effect;',
}
export const GA_RECORDS_BYLAWS: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(2)',
  quote: 'Its bylaws or restated bylaws and all amendments to them currently in effect;',
}
export const GA_RECORDS_MEMBER_MINUTES: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(5)',
  quote:
    'The minutes of all meetings of members, executed waivers of notice of meetings, and executed consents, delivered in writing or by electronic transmission, evidencing all actions taken or approved by the members without a meeting, for the past three years;',
}
export const GA_RECORDS_COMMUNICATIONS: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(6)',
  quote:
    'All communications in writing or by electronic transmission to members generally within the past three years, including the financial statements furnished for the past three years under Code Section 14-3-1620;',
}
export const GA_RECORDS_OFFICERS: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(7)',
  quote: 'A list of the names and business or home addresses of its current directors and officers; and',
}
export const GA_RECORDS_REGISTRATION: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(a)(8)',
  quote: 'Its most recent annual registration delivered to the Secretary of State under Code Section 14-3-1622.',
}
export const GA_RECORDS_ON_NOTICE: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(b)',
  quote:
    'A member is entitled to inspect and copy, at a reasonable time and location specified by the corporation, any of the records of the corporation described in subsection (a) of this Code section if the member gives the corporation written notice or a written demand at least five business days before the date on which the member wishes to inspect and copy.',
}
export const GA_RECORDS_WITH_PURPOSE: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(c)',
  quote:
    'A member is entitled to inspect and copy, at a reasonable time and reasonable location specified by the corporation, any of the following records of the corporation if the member meets the requirements of subsection (d) of this Code section and gives the corporation written notice at least five business days before the date on which the member wishes to inspect and copy:',
}
export const GA_RECORDS_BOARD_MINUTES: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(c)(1)',
  quote:
    'Excerpts from minutes of any meeting of the board of directors, records of any action of a committee of the board of directors while acting in place of the board of directors on behalf of the corporation, minutes of any meeting of the members, and records of action taken by the members or the board of directors without a meeting, to the extent not subject to inspection under subsection (a) of this Code section;',
}
export const GA_RECORDS_ACCOUNTING: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(c)(2)',
  quote: 'Accounting records of the corporation; and',
}
export const GA_RECORDS_MEMBERSHIP_LIST: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(c)(3)',
  quote: 'Subject to Code Section 14-3-1605, the membership list.',
}
export const GA_RECORDS_CONDITIONS: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(d)',
  quote: 'A member may inspect and copy the records identified in subsection (c) of this Code section only if:',
}
export const GA_RECORDS_GOOD_FAITH: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(d)(1)',
  quote:
    'The member’s demand is made in good faith and for a proper purpose that is reasonably relevant to the member’s legitimate interest as a member;',
}
export const GA_RECORDS_PARTICULARITY: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(d)(2)',
  quote: 'The member describes with reasonable particularity the purpose and the records the member desires to inspect;',
}
export const GA_RECORDS_CONNECTED: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(d)(3)',
  quote: 'The records are directly connected with this purpose; and',
}
export const GA_RECORDS_STATED_USE: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(d)(4)',
  quote: 'The records are to be used only for the stated purpose.',
}
export const GA_RECORDS_RESTRICTIONS: StatuteCitation = {
  cite: 'O.C.G.A. § 14-3-1602(e)',
  quote:
    'The corporation may impose reasonable restrictions on the confidentiality, use, or distribution of the records described in subsection (c) of this Code section.',
}

/** § 14-3-1602(b), (c): business days of written notice before the member inspects (law.test.ts checks the words). */
export const GA_RECORDS_NOTICE_BUSINESS_DAYS = 5

/** /tickets/records, Georgia: which records need only notice and which also need a stated purpose. */
export const GA_RECORDS_CATEGORIES = {
  onNotice: {
    title: 'On five business days’ written notice',
    rule: GA_RECORDS_ON_NOTICE,
    records: [
      GA_RECORDS_ARTICLES,
      GA_RECORDS_BYLAWS,
      GA_RECORDS_MEMBER_MINUTES,
      GA_RECORDS_COMMUNICATIONS,
      GA_RECORDS_OFFICERS,
      GA_RECORDS_REGISTRATION,
    ],
  },
  withPurpose: {
    title: 'Also needs a proper purpose, described with reasonable particularity',
    rule: GA_RECORDS_WITH_PURPOSE,
    records: [GA_RECORDS_BOARD_MINUTES, GA_RECORDS_ACCOUNTING, GA_RECORDS_MEMBERSHIP_LIST],
    conditions: [GA_RECORDS_CONDITIONS, GA_RECORDS_GOOD_FAITH, GA_RECORDS_PARTICULARITY, GA_RECORDS_CONNECTED, GA_RECORDS_STATED_USE],
    restrictions: GA_RECORDS_RESTRICTIONS,
  },
} as const

/** Every quote this module can show — what law.test.ts checks against the fixtures. */
export const ALL_RECORDS_CITATIONS: readonly StatuteCitation[] = [
  FL_RECORDS_ACCESS,
  FL_RECORDS_DAMAGES,
  CA_RECORDS_INTRO,
  CA_RECORDS_CURRENT,
  CA_RECORDS_PRIOR,
  CA_RECORDS_MINUTES,
  CA_RECORDS_MEMBERSHIP,
]

/** The Georgia quotes, checked against ga-ocga-14-3-2026.txt. */
export const GA_RECORDS_CITATIONS: readonly StatuteCitation[] = [
  GA_RECORDS_KEPT,
  GA_RECORDS_ARTICLES,
  GA_RECORDS_BYLAWS,
  GA_RECORDS_MEMBER_MINUTES,
  GA_RECORDS_COMMUNICATIONS,
  GA_RECORDS_OFFICERS,
  GA_RECORDS_REGISTRATION,
  GA_RECORDS_ON_NOTICE,
  GA_RECORDS_WITH_PURPOSE,
  GA_RECORDS_BOARD_MINUTES,
  GA_RECORDS_ACCOUNTING,
  GA_RECORDS_MEMBERSHIP_LIST,
  GA_RECORDS_CONDITIONS,
  GA_RECORDS_GOOD_FAITH,
  GA_RECORDS_PARTICULARITY,
  GA_RECORDS_CONNECTED,
  GA_RECORDS_STATED_USE,
  GA_RECORDS_RESTRICTIONS,
]

export const CHECK_BYLAWS =
  'The deadline for answering a records request in this state isn’t loaded in HomeownerHub. Check your bylaws and governing documents, and ask your association’s attorney if unsure.'

export const NOT_LEGAL_ADVICE = 'General information, not legal advice.'

export const HOLIDAY_NOTE =
  'Business days here skip weekends only. Public holidays are not skipped, so the real deadline may be a day or two later than shown — never earlier.'

// ─── Day math ───────────────────────────────────────────────────────

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

function msDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** `day` plus `n` business days (Mon–Fri; the start day is not counted). Null for a bad date. */
export function addBusinessDays(day: string, n: number): string | null {
  let ms = dayMs(day)
  if (ms === null) return null
  let left = n
  while (left > 0) {
    ms += 86_400_000
    const dow = new Date(ms).getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return msDay(ms)
}

/** `day` plus `n` calendar days. Null for a bad date. */
export function addDays(day: string, n: number): string | null {
  const ms = dayMs(day)
  return ms === null ? null : msDay(ms + n * 86_400_000)
}

/** Whole calendar days from `from` to `to`; null for a bad date. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayMs(from)
  const b = dayMs(to)
  return a === null || b === null ? null : Math.round((b - a) / 86_400_000)
}

/** The stored instant for a due day (see STORAGE above). */
export function dueInstant(dueDate: string): string {
  return `${dueDate}T17:00:00.000Z`
}

/** The due day back from tickets.records_due_at; null when unset or unreadable. */
export function dueDayOf(recordsDueAt: string | null | undefined): string | null {
  if (!recordsDueAt) return null
  const day = recordsDueAt.slice(0, 10)
  return dayMs(day) === null ? null : day
}

// ─── The deadline ───────────────────────────────────────────────────

export function normaliseState(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : null
}

export interface RecordsDeadline {
  /** YYYY-MM-DD, or null when no loaded statute sets one. */
  dueDate: string | null
  /** One plain sentence for the board. */
  message: string
  citations: StatuteCitation[]
}

export interface RecordsDeadlineInput {
  state: string | null | undefined
  kind: RecordsKind | null
  period: RecordsPeriod | null
  /** The association's day the request was received, YYYY-MM-DD. */
  receivedDay: string
}

const bylaws = (): RecordsDeadline => ({ dueDate: null, message: CHECK_BYLAWS, citations: [] })

export function recordsDeadline(input: RecordsDeadlineInput): RecordsDeadline {
  const state = normaliseState(input.state)
  if (dayMs(input.receivedDay) === null) return bylaws()

  if (state === 'FL') {
    return {
      dueDate: addBusinessDays(input.receivedDay, 10),
      message:
        'Florida: make the records available within 10 business days of receiving the written request. Minimum damages of $50 a day start on the 11th business day.',
      citations: [FL_RECORDS_ACCESS, FL_RECORDS_DAMAGES],
    }
  }

  if (state === 'CA') {
    if (input.kind === 'owner_list') {
      return {
        dueDate: null,
        message:
          'California: the membership list follows Corporations Code § 8330, which isn’t loaded in HomeownerHub. Check your bylaws and ask your attorney for the deadline.',
        citations: [CA_RECORDS_INTRO, CA_RECORDS_MEMBERSHIP],
      }
    }
    if (input.kind === 'minutes') {
      return {
        dueDate: null,
        message:
          'California: minutes follow Civil Code § 4950(a), which isn’t loaded in HomeownerHub. Check your bylaws and ask your attorney for the deadline.',
        citations: [CA_RECORDS_INTRO, CA_RECORDS_MINUTES],
      }
    }
    if (input.period === 'prior') {
      return {
        dueDate: addDays(input.receivedDay, 30),
        message: 'California: records from the previous two fiscal years are due within 30 calendar days of receiving the request.',
        citations: [CA_RECORDS_INTRO, CA_RECORDS_PRIOR],
      }
    }
    return {
      dueDate: addBusinessDays(input.receivedDay, 10),
      message:
        input.period === 'current'
          ? 'California: records from the current fiscal year are due within 10 business days of receiving the request.'
          : 'California: current-year records are due within 10 business days, earlier years within 30 calendar days. The date shown is the earlier one.',
      citations: input.period === 'current' ? [CA_RECORDS_INTRO, CA_RECORDS_CURRENT] : [CA_RECORDS_INTRO, CA_RECORDS_CURRENT, CA_RECORDS_PRIOR],
    }
  }

  if (state === 'GA') return gaRecordsDeadline(input.kind, input.receivedDay)

  return bylaws()
}

const GA_CORP_ONLY =
  'This applies if your association is incorporated as a Georgia nonprofit corporation (most are); if it isn’t, check your bylaws.'

const GA_WHEN =
  'Georgia: an owner may inspect and copy on a date at least five business days after giving written notice, at a reasonable time and location you specify. The date shown is the earliest; be ready by then, or by the later date the owner asked for.'

function gaRecordsDeadline(kind: RecordsKind | null, receivedDay: string): RecordsDeadline {
  const due = addBusinessDays(receivedDay, GA_RECORDS_NOTICE_BUSINESS_DAYS)
  const purpose = [GA_RECORDS_WITH_PURPOSE, GA_RECORDS_PARTICULARITY, GA_RECORDS_GOOD_FAITH, GA_RECORDS_RESTRICTIONS]
  switch (kind) {
    case 'governing':
      return {
        dueDate: due,
        message: `${GA_WHEN} The articles and bylaws are on notice alone. ${GA_CORP_ONLY}`,
        citations: [GA_RECORDS_ON_NOTICE, GA_RECORDS_ARTICLES, GA_RECORDS_BYLAWS],
      }
    case 'minutes':
      return {
        dueDate: due,
        message: `${GA_WHEN} Members’ meeting minutes from the past three years are on notice alone; board minutes also need the owner to state a proper purpose with reasonable particularity. ${GA_CORP_ONLY}`,
        citations: [GA_RECORDS_ON_NOTICE, GA_RECORDS_MEMBER_MINUTES, GA_RECORDS_BOARD_MINUTES, ...purpose],
      }
    case 'financial':
      return {
        dueDate: due,
        message: `${GA_WHEN} Financial statements sent to members in the past three years are on notice alone; the accounting records also need the owner to state a proper purpose with reasonable particularity. ${GA_CORP_ONLY}`,
        citations: [GA_RECORDS_ON_NOTICE, GA_RECORDS_COMMUNICATIONS, GA_RECORDS_ACCOUNTING, ...purpose],
      }
    case 'owner_list':
      return {
        dueDate: due,
        message: `${GA_WHEN} The membership list also needs the owner to state a proper purpose with reasonable particularity, and is subject to § 14-3-1605, which isn’t loaded in HomeownerHub (ask your attorney about its limits). ${GA_CORP_ONLY}`,
        citations: [GA_RECORDS_MEMBERSHIP_LIST, ...purpose],
      }
    default:
      return {
        dueDate: null,
        message: `Georgia: § 14-3-1602 doesn’t name these records on their own. Compare the request with the two lists on this page, check your bylaws, and ask your attorney. ${GA_CORP_ONLY}`,
        citations: [GA_RECORDS_ON_NOTICE, GA_RECORDS_WITH_PURPOSE],
      }
  }
}

// ─── Chips and digest ───────────────────────────────────────────────

/** Amber at or below this many calendar days left (today included). */
export const RECORDS_DUE_SOON_DAYS = 3

/** overdue = red, due_soon = amber, on_track = neutral, none = no statutory date, done = fulfilled. */
export type RecordsChip = 'overdue' | 'due_soon' | 'on_track' | 'none' | 'done'

export function recordsChip(args: { dueDate: string | null; today: string; closed: boolean }): {
  chip: RecordsChip
  daysLeft: number | null
  label: string
} {
  if (args.closed) return { chip: 'done', daysLeft: null, label: 'Fulfilled' }
  if (!args.dueDate) return { chip: 'none', daysLeft: null, label: 'Check your bylaws' }
  const left = daysBetween(args.today, args.dueDate)
  if (left === null) return { chip: 'none', daysLeft: null, label: 'Check your bylaws' }
  if (left < 0) {
    const n = -left
    return { chip: 'overdue', daysLeft: left, label: `Overdue by ${n} day${n === 1 ? '' : 's'}` }
  }
  if (left === 0) return { chip: 'due_soon', daysLeft: 0, label: 'Due today' }
  if (left <= RECORDS_DUE_SOON_DAYS) return { chip: 'due_soon', daysLeft: left, label: `Due in ${left} day${left === 1 ? '' : 's'}` }
  return { chip: 'on_track', daysLeft: left, label: `Due in ${left} days` }
}

/** Digest counts over open requests: past the due day, and due within RECORDS_DUE_SOON_DAYS. */
export function recordsDigestCounts(
  rows: Array<{ records_due_at: string | null; status: string }>,
  today: string,
): { overdue: number; dueSoon: number } {
  let overdue = 0
  let dueSoon = 0
  for (const r of rows) {
    if (r.status === 'closed') continue
    const c = recordsChip({ dueDate: dueDayOf(r.records_due_at), today, closed: false })
    if (c.chip === 'overdue') overdue++
    else if (c.chip === 'due_soon') dueSoon++
  }
  return { overdue, dueSoon }
}
