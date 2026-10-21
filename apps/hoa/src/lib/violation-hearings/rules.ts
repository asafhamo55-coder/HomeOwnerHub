/**
 * BL-133: the fine hearing for a violation (the first slice of BL-030).
 * Pure, client-safe, no clock: the caller passes the association's today.
 *
 * One record per violation (violation_hearings, migration 0068, behind
 * M4_APPLIED): the resident's request, the hearing day, time and place,
 * the panel or committee (names, each marked board or member), the day the
 * notice went out, the outcome, and the findings / payment-due days.
 *
 * hearingSteps() turns the record into the state's checklist, citing only
 * statute text kept in the repo (scripts/fixtures/state-law), checked word
 * for word by rules.test.ts. A state with no loaded text gets "check your
 * governing documents" and no steps, never rules from memory.
 *
 *   FL — Fla. Stat. § 720.305(2)(b)–(f) (flsenate-ch720-2026.html):
 *        14 days' written notice; a committee of at least three members who
 *        are not officers, directors or employees (or their relatives),
 *        within 90 days of the notice; majority vote; findings within
 *        7 days; payment due at least 30 days after the findings.
 *   CA — Cal. Civ. Code § 5855(a), (b), (f), (g) as amended by AB 130
 *        (ca-civ-davis-stirling-2026.txt): 10 days' written notice of the
 *        board meeting; the notice's contents; the written decision within
 *        14 days; discipline not effective unless the board does all this.
 *
 * hearingFineFacts() is what BL-130's checkFine() reads, so the "no
 * hearing recorded" warnings resolve once a hearing that meets the rule
 * is on record (statute-drift.ts).
 *
 * No `@/` imports.
 */

import {
  CA_5855_EFFECTIVE,
  FL_RELATIVES_NOT_CHECKED,
  FL_305_COMMITTEE,
  FL_305_VOTE,
  daysBetween,
  normaliseState,
  type DriftCitation,
  type FineHearingFacts,
} from '../compliance/statute-drift'

// ─── the record ──────────────────────────────────────────────────────

export const HEARING_TABLE = 'violation_hearings'
export const HEARINGS_NOT_LIVE = 'Hearing records turn on after an update to the database. Nothing was saved.'
export const REQUEST_HEARING_RPC = 'request_violation_hearing'

export const HEARING_STATUSES = ['requested', 'scheduled', 'held', 'cancelled'] as const
export type HearingStatus = (typeof HEARING_STATUSES)[number]

export const HEARING_OUTCOMES = ['upheld', 'reduced', 'dismissed'] as const
export type HearingOutcome = (typeof HEARING_OUTCOMES)[number]

export const PANEL_ROLES = ['board', 'member'] as const
export type PanelRole = (typeof PANEL_ROLES)[number]

export interface PanelMember {
  name: string
  role: PanelRole
}

export const MAX_PANEL = 15
export const MAX_PANEL_NAME = 120
export const MAX_LOCATION = 300
export const MAX_STATEMENT = 4000

export const HEARING_STATUS_LABEL: Record<HearingStatus, string> = {
  requested: 'Requested by the owner',
  scheduled: 'Scheduled',
  held: 'Held',
  cancelled: 'Cancelled',
}

export const HEARING_OUTCOME_LABEL: Record<HearingOutcome, string> = {
  upheld: 'Fine approved',
  reduced: 'Fine approved, reduced',
  dismissed: 'Fine not approved',
}

/** The board's view of violation_hearings. Days are association days (YYYY-MM-DD). */
export interface HearingRecord {
  id: string
  violationId: string
  status: HearingStatus
  requestedAt: string | null
  residentStatement: string | null
  hearingOn: string | null
  hearingTime: string | null
  location: string | null
  panel: PanelMember[]
  noticeSentOn: string | null
  outcome: HearingOutcome | null
  decidedOn: string | null
  findingsSentOn: string | null
  paymentDueOn: string | null
}

export const HEARING_COLUMNS =
  'id, violation_id, status, requested_at, resident_statement, hearing_on, hearing_time, location, panel, notice_sent_on, outcome, decided_on, findings_sent_on, payment_due_on'

