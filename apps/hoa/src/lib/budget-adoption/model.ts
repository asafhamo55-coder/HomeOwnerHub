/**
 * BL-138: the budget adoption kit — the checklist and countdown for
 * adopting next year's budget lawfully. Pure and client-safe; the budget
 * page and the dashboard card load the input on the server (./load.ts).
 *
 * The steps, in order:
 *   1. Schedule the adoption meeting (linked to the budget).
 *   2. Send the meeting notice through the meeting-notice composer
 *      (BL-118). In Florida the notice must say assessments will be
 *      considered and their nature; special assessments need 14 days plus
 *      posting.
 *   3. Approve the budget (the board's vote at the meeting).
 *   4. Record the adoption: the date the board adopted it.
 *   5. Send owners the budget notice (BL-091). In California, inside the
 *      § 5300(a) window: 30 to 90 days before the fiscal year ends.
 *   6. Next: set the new dues rate (until BL-137, the amount is entered
 *      when dues are billed).
 *
 * Nothing here sends anything. Every rule quoted is in ./law.ts and
 * checked against the statute text in the repo; anywhere else the kit says
 * "check your governing documents".
 */

import { addCalendarDays, calendarDaysBetween } from '@/lib/association-time'
import { caWindow, type CaWindow } from '@/lib/budget-notice/model'
import {
  CA_BUDGET_REPORT,
  CA_MEETING_NOTICE_NOT_LOADED,
  CHECK_GOVERNING_DOCS,
  FL_ASSESSMENT_STATEMENT,
  FL_BOARD_DELIVERED,
  FL_BOARD_POSTED,
  FL_BUDGET_COPY,
  FL_NOTICE_DAYS,
  FL_SPECIAL_ASSESSMENT,
  type StatuteCitation,
} from './law'

export type AdoptionJurisdiction = 'FL' | 'CA' | 'generic'

export function adoptionJurisdiction(state: string | null | undefined): AdoptionJurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' ? 'FL' : s === 'CA' ? 'CA' : 'generic'
}

// ─── deadline math ───────────────────────────────────────────────────

export interface FlNoticeDeadlines {
  /** § 720.303(2)(c)1: posted conspicuously at least 48 hours ahead. */
  postedBy: string
  /** § 720.303(2)(c)1: mailed or delivered at least 7 days ahead. */
  mailedBy: string
  /** § 720.303(2)(c)2: special assessments, 14 days ahead, mailed AND posted. */
  specialBy: string
}

export function flNoticeDeadlines(meetingDate: string): FlNoticeDeadlines {
  return {
    postedBy: addCalendarDays(meetingDate, -FL_NOTICE_DAYS.posted),
    mailedBy: addCalendarDays(meetingDate, -FL_NOTICE_DAYS.mailed),
    specialBy: addCalendarDays(meetingDate, -FL_NOTICE_DAYS.special),
  }
}

/**
 * The last day a Florida notice can go out for this meeting: 14 days ahead
 * with special assessments, otherwise 7 days (mailed or delivered — the
 * 48-hour posting alternative is shown as a note, not counted down to).
 */
export function flNoticeDueBy(meetingDate: string, special: boolean): string {
  const d = flNoticeDeadlines(meetingDate)
  return special ? d.specialBy : d.mailedBy
}

/** § 5300(a) window for a budget whose year starts on `periodStart`. */
export function caReportWindow(periodStart: string | null, today: string): CaWindow | null {
  return caWindow(periodStart ? { start_date: periodStart } : null, today)
}

/** Does the agenda (which the meeting notice is prefilled from) mention assessments? */
export function agendaMentionsAssessments(agenda: string | null | undefined): boolean {
  return /\bassessments?\b/i.test(agenda ?? '')
}

// ─── input ───────────────────────────────────────────────────────────

export interface AdoptionMeeting {
  id: string
  /** YYYY-MM-DD */
  date: string
  type: string | null
  status: string | null
  agenda: string | null
}

export interface AdoptionRecord {
  meetingId: string | null
  special: boolean
  adoptedOn: string | null
  ownerNoticeOn: string | null
}

export const EMPTY_RECORD: AdoptionRecord = { meetingId: null, special: false, adoptedOn: null, ownerNoticeOn: null }

export interface AdoptionInput {
  state: string | null | undefined
  /** The association's today, YYYY-MM-DD. */
  today: string
  budget: {
    id: string
    status: string
    /** The budget year's first day (fiscal_periods.start_date), or null. */
    periodStart: string | null
  }
  /** The linked meeting; null when none is linked (or it was deleted). */
  meeting: AdoptionMeeting | null
  /**
   * The day (association's) the latest notice for the meeting was sent or
   * scheduled; null = none; 'failed' = couldn't read.
   */
  noticeDay: string | null | 'failed'
  record: AdoptionRecord
}

