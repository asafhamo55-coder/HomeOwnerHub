/**
 * BL-145: the /compliance page's model — every statutory obligation that
 * applies to each of the org's associations, where it stands today, and the
 * evidence the board attached when it marked one done. Pure: the loaders
 * (./overview-load.ts, ./evidence.ts) hand the rows in. The monthly board
 * report and the board packet print `complianceSummary` of the same model.
 *
 * GEORGIA FIRST. A Georgia association gets, in this order:
 *   1. Secretary of State registration (SB 406), markable, with evidence.
 *   2. Keeping that registration current: the Dec 31 renewal and the
 *      30-day amendment after an officer or address change.
 *   3. The annual members' meeting and its 21-day notice, from the
 *      meetings the board has recorded (§ 44-3-230(a)).
 *   4. Minutes and financial records (§ 44-3-231(d)).
 *   5. The statement of amounts due within five business days
 *      (§ 44-3-232(d)).
 *   6. BL-152: the nonprofit corporation's annual registration (Jan 1 –
 *      Apr 1, § 14-3-1622(c)), markable per filing year, with the
 *      § 14-3-1420(2) dissolution risk once it is 60 days late.
 *   7. What isn't loaded (condominium rules): "check your governing
 *      documents".
 * Rows 3–5 are the Property Owners' Association Act, which covers property
 * submitted to it (§ 44-3-235(a)); each says so.
 * BL-155: a Georgia association whose type is 'condo' gets the Georgia
 * Condominium Act instead (the POA Act does not govern Article 3
 * associations, § 44-3-235(b)), quoted from lib/ga-condo/law.ts:
 *   3. the annual meeting and its 21-day notice, the annual report, and the
 *      15% owners' call (§ 44-3-102);
 *   4. minutes and financial records (§ 44-3-106(d));
 *   5. the statement of amounts due within five business days
 *      (§ 44-3-109(d));
 *   6. the insurance the Act requires (§ 44-3-107(a), (c)), in place of
 *      the "not loaded" condominium row.
 * Rows 1–2 (SB 406 registration) are the same for both: Ch. 17A covers
 * condominium associations. Any other type (HOA, co-op, unknown) keeps the
 * POA Act rows exactly.
 * TEXAS: the management certificate (§ 209.004), markable.
 * FLORIDA: the BL-139 director certificates, summarised (the tracker lives
 * on Members).
 * CALIFORNIA: the BL-138 § 5300(a) annual budget report window, from the
 * next budget's adoption checklist.
 * GA, FL, CA, TX: director elections (BL-151), one row per election the
 * BL-141 planner holds (signed, in compliance_settings.meeting_elections):
 * the next date on its timeline, dates that conflict, and whether results
 * are recorded. California: the § 5120(b) results notice within 15 days.
 * Georgia: once results are recorded, the 30-day amended registration
 * (§ 43-17A-2(d)) if the officers changed, counted from the day the
 * results were recorded, from Jan 1, 2027 (SB 406 § 9(a)).
 * BL-149: the Georgia registration rows read the board's signed record
 * from the registration kit (/compliance/ga-registration,
 * lib/ga-registration): registered, lapsed or opted out, and each
 * post-election amendment the board filed (or said wasn't needed).
 * BL-159: the same 30-day amendment row after each board role change made
 * in Settings → Members (changeMemberRole writes it into that signed
 * record), counted from the day the role changed.
 * ANY OTHER STATE: nothing quoted; "check your governing documents".
 *
 * Statute wording only ever comes from ./law.ts (checked word for word);
 * the steps here are plain actions and never restate a rule.
 */

import {
  complianceState,
  daysUntil,
  deadlineByCode,
  deadlineLabel,
  deadlineTone,
  gaCorpRegistrationCode,
  gaCorpRegistrationYear,
  formatDueOn,
  readComplianceAcks,
  type ComplianceAssociationInput,
  type ComplianceState,
} from './deadlines'
import { addDays, addYears, type DirectorCertRow } from './director-certs'
import { electionJurisdiction } from '@/lib/elections/law'
import {
  GA_REGISTRATION_KIT_HREF,
  amendmentFor,
  gaRegistrationStanding,
  gaStandingLabel,
  type GaOfficerChange,
  type GaRegistrationRecord,
  type GaRegistrationStanding,
} from '@/lib/ga-registration/model'
import { readGaRegistration } from '@/lib/ga-registration/store'
import { readElection, storedElections } from '@/lib/elections/store'
import { electionTimeline, nextStep, type TimelineStep } from '@/lib/elections/timeline'
import {
  CA_ANNUAL_BUDGET_REPORT,
  CA_ELECTION_RESULTS,
  CHECK_GOVERNING_DOCS,
  FL_DIRECTOR_CERTIFICATE,
  FL_DIRECTOR_SUSPENSION,
  GA_ANNUAL_MEETING,
  GA_ANNUAL_NOTICE_DAYS,
  GA_ANNUAL_REPORT,
  GA_CORP_DISSOLUTION,
  GA_CORP_DISSOLUTION_LATE_REGISTRATION,
  GA_CORP_REGISTRATION_CONTENTS,
  GA_CORP_REGISTRATION_FIRST,
  GA_CORP_REGISTRATION_INITIAL,
  GA_CORP_REGISTRATION_WINDOW,
  GA_MEETING_NOTICE,
  GA_MISSED_ANNUAL_MEETING,
  GA_POA_ACT_SCOPE,
  GA_RECORDS_FINANCIAL,
  GA_RECORDS_MINUTES,
  GA_REGISTRATION_AMENDMENT,
  GA_REGISTRATION_BAR,
  GA_REGISTRATION_FEE,
  GA_REGISTRATION_FILING,
  GA_REGISTRATION_FINANCIALS,
  GA_REGISTRATION_OPT_OUT,
  GA_REGISTRATION_RENEWAL,
  GA_SB406_EFFECTIVE,
  GA_STATEMENT_DEADLINE,
  GA_STATEMENT_RIGHT,
  TX_CERTIFICATE_RECORD,
  TX_CERTIFICATE_TREC,
  type StatuteQuote,
} from './law'
import {
  GA_CONDO_ANNUAL_MEETING,
  GA_CONDO_ANNUAL_NOTICE_DAYS,
  GA_CONDO_ANNUAL_REPORT,
  GA_CONDO_APPLIES,
  GA_CONDO_LIABILITY_INSURANCE,
  GA_CONDO_MEETING_NOTICE,
  GA_CONDO_OWNER_CALL,
  GA_CONDO_PROPERTY_INSURANCE,
  GA_CONDO_RECORDS_FINANCIAL,
  GA_CONDO_RECORDS_KEEP,
  GA_CONDO_RECORDS_MINUTES,
  GA_CONDO_SCOPE,
  GA_CONDO_STATEMENT_DEADLINE,
  GA_CONDO_STATEMENT_RIGHT,
  GA_CONDO_WATER_CERTIFICATE,
  isGaCondo,
} from '@/lib/ga-condo/law'