/** What the resident is shown: no panel names, no board notes. */
export const RESIDENT_HEARING_COLUMNS =
  'status, requested_at, hearing_on, hearing_time, location, notice_sent_on, outcome, decided_on, payment_due_on'

const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const asDay = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/** jsonb panel → members; anything malformed is dropped, never thrown on. */
export function parsePanel(v: unknown): PanelMember[] {
  if (!Array.isArray(v)) return []
  const out: PanelMember[] = []
  for (const m of v) {
    if (!m || typeof m !== 'object') continue
    const name = asString((m as { name?: unknown }).name)?.trim().slice(0, MAX_PANEL_NAME)
    const role = (m as { role?: unknown }).role
    if (!name || (role !== 'board' && role !== 'member')) continue
    out.push({ name, role })
  }
  return out.slice(0, MAX_PANEL)
}

export function hearingFromRow(row: Record<string, unknown>): HearingRecord | null {
  const id = asString(row.id)
  const violationId = asString(row.violation_id)
  const status = row.status
  if (!id || !violationId || !(HEARING_STATUSES as readonly unknown[]).includes(status)) return null
  const outcome = (HEARING_OUTCOMES as readonly unknown[]).includes(row.outcome) ? (row.outcome as HearingOutcome) : null
  return {
    id,
    violationId,
    status: status as HearingStatus,
    requestedAt: asString(row.requested_at),
    residentStatement: asString(row.resident_statement),
    hearingOn: asDay(row.hearing_on),
    hearingTime: asString(row.hearing_time),
    location: asString(row.location),
    panel: parsePanel(row.panel),
    noticeSentOn: asDay(row.notice_sent_on),
    outcome,
    decidedOn: asDay(row.decided_on),
    findingsSentOn: asDay(row.findings_sent_on),
    paymentDueOn: asDay(row.payment_due_on),
  }
}

/** The resident's view of their hearing. The day and place only once the board has sent the notice. */
export interface ResidentHearingView {
  status: HearingStatus
  requestedAt: string | null
  hearingOn: string | null
  hearingTime: string | null
  location: string | null
  outcome: HearingOutcome | null
  decidedOn: string | null
  paymentDueOn: string | null
}

export function residentHearingView(row: Record<string, unknown> | null): ResidentHearingView | null {
  if (!row || !(HEARING_STATUSES as readonly unknown[]).includes(row.status)) return null
  const noticed = Boolean(asDay(row.notice_sent_on))
  const status = row.status as HearingStatus
  const held = status === 'held'
  return {
    status,
    requestedAt: asString(row.requested_at),
    hearingOn: noticed || held ? asDay(row.hearing_on) : null,
    hearingTime: noticed || held ? asString(row.hearing_time) : null,
    location: noticed || held ? asString(row.location) : null,
    outcome: held && (HEARING_OUTCOMES as readonly unknown[]).includes(row.outcome) ? (row.outcome as HearingOutcome) : null,
    decidedOn: held ? asDay(row.decided_on) : null,
    paymentDueOn: held ? asDay(row.payment_due_on) : null,
  }
}

// ─── citations (verbatim from the fixtures) ──────────────────────────

const CA_FILE = 'ca-civ-davis-stirling-2026.txt'
const FL_FILE = 'flsenate-ch720-2026.html'