// ─── output ──────────────────────────────────────────────────────────

/**
 * done     — finished.
 * todo     — the next thing to do.
 * warn     — done or in progress, but something doesn't line up with the rule.
 * waiting  — can't start until an earlier step is done.
 * next     — the hand-off after the kit (set the dues rate).
 */
export type StepState = 'done' | 'todo' | 'warn' | 'waiting' | 'next'

export type StepId = 'meeting' | 'notice' | 'approve' | 'record' | 'owner_notice' | 'rate'

export interface AdoptionStep {
  id: StepId
  title: string
  state: StepState
  /** Plain sentences for the board. */
  detail: string[]
  href: string | null
  hrefLabel: string | null
  citations: StatuteCitation[]
}

export interface Countdown {
  label: string
  /** YYYY-MM-DD */
  date: string
  /** Calendar days from today; negative once passed. */
  daysLeft: number
  tone: 'info' | 'warning' | 'danger'
}

export interface AdoptionKit {
  jurisdiction: AdoptionJurisdiction
  steps: AdoptionStep[]
  countdown: Countdown | null
  /** The § 5300(a) window (California only). */
  caWindow: CaWindow | null
  /** Every step but the hand-off is done. */
  complete: boolean
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function fmt(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

const MEETING_TYPE_LABEL: Record<string, string> = {
  regular: 'Board meeting',
  special: 'Special meeting',
  annual: 'Annual meeting',
  emergency: 'Emergency meeting',
}

function countdownTone(daysLeft: number): Countdown['tone'] {
  return daysLeft < 0 ? 'danger' : daysLeft <= 7 ? 'warning' : 'info'
}

function mkCountdown(label: string, date: string, today: string, tone?: Countdown['tone']): Countdown {
  const daysLeft = calendarDaysBetween(today, date)
  return { label, date, daysLeft, tone: tone ?? countdownTone(daysLeft) }
}

/** "in 5 days" / "today" / "3 days ago". */
export function countdownPhrase(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft > 0) return `in ${plural(daysLeft, 'day')}`
  return `${plural(-daysLeft, 'day')} ago`
}

// ─── steps ───────────────────────────────────────────────────────────

function meetingStep(input: AdoptionInput): AdoptionStep {
  const { meeting, budget } = input
  if (meeting) {
    const past = meeting.date < input.today
    return {
      id: 'meeting',
      title: 'Schedule the adoption meeting',
      state: 'done',
      detail: [
        `${MEETING_TYPE_LABEL[meeting.type ?? ''] ?? 'Meeting'} on ${fmt(meeting.date)}${past ? ' (held)' : ''}.`,
      ],
      href: `/meetings/${meeting.id}`,
      hrefLabel: 'Open the meeting',
      citations: [],
    }
  }
  return {
    id: 'meeting',
    title: 'Schedule the adoption meeting',
    state: 'todo',
    detail: [
      'Pick the board meeting that will adopt this budget, or schedule one. Its agenda is what the meeting notice starts from.',
    ],
    href: `/meetings/schedule?budget=${budget.id}`,
    hrefLabel: 'Schedule the adoption meeting',
    citations: [],
  }
}

function noticeStep(input: AdoptionInput, j: AdoptionJurisdiction): AdoptionStep {
  const { meeting, noticeDay, record, today } = input
  const base = { id: 'notice' as const, title: 'Send the meeting notice' }
  if (!meeting) {
    return {
      ...base,
      state: 'waiting',
      detail: ['Schedule the meeting first.'],
      href: null,
      hrefLabel: null,
      citations: [],
    }
  }
  const upcoming = meeting.date >= today && meeting.status !== 'approved'
  const composer = upcoming ? `/communications/new?meeting=${meeting.id}` : null
  const detail: string[] = []
  const citations: StatuteCitation[] = []
  let warn = false

  if (j === 'FL') {
    const d = flNoticeDeadlines(meeting.date)
    if (record.special) {
      detail.push(
        `Special assessments are on the agenda: mail, deliver or email the notice AND post it on the property by ${fmt(d.specialBy)} (14 days ahead).`,
      )
      citations.push(FL_SPECIAL_ASSESSMENT)
    } else {
      detail.push(
        `Mail or deliver the notice by ${fmt(d.mailedBy)} (7 days ahead), or post it in a conspicuous place by ${fmt(d.postedBy)} (48 hours ahead). If special assessments will be considered, it’s 14 days and posting both.`,
      )
      citations.push(FL_BOARD_DELIVERED, FL_BOARD_POSTED, FL_SPECIAL_ASSESSMENT)
    }
    if (typeof noticeDay === 'string' || meeting.status !== 'draft') {
      // Sent (or the meeting is held): the notice's own words are what
      // count, and the app can't read them back. A reminder, not a flag.
      detail.push('The notice must have said assessments would be considered, and what they are.')
    } else if (!agendaMentionsAssessments(meeting.agenda)) {
      warn = true
      detail.push(
        'The meeting’s agenda doesn’t say assessments will be considered. The notice is prefilled from the agenda, and an assessment can’t be levied unless the notice says so and what they are. Edit the agenda first.',
      )
    } else {
      detail.push('The agenda mentions assessments. Make sure the notice says what they are (the annual assessment, and any special assessment).')
    }
    citations.unshift(FL_ASSESSMENT_STATEMENT)
    if (typeof noticeDay === 'string') {
      const due = flNoticeDueBy(meeting.date, record.special)
      const ahead = calendarDaysBetween(noticeDay, meeting.date)
      if (noticeDay > due) {
        warn = true
        detail.unshift(
          `Notice went out ${fmt(noticeDay)}, ${plural(ahead, 'day')} before the meeting — later than ${fmt(due)}.${record.special ? '' : ' That meets the rule only if it was also posted at least 48 hours ahead.'}`,
        )
      } else {
        detail.unshift(`Notice went out ${fmt(noticeDay)}, ${plural(ahead, 'day')} before the meeting.`)
      }
    }
  } else if (j === 'CA') {
    detail.push(CA_MEETING_NOTICE_NOT_LOADED)
    if (typeof noticeDay === 'string') detail.unshift(`Notice went out ${fmt(noticeDay)}.`)
  } else {
    detail.push(CHECK_GOVERNING_DOCS)
    if (typeof noticeDay === 'string') detail.unshift(`Notice went out ${fmt(noticeDay)}.`)
  }

  const sent = typeof noticeDay === 'string'
  if (noticeDay === 'failed') detail.unshift('Couldn’t check whether a notice was sent.')
  else if (!sent && !composer) {
    warn = true
    detail.unshift('No notice was sent from HomeownerHub before the meeting. If you mailed or posted one yourself, keep a copy with the minutes.')
  }

  return {
    ...base,
    state: sent ? (warn ? 'warn' : 'done') : warn ? 'warn' : 'todo',
    detail,
    href: composer,
    hrefLabel: composer ? (sent ? 'Send another notice' : 'Write the meeting notice') : null,
    citations,
  }
}

function approveStep(input: AdoptionInput): AdoptionStep {
  const approved = input.budget.status === 'approved'
  return {
    id: 'approve',
    title: 'Approve the budget at the meeting',
    state: approved ? 'done' : input.meeting ? 'todo' : 'waiting',
    detail: approved
      ? ['The budget is approved and locked.']
      : ['After the board votes, select Approve on this budget. Approving locks the lines.'],
    href: null,
    hrefLabel: null,
    citations: [],
  }
}

function recordStep(input: AdoptionInput): AdoptionStep {
  const { record, meeting } = input
  const approved = input.budget.status === 'approved'
  if (record.adoptedOn) {
    const detail = [`Adopted ${fmt(record.adoptedOn)}.`]
    let warn = false
    if (meeting && meeting.date !== record.adoptedOn) {
      warn = true
      detail.push(`That isn’t the date of the linked meeting (${fmt(meeting.date)}). Check which meeting adopted it.`)
    }
    return { id: 'record', title: 'Record the adoption', state: warn ? 'warn' : 'done', detail, href: null, hrefLabel: null, citations: [] }
  }
  return {
    id: 'record',
    title: 'Record the adoption',
    state: approved ? 'todo' : 'waiting',
    detail: approved
      ? ['Enter the date the board adopted the budget, as the minutes record it.']
      : ['Approve the budget first.'],
    href: null,
    hrefLabel: null,
    citations: [],
  }
}

function ownerNoticeStep(input: AdoptionInput, j: AdoptionJurisdiction, win: CaWindow | null): AdoptionStep {
  const { record, budget } = input
  const approved = budget.status === 'approved'
  const detail: string[] = []
  const citations: StatuteCitation[] = []
  let warn = false

  if (j === 'CA') {
    citations.push(CA_BUDGET_REPORT)
    if (win) {
      detail.push(`Distribute the annual budget report between ${fmt(win.earliest)} and ${fmt(win.latest)} (30 to 90 days before the fiscal year ends on ${fmt(win.fiscalYearEnd)}).`)
      if (record.ownerNoticeOn && (record.ownerNoticeOn < win.earliest || record.ownerNoticeOn > win.latest)) {
        warn = true
        detail.unshift(`Sent ${fmt(record.ownerNoticeOn)} — outside the § 5300(a) window.`)
      } else if (!record.ownerNoticeOn && win.status === 'late') {
        warn = true
        detail.unshift('The § 5300(a) window has closed. Send it as soon as you can and ask your attorney about the late report.')
      }
    } else {
      detail.push('This budget has no fiscal period, so the § 5300(a) window can’t be worked out.')
    }
  } else if (j === 'FL') {
    citations.push(FL_BUDGET_COPY)
    detail.push('Give each member a copy of the budget, or a notice that a copy is available at no charge.')
  } else {
    detail.push(CHECK_GOVERNING_DOCS)
  }
  if (record.ownerNoticeOn && !warn) detail.unshift(`Sent ${fmt(record.ownerNoticeOn)}.`)

  return {
    id: 'owner_notice',
    title: 'Send owners the budget',
    state: record.ownerNoticeOn ? (warn ? 'warn' : 'done') : !approved ? 'waiting' : warn ? 'warn' : 'todo',
    detail,
    href: approved ? `/accounting/budget/${budget.id}/notice` : null,
    hrefLabel: approved ? 'Prepare owner budget notice' : null,
    citations,
  }
}

function rateStep(input: AdoptionInput): AdoptionStep {
  return {
    id: 'rate',
    title: 'Next: set the new dues rate',
    state: 'next',
    detail: [
      input.record.adoptedOn
        ? 'Bill next year’s dues at the amount the adopted budget sets. For now the amount is entered each time you bill dues.'
        : 'Once the budget is adopted, bill next year’s dues at the amount it sets.',
    ],
    href: '/dues/new',
    hrefLabel: 'Bill dues',
    citations: [],
  }
}

// ─── countdown ───────────────────────────────────────────────────────

/**
 * The one date the board most needs to watch:
 *   CA: the § 5300(a) window (opens / closes / closed) until the owner
 *       notice is recorded.
 *   FL: the notice deadline for the linked meeting until a notice goes out.
 *   Otherwise: the first day of the budget year, until the adoption is
 *       recorded.
 */
export function adoptionCountdown(input: AdoptionInput, j: AdoptionJurisdiction, win: CaWindow | null): Countdown | null {
  const { today, record, meeting, budget, noticeDay } = input
  if (j === 'CA' && win && !record.ownerNoticeOn) {
    if (win.status === 'early') return mkCountdown('§ 5300 budget report window opens', win.earliest, today, 'info')
    if (win.status === 'within') return mkCountdown('§ 5300 budget report window closes', win.latest, today)
    return mkCountdown('§ 5300 budget report window closed', win.latest, today, 'danger')
  }
  if (j === 'FL' && meeting && noticeDay === null && meeting.date >= today && meeting.status !== 'approved') {
    return mkCountdown('Send the meeting notice by', flNoticeDueBy(meeting.date, record.special), today)
  }
  if (!record.adoptedOn && budget.periodStart) {
    return mkCountdown('Budget year starts', budget.periodStart, today, calendarDaysBetween(today, budget.periodStart) < 0 ? 'danger' : 'info')
  }
  return null
}

export function buildAdoptionKit(input: AdoptionInput): AdoptionKit {
  const j = adoptionJurisdiction(input.state)
  const win = j === 'CA' ? caReportWindow(input.budget.periodStart, input.today) : null
  const steps = [
    meetingStep(input),
    noticeStep(input, j),
    approveStep(input),
    recordStep(input),
    ownerNoticeStep(input, j, win),
    rateStep(input),
  ]
  const complete = steps.every((s) => s.state === 'done' || s.state === 'next')
  return { jurisdiction: j, steps, countdown: complete ? null : adoptionCountdown(input, j, win), caWindow: win, complete }
}

/** The first step still to do, for the dashboard card. */
export function nextStep(kit: AdoptionKit): AdoptionStep | null {
  return kit.steps.find((s) => s.state === 'todo' || s.state === 'warn') ?? null
}

// ─── budget season ───────────────────────────────────────────────────

/** How far ahead of the budget year the dashboard starts showing the kit. */
export const SEASON_LEAD_DAYS = 120
/** How long into the budget year it keeps showing while steps are open. */
export const SEASON_TAIL_DAYS = 30

/**
 * Budget season for this budget: a draft or approved budget whose year
 * starts within SEASON_LEAD_DAYS (or started under SEASON_TAIL_DAYS ago).
 */
export function inBudgetSeason(budget: { status: string; periodStart: string | null }, today: string): boolean {
  if (budget.status !== 'draft' && budget.status !== 'approved') return false
  if (!budget.periodStart) return false
  const until = calendarDaysBetween(today, budget.periodStart)
  if (Number.isNaN(until)) return false
  return until <= SEASON_LEAD_DAYS && until >= -SEASON_TAIL_DAYS
}

/** The default agenda for a meeting scheduled from the kit (the notice is prefilled from it). */
export function adoptionAgenda(budgetName: string): string {
  return [
    `1. Consider and adopt the ${budgetName} budget.`,
    `2. Consider the annual assessments that fund it: the regular assessment for each home for the budget year.`,
  ].join('\n')
}