// ─── Inputs ─────────────────────────────────────────────────────────

/** One compliance_deadlines_done row (or verified acknowledgment), with its evidence. */
export interface DoneEntry {
  doneAt: string
  /** hoa_documents.id (migration 0069 part 4, M5_APPLIED); null when none or the flag is off. */
  documentId: string | null
}

/** association id → deadline code → done. */
export type DoneWithEvidence = Map<string, Map<string, DoneEntry>>

/** The org's annual members' meetings (hoa_meeting_minutes, meeting_type 'annual'). */
export interface AnnualMeetings {
  /** The latest one before today, YYYY-MM-DD. */
  lastHeld: string | null
  /** The soonest one today or later. */
  next: { id: string; date: string } | null
  /** The day the notice for `next` went out (BL-118 communications record); 'failed' when unreadable. */
  nextNoticeSentOn: string | null | 'failed'
}

export type DirectorCertInput =
  | { kind: 'not_applicable' }
  | { kind: 'failed' }
  | { kind: 'ok'; associationId: string; rows: readonly DirectorCertRow[] }

export type CaBudgetInput =
  /** The caller did not load it (the monthly report): the row points at the checklist. */
  | { kind: 'not_loaded' }
  | { kind: 'failed' }
  /** No draft or approved budget in budget season. */
  | { kind: 'none' }
  | {
      kind: 'ok'
      budgetId: string
      /** § 5300(a) window for that budget's fiscal year. */
      earliest: string
      latest: string
      /** The owner budget notice step of the BL-138 checklist is done. */
      sent: boolean
    }

/** A meeting an election is stored under (hoa_meeting_minutes). */
export interface ElectionMeeting {
  id: string
  /** YYYY-MM-DD. */
  date: string
  /** 'annual' or 'special' (the planner's gate); anything else reads as annual. */
  type: string | null
}

export interface ComplianceInput {
  today: string
  associations: readonly ComplianceAssociationInput[]
  /** Verifies the legacy signed acknowledgments (still count as done). */
  secret: string | null
  /** null: the rows couldn't be read; the acknowledgments alone count. */
  done: DoneWithEvidence | null
  /** hoa_documents id → name, for evidence links. */
  documentNames: ReadonlyMap<string, string>
  /** null: the meetings couldn't be read. Only consulted for Georgia. */
  annualMeetings: AnnualMeetings | null
  directorCerts: DirectorCertInput
  /** association id → the § 5300(a) status. Only consulted for California. */
  caBudgets: ReadonlyMap<string, CaBudgetInput>
  /**
   * BL-151: meeting id → the meeting, for every meeting an election is
   * stored under (not deleted, in this org). null: the meetings couldn't be
   * read. The elections themselves come from each association's
   * compliance_settings, verified with `secret`.
   */
  electionMeetings: ReadonlyMap<string, ElectionMeeting> | null
}

// ─── Output ─────────────────────────────────────────────────────────

export type ObligationTone =
  /** Past due, or in effect and not done. */
  | 'overdue'
  /** Due within COMPLIANCE_SOON_DAYS. */
  | 'soon'
  | 'upcoming'
  | 'done'
  /** An ongoing duty with no date. */
  | 'standing'
  /** HomeownerHub can't tell (nothing recorded). */
  | 'unknown'
  | 'failed'
  /** The rule isn't loaded. */
  | 'not_loaded'

export type ObligationKind =
  | 'deadline'
  | 'registration_upkeep'
  | 'annual_meeting'
  | 'duty'
  | 'director_certs'
  | 'ca_budget_report'
  /** BL-151: one planned director election, or the "none planned" row. */
  | 'election'
  /** BL-151: Georgia's 30-day amended registration after an election. */
  | 'registration_amendment'
  | 'not_loaded'

export interface ComplianceObligation {
  /** Unique within the overview. */
  key: string
  associationId: string
  associationName: string
  kind: ObligationKind
  title: string
  tone: ObligationTone
  label: string
  /** The date that matters now, YYYY-MM-DD, or null. */
  dueOn: string | null
  /** Plain actions, never a restated rule. */
  steps: string[]
  /** Word for word, from ./law.ts. */
  quotes: StatuteQuote[]
  /** Who it covers, when that needs saying. */
  appliesTo: string | null
  link: { href: string; label: string } | null
  official: { href: string; label: string } | null
  /** compliance_deadlines_done code: "Mark as done" (and evidence) apply. */
  deadlineCode: string | null
  done: { doneAt: string; evidence: { documentId: string; name: string } | null } | null
  /** BL-149: the meeting a Georgia amended-registration row answers (registration_amendment only). */
  meetingId?: string
}

export interface ComplianceGroup {
  associationId: string
  associationName: string
  state: ComplianceState | null
  obligations: ComplianceObligation[]
}

export interface ComplianceOverview {
  groups: ComplianceGroup[]
  /** Every overdue obligation, for the banner. */
  overdue: ComplianceObligation[]
}

/** Amber this many days out. */
export const COMPLIANCE_SOON_DAYS = 30
/** A Georgia annual-meeting notice turns amber this many days before it is due. */
export const GA_NOTICE_SOON_DAYS = 14