export const FL_305_NOTICE: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(b)',
  quote:
    'A fine or suspension levied by the board of administration may not be imposed unless the board first provides at least 14 days’ written notice of the parcel owner’s right to a hearing to the parcel owner at his or her designated mailing or e-mail address in the association’s official records and, if applicable, to any occupant, licensee, or invitee of the parcel owner, sought to be fined or suspended.',
  fixture: FL_FILE,
}
export const FL_305_NOTICE_CONTENTS: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(b)',
  quote:
    'The notice must include a description of the alleged violation; the specific action required to cure such violation, if applicable; and the hearing date, location, and access information if held by telephone or other electronic means.',
  fixture: FL_FILE,
}
export const FL_305_ATTEND: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(b)',
  quote: 'A parcel owner has the right to attend a hearing by telephone or other electronic means.',
  fixture: FL_FILE,
}
export const FL_305_FINDINGS: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(d)',
  quote:
    'Within 7 days after the hearing, the committee shall provide written notice to the parcel owner at his or her designated mailing or e-mail address in the association’s official records and, if applicable, any occupant, licensee, or invitee of the parcel owner, of the committee’s findings related to the violation, including any applicable fines or suspensions that the committee approved or rejected, and how the parcel owner or any occupant, licensee, or invitee of the parcel owner may cure the violation, if applicable, or fulfill a suspension, or the date by which a fine must be paid.',
  fixture: FL_FILE,
}
export const FL_305_CURED: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(e)',
  quote:
    'If a violation has been cured before the hearing or in the manner specified in the written notice required in paragraph (b) or paragraph (d), a fine or suspension may not be imposed.',
  fixture: FL_FILE,
}
export const FL_305_PAY_DATE: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(f)',
  quote:
    'If a violation is not cured and the proposed fine or suspension levied by the board is approved by the committee by a majority vote, the committee must set a date by which the fine must be paid, which date must be at least 30 days after delivery of the written notice required in paragraph (d).',
  fixture: FL_FILE,
}

export const CA_5855_NOTICE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(a)',
  quote:
    'When the board is to meet to consider or impose discipline upon a member, or to impose a monetary charge as a means of reimbursing the association for costs incurred by the association in the repair of damage to the common area and facilities caused by a member or the member’s guest or tenant, the board shall notify the member in writing, by either personal delivery or individual delivery pursuant to Section 4040, at least 10 days prior to the meeting.',
  fixture: CA_FILE,
}
export const CA_5855_CONTENTS: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(b)',
  quote:
    'The notification shall contain, at a minimum, the date, time, and place of the meeting, the nature of the alleged violation for which a member may be disciplined or the nature of the damage to the common area and facilities for which a monetary charge may be imposed, and a statement that the member has a right to attend and may address the board at the meeting. The board shall meet in executive session if requested by the member.',
  fixture: CA_FILE,
}
export const CA_5855_CURE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(c)',
  quote: 'A member shall have the opportunity to cure the violation prior to the meeting.',
  fixture: CA_FILE,
}
export const CA_5855_DECISION: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(f)',
  quote:
    'If the board imposes discipline on a member or imposes a monetary charge on the member for damage to the common area and facilities, the board shall provide the member with a written notification of the decision, by either personal delivery or individual delivery pursuant to Section 4040, within 14 days following the action.',
  fixture: CA_FILE,
}

/** Every quote this module shows — what rules.test.ts checks against the fixtures. */
export const ALL_HEARING_CITATIONS: readonly DriftCitation[] = [
  FL_305_NOTICE,
  FL_305_NOTICE_CONTENTS,
  FL_305_ATTEND,
  FL_305_COMMITTEE,
  FL_305_VOTE,
  FL_305_FINDINGS,
  FL_305_CURED,
  FL_305_PAY_DATE,
  CA_5855_NOTICE,
  CA_5855_CONTENTS,
  CA_5855_CURE,
  CA_5855_DECISION,
  CA_5855_EFFECTIVE,
]

export const FL_NOTICE_DAYS = 14
export const FL_HEARING_WITHIN_DAYS = 90
export const FL_COMMITTEE_MIN = 3
export const FL_FINDINGS_DAYS = 7
export const FL_PAYMENT_MIN_DAYS = 30
export const CA_NOTICE_DAYS = 10
export const CA_DECISION_DAYS = 14

export const CHECK_GOVERNING_DOCUMENTS =
  'HomeownerHub has no loaded statute text for fine hearings in your state. Check your governing documents for the notice, hearing and decision steps, and ask your association’s attorney.'

// ─── BL-140: the panel against the board roster ──────────────────────

/**
 * A name for comparison: lower case, letters and digits only, words sorted,
 * so "Smith, Jane" and "jane  smith" match. Empty when nothing is left.
 */
export function normalisePersonName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * Panel members marked as owners ('member') whose name matches someone on
 * the board roster (org_members board/admin, by profile name). FL §
 * 720.305(2)(b) bars officers, directors and employees from the committee;
 * a member marked 'board' is already counted by panelCounts().
 */
export function panelRosterConflicts(panel: readonly PanelMember[], rosterNames: readonly string[]): PanelMember[] {
  const roster = new Set(rosterNames.map(normalisePersonName).filter(Boolean))
  if (roster.size === 0) return []
  return panel.filter((p) => p.role === 'member' && roster.has(normalisePersonName(p.name)))
}

// ─── the checklist ───────────────────────────────────────────────────

export type StepState = 'done' | 'todo' | 'late' | 'problem'

export interface HearingStep {
  code: string
  title: string
  state: StepState
  /** One plain sentence: what's recorded, or what's still needed and by when. */
  detail: string
  citations: DriftCitation[]
}

export interface HearingChecklist {
  state: string | null
  steps: HearingStep[]
  /** Set when the state has no loaded rules. */
  note: string | null
}

/** YYYY-MM-DD plus n days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

export function panelCounts(panel: readonly PanelMember[]): { members: number; board: number } {
  let members = 0
  let board = 0
  for (const p of panel) {
    if (p.role === 'board') board += 1
    else members += 1
  }
  return { members, board }
}

const held = (h: HearingRecord) => h.status === 'held' && h.outcome !== null
const finePassed = (h: HearingRecord) => h.outcome === 'upheld' || h.outcome === 'reduced'

function noticeStep(h: HearingRecord, minDays: number, today: string, citations: DriftCitation[]): HearingStep {
  const title = `Written notice at least ${minDays} days before`
  if (h.noticeSentOn && h.hearingOn) {
    const gap = daysBetween(h.noticeSentOn, h.hearingOn)
    if (gap !== null && gap >= minDays) {
      return { code: 'notice', title, state: 'done', detail: `Sent ${gap} days before the hearing.`, citations }
    }
    return {
      code: 'notice',
      title,
      state: 'problem',
      detail: `Sent ${gap ?? '?'} day${gap === 1 ? '' : 's'} before the hearing, fewer than ${minDays}. Move the hearing to ${addDays(h.noticeSentOn, minDays)} or later, and send the new date.`,
      citations,
    }
  }
  if (h.noticeSentOn) return { code: 'notice', title, state: 'todo', detail: 'Sent. Set the hearing date.', citations }
  if (!h.hearingOn) return { code: 'notice', title, state: 'todo', detail: 'Set the hearing date, then send the notice.', citations }
  const by = addDays(h.hearingOn, -minDays)
  return {
    code: 'notice',
    title,
    state: today > by ? 'late' : 'todo',
    detail:
      today > by
        ? `Not sent, and the hearing is less than ${minDays} days away. Move the hearing, or it can’t support a fine.`
        : `Not sent yet. Send it by ${by}.`,
    citations,
  }
}

function decisionStep(h: HearingRecord, citations: DriftCitation[], whoDecides: string): HearingStep {
  const title = 'Hearing held and decision recorded'
  if (held(h)) {
    return {
      code: 'decision',
      title,
      state: 'done',
      detail: `${HEARING_OUTCOME_LABEL[h.outcome!]}${h.decidedOn ? ` on ${h.decidedOn}` : ''}.`,
      citations,
    }
  }
  return { code: 'decision', title, state: 'todo', detail: `Record the ${whoDecides}’s decision after the hearing.`, citations }
}

function writtenDecisionStep(
  h: HearingRecord,
  withinDays: number,
  today: string,
  title: string,
  citations: DriftCitation[],
  from: 'hearing' | 'decision',
): HearingStep {
  if (!held(h) || !h.hearingOn) return { code: 'findings', title, state: 'todo', detail: 'After the hearing.', citations }
  const due = addDays(from === 'decision' ? (h.decidedOn ?? h.hearingOn) : h.hearingOn, withinDays)
  if (h.findingsSentOn) {
    return h.findingsSentOn <= due
      ? { code: 'findings', title, state: 'done', detail: `Sent ${h.findingsSentOn}.`, citations }
      : { code: 'findings', title, state: 'problem', detail: `Sent ${h.findingsSentOn}, after the ${due} deadline.`, citations }
  }
  return {
    code: 'findings',
    title,
    state: today > due ? 'late' : 'todo',
    detail: today > due ? `Not recorded, and the ${due} deadline has passed.` : `Send it by ${due}, then record the day.`,
    citations,
  }
}

/** The state's hearing checklist for the board's violation page. */
export function hearingSteps(
  stateIn: string | null | undefined,
  h: HearingRecord,
  today: string,
  /** BL-140: board/admin names from org_members; null/undefined = not checked. */
  rosterNames?: readonly string[] | null,
): HearingChecklist {
  const state = normaliseState(stateIn)
  if (state === 'FL') {
    const { members, board } = panelCounts(h.panel)
    const conflicts = rosterNames ? panelRosterConflicts(h.panel, rosterNames) : []
    const rosterNote = rosterNames
      ? ' Checked against the board roster by name; HomeownerHub can’t check family ties.'
      : ' Not checked against the board roster.'
    const committee: HearingStep =
      conflicts.length > 0
        ? {
            code: 'committee',
            title: 'A committee of at least 3 non-directors',
            state: 'problem',
            detail: `${conflicts.map((c) => c.name).join(', ')} ${conflicts.length === 1 ? 'is' : 'are'} marked as an owner but ${conflicts.length === 1 ? 'matches' : 'match'} a board member or admin on your roster. The committee can’t include officers, directors or employees, or their spouse, parent, child, brother or sister.`,
            citations: [FL_305_COMMITTEE],
          }
        : members >= FL_COMMITTEE_MIN && board === 0
        ? { code: 'committee', title: 'A committee of at least 3 non-directors', state: 'done', detail: `${members} committee members recorded, none on the board.${rosterNote}`, citations: [FL_305_COMMITTEE] }
        : {
            code: 'committee',
            title: 'A committee of at least 3 non-directors',
            state: h.panel.length === 0 ? 'todo' : 'problem',
            detail:
              board > 0
                ? `${board} panel member${board === 1 ? ' is' : 's are'} marked as on the board. The committee can’t include officers, directors or employees, or their spouse, parent, child, brother or sister.`
                : h.panel.length === 0
                  ? 'Record the committee the board appointed: at least three members who are not officers, directors or employees, or their relatives.'
                  : `Only ${members} committee member${members === 1 ? '' : 's'} recorded; at least three are needed.`,
            citations: [FL_305_COMMITTEE],
          }
    let within: HearingStep
    if (h.noticeSentOn && h.hearingOn) {
      const gap = daysBetween(h.noticeSentOn, h.hearingOn)
      within =
        gap !== null && gap <= FL_HEARING_WITHIN_DAYS
          ? { code: 'within', title: 'Held within 90 days of the notice', state: 'done', detail: `${gap} days after the notice.`, citations: [FL_305_COMMITTEE] }
          : { code: 'within', title: 'Held within 90 days of the notice', state: 'problem', detail: `${gap ?? '?'} days after the notice, more than 90. Send a new notice.`, citations: [FL_305_COMMITTEE] }
    } else {
      within = { code: 'within', title: 'Held within 90 days of the notice', state: 'todo', detail: h.noticeSentOn ? `Hold it by ${addDays(h.noticeSentOn, FL_HEARING_WITHIN_DAYS)}.` : 'Counts from the notice.', citations: [FL_305_COMMITTEE] }
    }
    const steps: HearingStep[] = [
      noticeStep(h, FL_NOTICE_DAYS, today, [FL_305_NOTICE, FL_305_NOTICE_CONTENTS]),
      committee,
      within,
      decisionStep(h, [FL_305_VOTE], 'committee'),
      writtenDecisionStep(h, FL_FINDINGS_DAYS, today, 'Written findings within 7 days', [FL_305_FINDINGS], 'hearing'),
    ]
    if (!held(h) || finePassed(h)) {
      const title = 'Payment due at least 30 days after the findings'
      let pay: HearingStep
      if (h.paymentDueOn && h.findingsSentOn) {
        const gap = daysBetween(h.findingsSentOn, h.paymentDueOn)
        pay =
          gap !== null && gap >= FL_PAYMENT_MIN_DAYS
            ? { code: 'payment', title, state: 'done', detail: `Due ${h.paymentDueOn}, ${gap} days after the findings.`, citations: [FL_305_PAY_DATE] }
            : { code: 'payment', title, state: 'problem', detail: `Due ${h.paymentDueOn}, only ${gap ?? '?'} days after the findings. Set ${addDays(h.findingsSentOn, FL_PAYMENT_MIN_DAYS)} or later.`, citations: [FL_305_PAY_DATE] }
      } else {
        pay = {
          code: 'payment',
          title,
          state: 'todo',
          detail: h.findingsSentOn ? `Set a due date of ${addDays(h.findingsSentOn, FL_PAYMENT_MIN_DAYS)} or later.` : 'Set once the findings are sent.',
          citations: [FL_305_PAY_DATE],
        }
      }
      steps.push(pay)
    }
    return { state, steps, note: null }
  }
  if (state === 'CA') {
    const steps: HearingStep[] = [
      noticeStep(h, CA_NOTICE_DAYS, today, [CA_5855_NOTICE, CA_5855_CONTENTS]),
      decisionStep(h, [CA_5855_CURE], 'board'),
    ]
    if (!held(h) || finePassed(h)) {
      steps.push(writtenDecisionStep(h, CA_DECISION_DAYS, today, 'Written decision within 14 days', [CA_5855_DECISION, CA_5855_EFFECTIVE], 'decision'))
    }
    return { state, steps, note: null }
  }
  return { state, steps: [], note: CHECK_GOVERNING_DOCUMENTS }
}