const STATE_ORDER: Record<ComplianceState, number> = { GA: 0, FL: 1, CA: 2, TX: 3 }

const STATE_NAME: Record<ComplianceState, string> = { GA: 'Georgia', FL: 'Florida', CA: 'California', TX: 'Texas' }

export const GA_SOS_URL = 'https://sos.ga.gov/georgia-property-owners-associations-division'
const GA_SOS_LABEL = 'Georgia Secretary of State — Property Owners’ Associations Division'

const GA_POA_APPLIES =
  'Associations whose property is submitted to the Georgia Property Owners’ Association Act (your declaration says so). If yours isn’t, check your governing documents.'

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`
}

function datedTone(daysLeft: number, soon = COMPLIANCE_SOON_DAYS): ObligationTone {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= soon) return 'soon'
  return 'upcoming'
}

// ─── Builders ───────────────────────────────────────────────────────

type Base = Pick<ComplianceObligation, 'associationId' | 'associationName'>

function deadlineDone(
  base: Base,
  code: string,
  acks: ReturnType<typeof readComplianceAcks>,
  input: ComplianceInput,
): ComplianceObligation['done'] {
  const row = input.done?.get(base.associationId)?.get(code)
  const ack = acks.get(code)
  if (!row && !ack) return null
  const documentId = row?.documentId ?? null
  return {
    doneAt: row?.doneAt ?? ack!.doneAt,
    evidence: documentId ? { documentId, name: input.documentNames.get(documentId) ?? 'Attached document' } : null,
  }
}

function doneLabel(doneAt: string): string {
  const day = doneAt.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `Done ${formatDueOn(day)}` : 'Done'
}

/** A COMPLIANCE_DEADLINES entry (GA registration, TX certificate): dated or standing, markable. */
function deadlineObligation(
  base: Base,
  code: string,
  acks: ReturnType<typeof readComplianceAcks>,
  input: ComplianceInput,
  extra: Pick<ComplianceObligation, 'steps' | 'quotes' | 'appliesTo' | 'link'>,
): ComplianceObligation {
  const d = deadlineByCode(code)!
  const done = deadlineDone(base, code, acks, input)
  const daysLeft = d.dueOn ? daysUntil(input.today, d.dueOn) : null
  const pending = deadlineTone(d, daysLeft)
  const tone: ObligationTone = done ? 'done' : pending === 'standing' ? 'unknown' : pending
  return {
    ...base,
    key: `${base.associationId}:${code}`,
    kind: 'deadline',
    title: d.title,
    tone,
    label: done ? doneLabel(done.doneAt) : d.dueOn ? deadlineLabel(d, input.today) : 'Not marked as filed yet',
    dueOn: d.dueOn,
    official: { href: d.officialUrl, label: d.officialLabel },
    deadlineCode: code,
    done,
    ...extra,
  }
}

/** The Dec 31 on or after `today`, never before the first renewal (Dec 31, 2027). */
export function nextGaRenewal(today: string): string {
  const year = Math.max(Number(today.slice(0, 4)), 2027)
  return `${year}-12-31`
}

const KIT_LINK = { href: GA_REGISTRATION_KIT_HREF, label: 'Open the registration kit' }

function gaRegistrationUpkeep(base: Base, today: string, standing: GaRegistrationStanding): ComplianceObligation {
  const due = nextGaRenewal(today)
  const left = daysUntil(today, due)
  const first = due === '2027-12-31' && today < '2027-01-01'
  // BL-149: a renewal already recorded past this Dec 31 means nothing is due now.
  const renewed = standing.status === 'registered' && standing.coveredThrough !== null && standing.coveredThrough > due
  const lapsed = standing.status === 'lapsed'
  const tone: ObligationTone = lapsed ? 'overdue' : renewed ? 'done' : left <= COMPLIANCE_SOON_DAYS ? 'soon' : 'standing'
  return {
    ...base,
    key: `${base.associationId}:ga-registration-upkeep`,
    kind: 'registration_upkeep',
    title: 'Keep the Secretary of State registration current',
    tone,
    label: lapsed
      ? gaStandingLabel(standing, formatDueOn)
      : renewed
        ? `Renewed · current through ${formatDueOn(standing.coveredThrough!)}`
        : first
          ? `First renewal due ${formatDueOn(due)}`
          : left === 0
            ? `Renewal due today (${formatDueOn(due)})`
            : `Renewal due ${formatDueOn(due)} (in ${days(left)})`,
    dueOn: due,
    steps: [
      'Put the renewal on the board calendar every year, well before December 31.',
      'When the association’s name, address or officers change (after an election, for example), file an amended registration statement.',
      'File each renewal or amendment in Documents so the next board can find it.',
    ],
    quotes: [GA_REGISTRATION_RENEWAL, GA_REGISTRATION_AMENDMENT, GA_REGISTRATION_FEE],
    appliesTo: null,
    link: KIT_LINK,
    official: { href: GA_SOS_URL, label: GA_SOS_LABEL },
    deadlineCode: null,
    done: null,
  }
}

function gaAnnualMeeting(base: Base, input: ComplianceInput, condo = false): ComplianceObligation {
  const noticeDays = condo ? GA_CONDO_ANNUAL_NOTICE_DAYS : GA_ANNUAL_NOTICE_DAYS
  const common = {
    ...base,
    key: `${base.associationId}:ga-annual-meeting`,
    kind: 'annual_meeting' as const,
    title: `Hold the annual members’ meeting, with ${noticeDays} days’ notice`,
    steps: condo
      ? [
          'Schedule the annual meeting under Meetings (type: Annual).',
          `Send the notice to every unit owner at least ${noticeDays} days before the meeting, with the time, place and purpose.`,
          'At the meeting, report on the association’s affairs, finances and budget projections. The meeting’s Annual report to owners builds it from your books.',
          'File the minutes afterwards.',
          'If your condominium instrument was recorded on or after July 1, 1990, it must provide for calling a meeting when at least 15% of the unit owners ask in writing. Check how yours does, and act on such a request.',
        ]
      : [
          'Schedule the annual meeting under Meetings (type: Annual).',
          `Send the notice to every owner at least ${noticeDays} days before the meeting, with the time and place.`,
          'At the meeting, report on the association’s affairs, finances and budget projections. The meeting’s Annual report to owners builds it from your books.',
          'File the minutes afterwards.',
          'Hold it before the fiscal year ends: if the board doesn’t, owners holding 5% of the voting power (or the figure in your articles or bylaws, never more than 25%) may call it themselves.',
        ],
    quotes: condo
      ? [GA_CONDO_ANNUAL_MEETING, GA_CONDO_MEETING_NOTICE, GA_CONDO_ANNUAL_REPORT, GA_CONDO_OWNER_CALL, GA_CONDO_SCOPE]
      : [GA_ANNUAL_MEETING, GA_MEETING_NOTICE, GA_ANNUAL_REPORT, GA_MISSED_ANNUAL_MEETING, GA_POA_ACT_SCOPE],
    appliesTo: condo ? GA_CONDO_APPLIES : GA_POA_APPLIES,
    official: null,
    deadlineCode: null,
    done: null,
  }
  const m = input.annualMeetings
  if (m === null) {
    return { ...common, tone: 'failed', label: 'Couldn’t load your meetings', dueOn: null, link: { href: '/meetings', label: 'Open Meetings' } }
  }
  if (m.next) {
    const link = { href: `/meetings/${m.next.id}`, label: 'Open the annual meeting' }
    const noticeBy = addDays(m.next.date, -noticeDays)
    const meetingOn = formatDueOn(m.next.date)
    const sent = m.nextNoticeSentOn
    if (typeof sent === 'string' && sent !== 'failed') {
      const late = sent > noticeBy
      return {
        ...common,
        tone: late ? 'soon' : 'upcoming',
        label: late
          ? `Annual meeting ${meetingOn} · notice sent ${formatDueOn(sent)}, after ${formatDueOn(noticeBy)}`
          : `Annual meeting ${meetingOn} · notice sent ${formatDueOn(sent)}`,
        dueOn: m.next.date,
        link,
      }
    }
    const left = daysUntil(input.today, noticeBy)
    const unknownSent = sent === 'failed' ? ' (couldn’t check whether it went out)' : ''
    return {
      ...common,
      tone: datedTone(left, GA_NOTICE_SOON_DAYS),
      label:
        left < 0
          ? `Notice was due ${formatDueOn(noticeBy)} for the ${meetingOn} annual meeting${unknownSent}`
          : `Send the notice by ${formatDueOn(noticeBy)} for the ${meetingOn} annual meeting${unknownSent}`,
      dueOn: noticeBy,
      link,
    }
  }
  const link = { href: '/meetings/schedule', label: 'Schedule a meeting' }
  if (!m.lastHeld) {
    return { ...common, tone: 'unknown', label: 'No annual meeting recorded in HomeownerHub', dueOn: null, link }
  }
  const yearOn = addYears(m.lastHeld, 1)
  const left = daysUntil(input.today, yearOn)
  if (left < 0) {
    return { ...common, tone: 'overdue', label: `No annual meeting since ${formatDueOn(m.lastHeld)}`, dueOn: yearOn, link }
  }
  return {
    ...common,
    tone: left <= 60 ? 'soon' : 'upcoming',
    label: `Last held ${formatDueOn(m.lastHeld)} · a year on is ${formatDueOn(yearOn)}`,
    dueOn: yearOn,
    link,
  }
}

function gaDuties(base: Base, condo = false): ComplianceObligation[] {
  const duty = (
    key: string,
    title: string,
    steps: string[],
    quotes: StatuteQuote[],
    link: ComplianceObligation['link'],
  ): ComplianceObligation => ({
    ...base,
    key: `${base.associationId}:${key}`,
    kind: 'duty',
    title,
    tone: 'standing',
    label: 'Ongoing',
    dueOn: null,
    steps,
    quotes,
    appliesTo: condo ? GA_CONDO_APPLIES : GA_POA_APPLIES,
    link,
    official: null,
    deadlineCode: null,
    done: null,
  })
  if (condo) {
    return [
      duty(
        'ga-records',
        'Keep minutes and financial records',
        [
          'File minutes for every board meeting and members’ meeting under Meetings.',
          'Record every receipt and expense in Accounting, with the bill or receipt attached.',
        ],
        [GA_CONDO_RECORDS_KEEP, GA_CONDO_RECORDS_MINUTES, GA_CONDO_RECORDS_FINANCIAL],
        { href: '/meetings', label: 'Open Meetings' },
      ),
      duty(
        'ga-statement-of-amounts-due',
        'Answer a request for a statement of amounts due within five business days',
        [
          'Watch for written requests from unit owners, buyers and lenders, and note the day each arrives.',
          'Open the unit under Properties and prepare the statement from its ledger.',
          'Send it to the address in the request and keep a copy.',
        ],
        [GA_CONDO_STATEMENT_RIGHT, GA_CONDO_STATEMENT_DEADLINE],
        { href: '/properties', label: 'Open Properties' },
      ),
      duty(
        'ga-condo-insurance',
        'Carry the insurance the Condominium Act requires',
        [
          'Record the property policy and the general liability policy under Insurance, with their limits.',
          'Check with your agent that the property policy is written for full replacement cost of the buildings, and that liability is at least $1 million per occurrence and $2 million aggregate.',
          'When a unit owner asks in writing for the certificate of insurance on a water claim, send it within five business days.',
        ],
        [GA_CONDO_PROPERTY_INSURANCE, GA_CONDO_LIABILITY_INSURANCE, GA_CONDO_WATER_CERTIFICATE],
        { href: '/insurance', label: 'Open Insurance' },
      ),
    ]
  }
  return [
    duty(
      'ga-records',
      'Keep minutes and financial records',
      [
        'File minutes for every board meeting and members’ meeting under Meetings.',
        'Record every receipt and expense in Accounting, with the bill or receipt attached.',
      ],
      [GA_RECORDS_MINUTES, GA_RECORDS_FINANCIAL],
      { href: '/meetings', label: 'Open Meetings' },
    ),
    duty(
      'ga-statement-of-amounts-due',
      'Answer a request for a statement of amounts due within five business days',
      [
        'Watch for written requests from owners, buyers and lenders, and note the day each arrives.',
        'Open the home under Properties and prepare the statement from its ledger.',
        'Send it to the address in the request and keep a copy.',
      ],
      [GA_STATEMENT_RIGHT, GA_STATEMENT_DEADLINE],
      { href: '/properties', label: 'Open Properties' },
    ),
  ]
}

function notLoaded(base: Base, key: string, title: string, label = 'Not loaded'): ComplianceObligation {
  return {
    ...base,
    key: `${base.associationId}:${key}`,
    kind: 'not_loaded',
    title,
    tone: 'not_loaded',
    label,
    dueOn: null,
    steps: [CHECK_GOVERNING_DOCS],
    quotes: [],
    appliesTo: null,
    link: null,
    official: null,
    deadlineCode: null,
    done: null,
  }
}

function flDirectorCerts(base: Base, input: ComplianceInput): ComplianceObligation | null {
  const dc = input.directorCerts
  if (dc.kind === 'not_applicable') return null
  // The tracker lives on one Florida association (director-certs.ts): show it there only.
  if (dc.kind === 'ok' && dc.associationId !== base.associationId) return null
  const common = {
    ...base,
    key: `${base.associationId}:fl-director-certificates`,
    kind: 'director_certs' as const,
    title: 'Director education certificates',
    steps: [
      'Record each director’s election date and certificate on Members.',
      'Keep each certificate on file.',
    ],
    quotes: [FL_DIRECTOR_CERTIFICATE, FL_DIRECTOR_SUSPENSION],
    appliesTo: null,
    link: { href: '/settings/members', label: 'Open Members' },
    official: null,
    deadlineCode: null,
    done: null,
  }
  if (dc.kind === 'failed') return { ...common, tone: 'failed', label: 'Couldn’t load the board’s certificates', dueOn: null }
  const rows = dc.rows
  const count = (tones: string[]) => rows.filter((r) => tones.includes(r.status.tone)).length
  const overdue = count(['overdue', 'expired'])
  const soon = count(['due_soon', 'renewal_soon'])
  const missing = count(['not_recorded'])
  const soonest = rows
    .filter((r) => r.status.dueOn && r.status.alert)
    .map((r) => r.status.dueOn!)
    .sort()[0] ?? null
  if (overdue > 0) return { ...common, tone: 'overdue', label: `${overdue} director${overdue === 1 ? '' : 's'} overdue or expired`, dueOn: soonest }
  if (soon > 0) return { ...common, tone: 'soon', label: `${soon} certificate${soon === 1 ? '' : 's'} due within 30 days`, dueOn: soonest }
  if (missing > 0) return { ...common, tone: 'unknown', label: `${missing} director${missing === 1 ? '’s' : 's’'} election date not recorded`, dueOn: null }
  return { ...common, tone: 'done', label: rows.length === 0 ? 'No board members yet' : 'Every director is on track', dueOn: null }
}

function caBudgetReport(base: Base, input: ComplianceInput): ComplianceObligation {
  const c = input.caBudgets.get(base.associationId) ?? { kind: 'not_loaded' }
  const common = {
    ...base,
    key: `${base.associationId}:ca-annual-budget-report`,
    kind: 'ca_budget_report' as const,
    title: 'Send the annual budget report',
    steps: [
      'Open next year’s budget and follow its Adopt this budget checklist.',
      'Send owners the budget notice from the checklist inside the window.',
    ],
    quotes: [CA_ANNUAL_BUDGET_REPORT],
    appliesTo: null,
    official: null,
    deadlineCode: null,
    done: null,
  }
  const budgets = { href: '/accounting/budget', label: 'Open budgets' }
  switch (c.kind) {
    case 'not_loaded':
      return { ...common, tone: 'standing', label: 'See the budget’s adoption checklist', dueOn: null, link: budgets }
    case 'failed':
      return { ...common, tone: 'failed', label: 'Couldn’t load next year’s budget', dueOn: null, link: budgets }
    case 'none':
      return { ...common, tone: 'unknown', label: 'No budget for next year yet', dueOn: null, link: budgets }
    case 'ok': {
      const link = { href: `/accounting/budget/${c.budgetId}`, label: 'Open the budget' }
      if (c.sent) return { ...common, tone: 'done', label: 'Budget report sent', dueOn: c.latest, link }
      if (input.today < c.earliest) {
        return { ...common, tone: 'upcoming', label: `Window opens ${formatDueOn(c.earliest)} · closes ${formatDueOn(c.latest)}`, dueOn: c.latest, link }
      }
      const left = daysUntil(input.today, c.latest)
      if (left < 0) return { ...common, tone: 'overdue', label: `Window closed ${formatDueOn(c.latest)} · not recorded as sent`, dueOn: c.latest, link }
      return { ...common, tone: 'soon', label: left === 0 ? 'Send it today — the window closes today' : `Send by ${formatDueOn(c.latest)} (${days(left)} left)`, dueOn: c.latest, link }
    }
  }
}

// ─── Director elections (BL-151) ────────────────────────────────────

/** SB 406 § 9(a): chapter 17A, and so the amended registration, applies from this day. */
export const GA_REGISTRATION_IN_FORCE = '2027-01-01'
/** § 43-17A-2(d): days to file the amended registration after a change of officers. */
export const GA_AMENDMENT_DAYS = 30

const ELECTION_STEPS = [
  'Plan the dates, the candidates and the ballots in the meeting’s election planner.',
  'After the count, record the votes and the day the results were announced there.',
]

function stepWhen(s: TimelineStep): string {
  if (!s.date) return s.label
  const on = formatDueOn(s.date)
  return s.when === 'by' ? `${s.label} by ${on}` : s.when === 'until' ? `${s.label} until ${on}` : `${s.label} on ${on}`
}

/** One planned election: the next date, a date conflict, or whether the results are recorded. */
function electionRow(
  base: Base,
  state: ComplianceState,
  meeting: ElectionMeeting,
  election: ReturnType<typeof readElection>,
  today: string,
): ComplianceObligation {
  const annual = meeting.type !== 'special'
  const steps = electionTimeline({
    jurisdiction: electionJurisdiction(state),
    meetingType: meeting.type,
    meetingDate: meeting.date,
    election,
    today,
  })
  const recorded = election.candidates.some((c) => c.votes !== null)
  const held = meeting.date < today
  const common = {
    ...base,
    key: `${base.associationId}:director-election:${meeting.id}`,
    kind: 'election' as const,
    title: `Director election at the ${formatDueOn(meeting.date)} ${annual ? 'annual' : 'special'} meeting`,
    steps:
      state === 'CA'
        ? [...ELECTION_STEPS, 'Send every member general notice of the tabulated results within 15 days of the election.']
        : state === 'GA'
          ? [...ELECTION_STEPS, 'If the new board changes the association’s officers, file an amended registration with the Secretary of State (the row below).']
          : ELECTION_STEPS,
    quotes: state === 'CA' ? [CA_ELECTION_RESULTS] : [],
    appliesTo: null,
    link: { href: `/meetings/${meeting.id}/election`, label: 'Open the election planner' },
    official: null,
    deadlineCode: null,
    done: null,
  }

  const conflict = steps.find((s) => s.state === 'conflict')
  if (conflict) return { ...common, tone: 'overdue', label: `Check the dates: ${conflict.label.toLowerCase()}`, dueOn: conflict.date }

  if (held || meeting.date === today) {
    if (state === 'CA' && election.quorumReached === false && !election.reconvenedOn) {
      return { ...common, tone: 'soon', label: 'Quorum not reached · set the reconvened meeting in the planner', dueOn: null }
    }
    if (state === 'CA' && !election.resultsAnnouncedOn) {
      const notice = steps.find((s) => s.key === 'results_notice')
      if (notice?.date) {
        const left = daysUntil(today, notice.date)
        if (left < 0) return { ...common, tone: 'overdue', label: `Results notice was due ${formatDueOn(notice.date)} · not recorded as sent`, dueOn: notice.date }
        if (held) return { ...common, tone: 'soon', label: `Send the results notice by ${formatDueOn(notice.date)} (${days(left)} left)`, dueOn: notice.date }
      }
    }
    if (recorded) {
      return {
        ...common,
        tone: 'done',
        label: election.resultsAnnouncedOn ? `Results recorded · announced ${formatDueOn(election.resultsAnnouncedOn)}` : 'Results recorded',
        dueOn: null,
      }
    }
    if (held) return { ...common, tone: 'unknown', label: `Held ${formatDueOn(meeting.date)} · results not recorded yet`, dueOn: null }
  }

  const next = nextStep(steps)
  const passed = steps.filter((s) => s.state === 'done_or_passed').length
  const check = passed > 0 ? ` · ${passed} earlier ${passed === 1 ? 'date has' : 'dates have'} passed: check ${passed === 1 ? 'it was' : 'they were'} done` : ''
  if (!next || !next.date) {
    return { ...common, tone: 'unknown', label: `Meeting ${formatDueOn(meeting.date)} · enter the election dates in the planner${check}`, dueOn: meeting.date }
  }
  return { ...common, tone: next.state === 'due_soon' ? 'soon' : 'upcoming', label: `${stepWhen(next)}${check}`, dueOn: next.date }
}

/**
 * BL-149: the registration row reads the kit's record too. Registered (or
 * lapsed, or opted out) there shows here; a compliance_deadlines_done row
 * still wins for "done" so its evidence controls keep working.
 */
function gaRegistrationRow(standing: GaRegistrationStanding, row: ComplianceObligation): ComplianceObligation {
  if (row.done) return row
  switch (standing.status) {
    case 'registered':
      return { ...row, tone: 'done', label: gaStandingLabel(standing, formatDueOn) }
    case 'lapsed':
      return { ...row, tone: 'overdue', label: gaStandingLabel(standing, formatDueOn) }
    case 'opted_out':
      return { ...row, tone: 'standing', label: 'Opted out (recorded in the kit) · no fines, fees or accelerated assessments' }
    default:
      return row
  }
}

/** Georgia: the 30-day amended registration once an election's results are recorded. */
function gaAmendmentRow(
  base: Base,
  meeting: ElectionMeeting,
  recordedOn: string,
  today: string,
  record: GaRegistrationRecord,
): ComplianceObligation {
  const common = {
    ...base,
    key: `${base.associationId}:ga-registration-amendment:${meeting.id}`,
    kind: 'registration_amendment' as const,
    title: `Amend the Secretary of State registration after the ${formatDueOn(meeting.date)} election`,
    steps: [
      'Check whether the election, or the board’s vote on officers after it, changed the association’s officers (or anything else on its registration).',
      `If it did, file an amended registration statement with the Secretary of State within ${GA_AMENDMENT_DAYS} days of the change. HomeownerHub counts from the day the results were recorded; if the officers changed later, count from that day.`,
      'File the amended registration in Documents.',
      'Check the Secretary of State’s guidance and confirm with your association’s attorney.',
    ],
    quotes: [GA_REGISTRATION_AMENDMENT, GA_SB406_EFFECTIVE],
    appliesTo: 'Georgia owners’ associations, including HOAs and condominium associations.',
    link: { href: `${GA_REGISTRATION_KIT_HREF}#amendments`, label: 'Mark it in the registration kit' },
    official: { href: GA_SOS_URL, label: GA_SOS_LABEL },
    deadlineCode: null,
    done: null,
    meetingId: meeting.id,
  }
  return gaAmendmentStatus(common, meeting.id, recordedOn, today, record)
}

/**
 * BL-159: Georgia's 30-day amended registration after a board role change
 * made in Settings → Members (changeMemberRole). Same row and same answers
 * as after an election, keyed by the change's id; any amended registration
 * filed on or after the change's day also covers it.
 */
function gaOfficerChangeRow(base: Base, change: GaOfficerChange, today: string, record: GaRegistrationRecord): ComplianceObligation {
  const common = {
    ...base,
    key: `${base.associationId}:ga-registration-amendment:${change.id}`,
    kind: 'registration_amendment' as const,
    title: `Amend the Secretary of State registration after the ${formatDueOn(change.on)} board change`,
    steps: [
      'Someone joined or left the board on the Members page. Check whether that changed the association’s officers on its registration.',
      `If it did, file an amended registration statement with the Secretary of State within ${GA_AMENDMENT_DAYS} days of the change. HomeownerHub counts from the day the role changed in HomeownerHub.`,
      'File the amended registration in Documents.',
      'Check the Secretary of State’s guidance and confirm with your association’s attorney.',
    ],
    quotes: [GA_REGISTRATION_AMENDMENT, GA_SB406_EFFECTIVE],
    appliesTo: 'Georgia owners’ associations, including HOAs and condominium associations.',
    link: { href: `${GA_REGISTRATION_KIT_HREF}#amendments`, label: 'Mark it in the registration kit' },
    official: { href: GA_SOS_URL, label: GA_SOS_LABEL },
    deadlineCode: null,
    done: null,
    meetingId: change.id,
  }
  return gaAmendmentStatus(common, change.id, change.on, today, record)
}