/** Steps the board still has to act on, for a count on the page. */
export function openSteps(c: HearingChecklist): HearingStep[] {
  return c.steps.filter((s) => s.state !== 'done')
}

// ─── BL-130: what the fine check reads ───────────────────────────────

/** The hearing as checkFine() sees it; null = no hearing record. */
export function hearingFineFacts(h: HearingRecord | null, rosterNames?: readonly string[] | null): FineHearingFacts | null {
  if (!h || h.status === 'cancelled') return null
  const { members, board } = panelCounts(h.panel)
  const facts: FineHearingFacts = {
    held: held(h),
    outcome: h.outcome,
    committeeMembers: members,
    boardOnPanel: board,
    noticeDays: h.noticeSentOn && h.hearingOn ? daysBetween(h.noticeSentOn, h.hearingOn) : null,
  }
  if (rosterNames) facts.rosterConflicts = panelRosterConflicts(h.panel, rosterNames).length
  return facts
}

/** Re-exported for the hearing card: what the roster check can't see. */
export { FL_RELATIVES_NOT_CHECKED }

// ─── BL-140: daily-digest timers ─────────────────────────────────────

/**
 * An owner's hearing request waiting this many days to be scheduled shows
 * in the digest. Not a statutory period (neither § 720.305 nor § 5855 sets
 * one for a request); the board's own reminder.
 */
export const HEARING_REQUEST_WAIT_DAYS = 7
/** "Due soon" for a notice or written findings: within this many days. */
export const HEARING_DUE_SOON_DAYS = 3

export interface HearingDigestCounts {
  /** Requests not scheduled after HEARING_REQUEST_WAIT_DAYS. */
  requestsWaiting: number
  /** Scheduled, notice not sent, and the statutory lead time has already passed. */
  noticeLate: number
  /** Scheduled, notice not sent, and the last day to send it is within HEARING_DUE_SOON_DAYS. */
  noticeDueSoon: number
  /** Held, written findings / decision not recorded, past the statutory window. */
  findingsLate: number
  /** Held, written findings / decision not recorded, due within HEARING_DUE_SOON_DAYS. */
  findingsDueSoon: number
}

export const EMPTY_HEARING_COUNTS: HearingDigestCounts = {
  requestsWaiting: 0,
  noticeLate: 0,
  noticeDueSoon: 0,
  findingsLate: 0,
  findingsDueSoon: 0,
}

/** The last day the written findings (FL) or decision (CA) can go out; null when none is required or not yet held. */
export function findingsDueOn(stateIn: string | null | undefined, h: HearingRecord): string | null {
  const state = normaliseState(stateIn)
  if (!held(h) || !h.hearingOn) return null
  if (state === 'FL') return addDays(h.hearingOn, FL_FINDINGS_DAYS)
  if (state === 'CA') return finePassed(h) ? addDays(h.decidedOn ?? h.hearingOn, CA_DECISION_DAYS) : null
  return null
}