/** The tone and label of an amended-registration row: answered, not yet in force, open, or past day 30. */
function gaAmendmentStatus(
  common: Omit<ComplianceObligation, 'tone' | 'label' | 'dueOn'>,
  triggerId: string,
  recordedOn: string,
  today: string,
  record: GaRegistrationRecord,
): ComplianceObligation {
  // BL-149: the board recorded the amended filing, or that the officers didn't change.
  const answered = amendmentFor(record, triggerId)
  if (answered?.kind === 'filed') {
    return { ...common, tone: 'done', label: `Amended registration filed ${formatDueOn(answered.filing.filedOn)}`, dueOn: null }
  }
  if (answered?.kind === 'no_change') {
    return { ...common, tone: 'done', label: 'Officers didn’t change · no amendment needed', dueOn: null }
  }
  if (recordedOn < GA_REGISTRATION_IN_FORCE) {
    return {
      ...common,
      tone: 'standing',
      label: `Registration starts ${formatDueOn(GA_REGISTRATION_IN_FORCE)}: list the new officers in your first filing`,
      dueOn: null,
    }
  }
  const due = addDays(recordedOn, GA_AMENDMENT_DAYS)
  const left = daysUntil(today, due)
  if (left < 0) return { ...common, tone: 'unknown', label: `Was due ${formatDueOn(due)} if the officers changed`, dueOn: due }
  return { ...common, tone: 'soon', label: `If the officers changed, file by ${formatDueOn(due)} (${days(left)} left)`, dueOn: due }
}

/**
 * Every election the planner holds for this association, in meeting order,
 * with Georgia's amendment after each recorded one. Only elections the
 * board's signed save wrote count; a meeting that is gone is skipped.
 */
function directorElections(
  base: Base,
  a: ComplianceAssociationInput,
  state: ComplianceState,
  input: ComplianceInput,
): ComplianceObligation[] {
  const placeholder = {
    ...base,
    key: `${base.associationId}:director-elections`,
    kind: 'election' as const,
    title: 'Director elections',
    steps: ['Open the annual meeting under Meetings and use its election planner for your state’s dates, the candidates and the ballot kit.'],
    quotes: [],
    appliesTo: null,
    link: { href: '/meetings', label: 'Open Meetings' },
    official: null,
    deadlineCode: null,
    done: null,
    dueOn: null,
  }
  if (input.electionMeetings === null) return [{ ...placeholder, tone: 'failed', label: 'Couldn’t load your elections' }]
  const rows: Array<{ meeting: ElectionMeeting; election: ReturnType<typeof readElection> }> = []
  for (const meetingId of Object.keys(storedElections(a.complianceSettings))) {
    const meeting = input.electionMeetings.get(meetingId)
    if (!meeting) continue
    const election = readElection(a.id, meetingId, a.complianceSettings, input.secret)
    if (election.state !== 'saved') continue
    rows.push({ meeting, election })
  }
  if (rows.length === 0) return [{ ...placeholder, tone: 'unknown', label: 'No election planned in HomeownerHub' }]
  rows.sort((x, y) => x.meeting.date.localeCompare(y.meeting.date) || x.meeting.id.localeCompare(y.meeting.id))
  const record = state === 'GA' ? readGaRegistration(a.id, a.complianceSettings, input.secret).record : null
  return rows.flatMap(({ meeting, election }) => {
    const row = electionRow(base, state, meeting, election, input.today)
    const recorded = election.candidates.some((c) => c.votes !== null) && meeting.date <= input.today
    if (state !== 'GA' || !recorded || !record) return [row]
    return [row, gaAmendmentRow(base, meeting, election.resultsAnnouncedOn ?? meeting.date, input.today, record)]
  })
}