/** The last day the hearing notice can go out; null when the state has no loaded rule or no date is set. */
export function noticeDueOn(stateIn: string | null | undefined, h: HearingRecord): string | null {
  const state = normaliseState(stateIn)
  if (!h.hearingOn) return null
  if (state === 'FL') return addDays(h.hearingOn, -FL_NOTICE_DAYS)
  if (state === 'CA') return addDays(h.hearingOn, -CA_NOTICE_DAYS)
  return null
}

/**
 * The digest's hearing counts for one association state. Pure. Requests
 * waiting count in every state; the notice and findings windows only where
 * the statute text is loaded (FL, CA). Cancelled hearings never count.
 */
export function hearingDigestCounts(
  stateIn: string | null | undefined,
  hearings: readonly HearingRecord[],
  today: string,
): HearingDigestCounts {
  const c = { ...EMPTY_HEARING_COUNTS }
  const soon = addDays(today, HEARING_DUE_SOON_DAYS)
  for (const h of hearings) {
    if (h.status === 'requested') {
      const asked = h.requestedAt ? h.requestedAt.slice(0, 10) : null
      if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && addDays(asked, HEARING_REQUEST_WAIT_DAYS) < today) c.requestsWaiting += 1
      continue
    }
    if (h.status === 'scheduled' && !h.noticeSentOn) {
      const by = noticeDueOn(stateIn, h)
      // A hearing date already past is the board's to move, not a notice to send.
      if (by && h.hearingOn && h.hearingOn >= today) {
        if (by < today) c.noticeLate += 1
        else if (by <= soon) c.noticeDueSoon += 1
      }
      continue
    }
    if (h.status === 'held' && !h.findingsSentOn) {
      const due = findingsDueOn(stateIn, h)
      if (due) {
        if (due < today) c.findingsLate += 1
        else if (due <= soon) c.findingsDueSoon += 1
      }
    }
  }
  return c
}