/** BL-159: one amended-registration row per board role change in the signed record, oldest first. */
function gaOfficerChangeRows(base: Base, a: ComplianceAssociationInput, input: ComplianceInput): ComplianceObligation[] {
  const read = readGaRegistration(a.id, a.complianceSettings, input.secret)
  if (read.state !== 'saved') return []
  return (read.record.officerChanges ?? []).map((c) => gaOfficerChangeRow(base, c, input.today, read.record))
}

function obligationsFor(a: ComplianceAssociationInput, state: ComplianceState | null, input: ComplianceInput): ComplianceObligation[] {
  const base: Base = { associationId: a.id, associationName: a.name }
  const acks = readComplianceAcks(a.id, a.complianceSettings, input.secret)
  const elections = state ? directorElections(base, a, state, input) : []
  switch (state) {
    case 'GA': {
      const condo = isGaCondo(state, a.type)
      const standing = gaRegistrationStanding(readGaRegistration(a.id, a.complianceSettings, input.secret), input.today)
      return [
        gaRegistrationRow(standing, deadlineObligation(base, 'ga-sos-registration-2027', acks, input, {
          steps: [
            'Decide as a board: register, or opt out in writing (read what an association that opts out can’t collect).',
            'Gather a copy of your governing documents, the association’s name, address and officers, and a recent financial statement.',
            'File the registration statement with the Secretary of State and pay the fee. Its page says filing opens on or after Jan 1, 2027, through an online portal.',
            'Record the filing day and confirmation number in the registration kit. From Jan 1, 2027, fines, fees and liens are blocked until it is recorded there.',
            'Mark it done here and attach the filed registration or the receipt as evidence.',
            'Confirm the details with your association’s attorney.',
          ],
          quotes: [
            GA_SB406_EFFECTIVE,
            GA_REGISTRATION_BAR,
            GA_REGISTRATION_OPT_OUT,
            GA_REGISTRATION_FILING,
            GA_REGISTRATION_FINANCIALS,
            GA_REGISTRATION_FEE,
          ],
          appliesTo: 'Georgia owners’ associations, including HOAs and condominium associations.',
          link: KIT_LINK,
        })),
        gaRegistrationUpkeep(base, input.today, standing),
        gaAnnualMeeting(base, input, condo),
        ...gaDuties(base, condo),
        deadlineObligation(base, gaCorpRegistrationCode(gaCorpRegistrationYear(input.today)), acks, input, {
          steps: [
            'Check your articles of incorporation: if the association is a Georgia nonprofit corporation, it files this every year.',
            'File the annual registration with the Secretary of State between January 1 and April 1, with the current registered agent, office address and officers.',
            'Mark it done here and attach the filed registration or the receipt as evidence.',
            'If it is late, file as soon as you can and check the corporation’s status on the Secretary of State’s site.',
            'This is separate from the SB 406 owners’ association registration above.',
          ],
          quotes: [
            GA_CORP_REGISTRATION_CONTENTS,
            GA_CORP_REGISTRATION_WINDOW,
            GA_CORP_REGISTRATION_FIRST,
            GA_CORP_REGISTRATION_INITIAL,
            GA_CORP_DISSOLUTION,
            GA_CORP_DISSOLUTION_LATE_REGISTRATION,
          ],
          appliesTo:
            'Georgia associations incorporated as nonprofit corporations (most are). An unincorporated association doesn’t file this.',
          link: null,
        }),
        // BL-155: a condo association gets the Condominium Act rows above instead.
        ...(condo ? [] : [notLoaded(base, 'ga-condominium', 'Georgia Condominium Act rules (condominium associations)')]),
        ...elections,
        ...gaOfficerChangeRows(base, a, input),
      ]
    }
    case 'TX':
      return [
        deadlineObligation(base, 'tx-management-certificate', acks, input, {
          steps: [
            'Record the management certificate in every county where the subdivision lies.',
            'File the same certificate electronically with the Texas Real Estate Commission.',
            'When anything on it changes, record and file an amended certificate.',
            'Mark it done here and attach the recorded certificate or the TREC receipt as evidence.',
          ],
          quotes: [TX_CERTIFICATE_RECORD, TX_CERTIFICATE_TREC],
          appliesTo: 'Texas property owners’ associations under Property Code ch. 209 (not condominiums).',
          link: null,
        }),
        ...elections,
      ]
    case 'FL': {
      const certs = flDirectorCerts(base, input)
      return [...(certs ? [certs] : []), ...elections]
    }
    case 'CA':
      return [caBudgetReport(base, input), ...elections]
    default:
      return [notLoaded(base, 'state-rules', 'Your state’s rules')]
  }
}