export function hearingDigestTotal(c: HearingDigestCounts): number {
  return c.requestsWaiting + c.noticeLate + c.noticeDueSoon + c.findingsLate + c.findingsDueSoon
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The digest lines, counts only — never a name, an address or a violation. */
export function hearingDigestLines(c: HearingDigestCounts): string[] {
  const lines: string[] = []
  if (c.requestsWaiting > 0)
    lines.push(`${plural(c.requestsWaiting, 'owner hearing request', 'owner hearing requests')} waiting more than ${HEARING_REQUEST_WAIT_DAYS} days to be scheduled`)
  if (c.noticeLate > 0)
    lines.push(`${plural(c.noticeLate, 'hearing notice', 'hearing notices')} not sent in time for the scheduled hearing; move the hearing date`)
  if (c.noticeDueSoon > 0)
    lines.push(`${plural(c.noticeDueSoon, 'hearing notice', 'hearing notices')} to send within ${HEARING_DUE_SOON_DAYS} days`)
  if (c.findingsLate > 0)
    lines.push(`${plural(c.findingsLate, 'hearing decision', 'hearing decisions')} not recorded as sent within the statutory window`)
  if (c.findingsDueSoon > 0)
    lines.push(`${plural(c.findingsDueSoon, 'hearing decision', 'hearing decisions')} to send within ${HEARING_DUE_SOON_DAYS} days`)
  return lines
}

// ─── validation of the board's form ──────────────────────────────────

export interface HearingInput {
  status: HearingStatus
  hearingOn: string | null
  hearingTime: string | null
  location: string | null
  panel: PanelMember[]
  noticeSentOn: string | null
  outcome: HearingOutcome | null
  decidedOn: string | null
  findingsSentOn: string | null
  paymentDueOn: string | null
}

/** The CHECK in 0068 (violation_hearings_shape_check), and the obvious day order, as messages. */
export function hearingShapeErrors(h: HearingInput): Record<string, string> {
  const e: Record<string, string> = {}
  if ((h.status === 'scheduled' || h.status === 'held') && !h.hearingOn) e.hearingOn = 'Pick the hearing date.'
  if (h.status === 'held' && !h.outcome) e.outcome = 'Record the outcome of the hearing.'
  if (h.outcome && h.status !== 'held') e.outcome = 'An outcome can only be recorded once the hearing is held.'
  if (h.noticeSentOn && h.hearingOn && h.noticeSentOn > h.hearingOn) e.noticeSentOn = 'The notice can’t be sent after the hearing.'
  if (h.decidedOn && h.hearingOn && h.decidedOn < h.hearingOn) e.decidedOn = 'The decision can’t come before the hearing.'
  if (h.findingsSentOn && h.hearingOn && h.findingsSentOn < h.hearingOn) e.findingsSentOn = 'The findings can’t be sent before the hearing.'
  if (h.paymentDueOn && h.findingsSentOn && h.paymentDueOn < h.findingsSentOn) e.paymentDueOn = 'Payment can’t be due before the findings are sent.'
  return e
}

// ─── the hearing notice (drafted for the board; never sent from here) ─

export interface HearingNoticeInput {
  state: string | null | undefined
  associationName: string
  violationType: string
  description: string
  ruleCited: string | null
  hearingOn: string | null
  hearingTime: string | null
  location: string | null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function longDay(day: string | null): string {
  if (!day) return '[hearing date]'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function clock(time: string | null): string {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return '[time]'
  const [h, m] = time.split(':').map(Number)
  const suffix = h! >= 12 ? 'PM' : 'AM'
  const h12 = h! % 12 === 0 ? 12 : h! % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * The hearing notice the board edits and sends from the composer (the
 * normal guarded send). Bracketed placeholders are left for anything the
 * record doesn't hold. The statutory contents for FL (§ 720.305(2)(b)) and
 * CA (§ 5855(b)) are each a line of the notice; elsewhere it is a plain
 * notice and the board checks its governing documents.
 */
export function buildHearingNoticeDraft(input: HearingNoticeInput): { subject: string; bodyHtml: string } {
  const state = normaliseState(input.state)
  const what = input.violationType.replace(/_/g, ' ').trim() || 'violation'
  const assoc = input.associationName.trim() || 'the association'
  const p = (s: string) => `<p>${s}</p>`
  const lines: string[] = [
    p('Dear Homeowner,'),
    p(
      state === 'CA'
        ? `The Board of Directors of ${escapeHtml(assoc)} will meet to consider the violation described below. You have the right to attend this meeting and may address the board.`
        : `${escapeHtml(assoc)} has scheduled a hearing on the violation described below. You have the right to attend and be heard.`,
    ),
    p(`<strong>The violation:</strong> ${escapeHtml(input.description.trim())}${input.ruleCited ? ` (${escapeHtml(input.ruleCited.trim())})` : ''}`),
    p('<strong>What to do to fix it:</strong> [Describe the specific action required to cure the violation, if any.]'),
    p(
      `<strong>When:</strong> ${escapeHtml(longDay(input.hearingOn))} at ${escapeHtml(clock(input.hearingTime))}<br /><strong>Where:</strong> ${escapeHtml(input.location?.trim() || '[place]')}`,
    ),
  ]
  if (state === 'FL') {
    lines.push(
      p('<strong>Joining by phone or video:</strong> [Access information, if the hearing can be attended by telephone or other electronic means.] You have the right to attend the hearing by telephone or other electronic means.'),
      p('The hearing is before a committee of owners appointed by the board who are not officers, directors or employees of the association. If the violation is fixed before the hearing, no fine may be imposed.'),
    )
  } else if (state === 'CA') {
    lines.push(
      p('You may fix the violation before the meeting. If you would like the board to meet with you in executive session, reply to this notice and ask.'),
    )
  }
  lines.push(p('If you have questions, reply to this message.'), p(`Sincerely,<br />The Board of Directors, ${escapeHtml(assoc)}`))
  if (state === 'FL') lines.push(p('<em>This notice is given under section 720.305(2), Florida Statutes.</em>'))
  if (state === 'CA') lines.push(p('<em>This notice is given under California Civil Code section 5855.</em>'))
  return { subject: `Notice of hearing: ${what}`, bodyHtml: lines.join('\n') }
}