/** Every association's obligations, Georgia associations first; and the overdue ones for the banner. */
export function buildComplianceOverview(input: ComplianceInput): ComplianceOverview {
  const groups = input.associations
    .map((a) => {
      const state = complianceState(a.governingLawState, a.state)
      return { associationId: a.id, associationName: a.name, state, obligations: obligationsFor(a, state, input) }
    })
    .sort(
      (x, y) =>
        (x.state ? STATE_ORDER[x.state] : 9) - (y.state ? STATE_ORDER[y.state] : 9) || x.associationName.localeCompare(y.associationName),
    )
  return { groups, overdue: groups.flatMap((g) => g.obligations.filter((o) => o.tone === 'overdue')) }
}

export function stateName(state: ComplianceState | null): string | null {
  return state ? STATE_NAME[state] : null
}

// ─── Summary (monthly board report, board packet) ───────────────────

export interface ComplianceSummary {
  /** Obligations that need the board: overdue, due soon, or upcoming with a date. */
  open: number
  overdue: number
  done: number
  /** The most pressing open one: overdue first, then the soonest date. */
  next: { title: string; label: string; associationName: string } | null
  /** No state rule is loaded for any association. */
  nothingTracked: boolean
  /** BL-151: the most pressing director-election row (or the GA amendment after one); null when none applies. */
  election: { title: string; label: string } | null
}

const OPEN: ReadonlySet<ObligationTone> = new Set(['overdue', 'soon', 'upcoming'])
const RANK: Record<ObligationTone, number> = { overdue: 0, soon: 1, upcoming: 2, unknown: 3, failed: 4, standing: 5, done: 6, not_loaded: 7 }

export function complianceSummary(o: ComplianceOverview): ComplianceSummary {
  const all = o.groups.flatMap((g) => g.obligations)
  const open = all.filter((x) => OPEN.has(x.tone))
  const byUrgency = (a: ComplianceObligation, b: ComplianceObligation) =>
    RANK[a.tone] - RANK[b.tone] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
  const pick = [...open].sort(byUrgency)[0]
  const electionPick = all.filter((x) => x.kind === 'election' || x.kind === 'registration_amendment').sort(byUrgency)[0]
  return {
    open: open.length,
    overdue: open.filter((x) => x.tone === 'overdue').length,
    done: all.filter((x) => x.tone === 'done').length,
    next: pick ? { title: pick.title, label: pick.label, associationName: pick.associationName } : null,
    nothingTracked: all.every((x) => x.tone === 'not_loaded'),
    election: electionPick ? { title: electionPick.title, label: electionPick.label } : null,
  }
}
