/**
 * BL-149: the Georgia SB 406 registration record and what it means today.
 * Pure, client-safe and dependency-free: packages/jobs (the nightly
 * late-fee job) imports ./store.ts, which imports this file, by relative
 * path, so neither may use the `@/` alias.
 *
 * WHAT THE BOARD RECORDS (associations.compliance_settings[ga_registration],
 * signed by ./store.ts; no migration):
 *   - its decision: register, or opt out in writing (§ 43-17A-2(a)(2)(B));
 *   - each filing: the first registration, each annual renewal, and each
 *     amended registration, with the day it was filed and the Secretary of
 *     State's confirmation number;
 *   - for an amendment after a recorded election (BL-151), the meeting it
 *     answers, or that the officers did not change;
 *   - the mailing address and registered agent the board typed, for the
 *     printed fill-in sheet (the app holds neither anywhere else).
 *
 * WHAT IT MEANS (gaRegistrationStanding). Every registration statement
 * expires on December 31 (§ 43-17A-2(c)). HomeownerHub counts a filing as
 * covering the calendar year the board says it covers (`coversYear`): the
 * first registration, its own year (never before 2027, when the chapter
 * takes effect, SB 406 § 9(a)); a renewal, the year it renews for. Past the
 * last covered Dec 31 the registration has lapsed.
 *
 * THE GATE (GA_REGISTRATION_GATE_FROM). From Jan 1, 2027 an association
 * that is not registered "shall [not] collect fines or fees against any
 * owner, or file or record liens or initiate foreclosure proceedings"
 * (§ 43-17A-2(a)(2)(A)); an association that opted out may not "assess or
 * collect fines or fees or accelerated assessments" ((a)(2)(B)(ii)). The
 * state law check (lib/compliance/statute-drift.ts) warns before that day
 * and blocks from it; the late-fee job charges nothing.
 */

export const GA_REGISTRATION_KEY = 'ga_registration'
/** SB 406 § 9(a): chapter 43-17A, and so the registration bar, is in force from this day. */
export const GA_REGISTRATION_GATE_FROM = '2027-01-01'
/** The first year a registration can cover. */
export const GA_FIRST_REGISTRATION_YEAR = 2027
/** § 43-17A-2(d): days to file an amended registration after a change. */
export const GA_AMENDMENT_WINDOW_DAYS = 30
export const GA_REGISTRATION_KIT_HREF = '/compliance/ga-registration'
/** audit_log.action for every change to the registration record (ids and codes only). */
export const GA_REGISTRATION_AUDIT_ACTION = 'ga_registration.updated'

export const MAX_FILINGS = 40
export const MAX_NO_CHANGE = 20
export const MAX_CONFIRMATION = 64
export const MAX_DETAIL = 200

export type GaDecision = 'register' | 'opt_out'
export type GaFilingKind = 'registration' | 'renewal' | 'amendment'
export const GA_FILING_KINDS: readonly GaFilingKind[] = ['registration', 'renewal', 'amendment']
export type GaAmendmentReason = 'officers' | 'name' | 'address' | 'other'
export const GA_AMENDMENT_REASONS: readonly GaAmendmentReason[] = ['officers', 'name', 'address', 'other']

export const GA_FILING_LABEL: Record<GaFilingKind, string> = {
  registration: 'Registration',
  renewal: 'Renewal',
  amendment: 'Amended registration',
}

export const GA_AMENDMENT_REASON_LABEL: Record<GaAmendmentReason, string> = {
  officers: 'Officers changed',
  name: 'Name changed',
  address: 'Address changed',
  other: 'Another change to the business or control of the association',
}

export interface GaFiling {
  id: string
  kind: GaFilingKind
  /** YYYY-MM-DD. */
  filedOn: string
  /** The Secretary of State's confirmation or filing number, or null. */
  confirmation: string | null
  /** registration and renewal: the calendar year it covers; null for an amendment. */
  coversYear: number | null
  /** amendment only. */
  reason: GaAmendmentReason | null
  /** amendment only: the meeting whose election it answers (BL-151), or null. */
  meetingId: string | null
}

export interface GaRegistrationRecord {
  decision: GaDecision | null
  /** YYYY-MM-DD the board recorded its decision, or null. */
  decidedOn: string | null
  filings: GaFiling[]
  /** Meetings whose election the board says changed no officers: no amendment needed. */
  noChange: string[]
  mailingAddress: string | null
  registeredAgent: string | null
}

export const EMPTY_GA_REGISTRATION: GaRegistrationRecord = {
  decision: null,
  decidedOn: null,
  filings: [],
  noChange: [],
  mailingAddress: null,
  registeredAgent: null,
}

// ─── validation ──────────────────────────────────────────────────────

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
/** Letters, digits and the punctuation a filing number uses. Nothing else is stored. */
const CONFIRMATION = /^[A-Za-z0-9][A-Za-z0-9 #./-]*$/

export function isCalendarDay(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = DAY.exec(v)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

export function isConfirmation(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_CONFIRMATION && CONFIRMATION.test(v)
}

function isDetail(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && v.length > 0 && v.length <= MAX_DETAIL && !/[\u0000-\u001f]/.test(v))
}

function isYear(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= GA_FIRST_REGISTRATION_YEAR && v <= 2100
}

export function isGaFiling(v: unknown): v is GaFiling {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const f = v as Record<string, unknown>
  if (typeof f.id !== 'string' || !UUID.test(f.id)) return false
  if (!GA_FILING_KINDS.includes(f.kind as GaFilingKind)) return false
  if (!isCalendarDay(f.filedOn)) return false
  if (!(f.confirmation === null || isConfirmation(f.confirmation))) return false
  if (f.kind === 'amendment') {
    return (
      f.coversYear === null &&
      GA_AMENDMENT_REASONS.includes(f.reason as GaAmendmentReason) &&
      (f.meetingId === null || (typeof f.meetingId === 'string' && UUID.test(f.meetingId)))
    )
  }
  return isYear(f.coversYear) && f.reason === null && f.meetingId === null
}

export function isGaRegistrationRecord(v: unknown): v is GaRegistrationRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  return (
    (r.decision === null || r.decision === 'register' || r.decision === 'opt_out') &&
    (r.decidedOn === null || isCalendarDay(r.decidedOn)) &&
    Array.isArray(r.filings) &&
    r.filings.length <= MAX_FILINGS &&
    r.filings.every(isGaFiling) &&
    new Set((r.filings as GaFiling[]).map((f) => f.id)).size === r.filings.length &&
    Array.isArray(r.noChange) &&
    r.noChange.length <= MAX_NO_CHANGE &&
    r.noChange.every((id) => typeof id === 'string' && UUID.test(id)) &&
    isDetail(r.mailingAddress) &&
    isDetail(r.registeredAgent)
  )
}

/** Only the record's own fields, in a fixed order (what the signature covers). */
export function cleanGaRegistration(r: GaRegistrationRecord): GaRegistrationRecord {
  return {
    decision: r.decision,
    decidedOn: r.decidedOn,
    filings: r.filings.map((f) => ({
      id: f.id,
      kind: f.kind,
      filedOn: f.filedOn,
      confirmation: f.confirmation,
      coversYear: f.coversYear,
      reason: f.reason,
      meetingId: f.meetingId,
    })),
    noChange: [...r.noChange],
    mailingAddress: r.mailingAddress,
    registeredAgent: r.registeredAgent,
  }
}

/** A typed confirmation number, trimmed; '' is none; anything else unreadable is false. */
export function parseConfirmation(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return false
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t === '') return null
  return isConfirmation(t) ? t : false
}

/** A typed address or agent line, trimmed and on one line; '' is none. */
export function parseDetail(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return false
  const t = raw.replace(/\s+/g, ' ').trim()
  if (t === '') return null
  return isDetail(t) ? t : false
}

/** The year a new filing covers unless the board says otherwise. */
export function defaultCoversYear(kind: 'registration' | 'renewal', filedOn: string): number {
  const year = Number(filedOn.slice(0, 4))
  if (kind === 'registration') return Math.max(year, GA_FIRST_REGISTRATION_YEAR)
  // A renewal is due by Dec 31 for the year after; one filed in the first
  // months of a year (late) renews that year.
  const month = Number(filedOn.slice(5, 7))
  return Math.max(month >= 7 ? year + 1 : year, GA_FIRST_REGISTRATION_YEAR)
}

// ─── standing ────────────────────────────────────────────────────────

export type GaRegistrationStatus =
  /** Registered, and the registration covers today. */
  | 'registered'
  /** Registered once, but no filing covers this year. */
  | 'lapsed'
  /** Nothing recorded. */
  | 'not_registered'
  /** The board recorded that it opted out in writing. */
  | 'opted_out'
  /** Something is stored but its signature doesn't verify: treated as not registered. */
  | 'unverified'

export interface GaRegistrationStanding {
  status: GaRegistrationStatus
  /** The first registration's filing day, when one is recorded. */
  registeredOn: string | null
  /** The last Dec 31 a recorded filing covers, or null. */
  coveredThrough: string | null
}

/** The last Dec 31 the registration and renewal filings cover, or null when none is recorded. */
export function coveredThrough(filings: readonly GaFiling[]): string | null {
  const years = filings.filter((f) => f.kind !== 'amendment' && f.coversYear !== null).map((f) => f.coversYear as number)
  return years.length === 0 ? null : `${Math.max(...years)}-12-31`
}

export function gaRegistrationStanding(
  read: { state: 'saved' | 'none' | 'unverified'; record: GaRegistrationRecord },
  today: string,
): GaRegistrationStanding {
  if (read.state === 'unverified') return { status: 'unverified', registeredOn: null, coveredThrough: null }
  const r = read.record
  const firsts = r.filings.filter((f) => f.kind === 'registration').map((f) => f.filedOn).sort()
  const registeredOn = firsts[0] ?? null
  const through = coveredThrough(r.filings)
  if (r.decision === 'opt_out') return { status: 'opted_out', registeredOn, coveredThrough: through }
  if (!through) return { status: 'not_registered', registeredOn, coveredThrough: null }
  // Nothing is in force before 2027, so a registration covering 2027 counts from the day it was filed.
  return { status: today <= through ? 'registered' : 'lapsed', registeredOn, coveredThrough: through }
}

/** What the state law check needs: the status and the day it is checked on. */
export interface GaRegistrationGateInput {
  status: GaRegistrationStatus
  /** YYYY-MM-DD, the association's today (or the letter date). */
  today: string
}

/** The gate is live from Jan 1, 2027: before that a missing registration is a warning only. */
export function gaGateBlocks(today: string): boolean {
  return today >= GA_REGISTRATION_GATE_FROM
}

/** Not registered in any way that counts. */
export function gaUnregistered(status: GaRegistrationStatus): boolean {
  return status !== 'registered'
}

/** One line for the kit header and the registration row. */
export function gaStandingLabel(s: GaRegistrationStanding, formatDay: (ymd: string) => string): string {
  switch (s.status) {
    case 'registered':
      return `Registered${s.registeredOn ? ` ${formatDay(s.registeredOn)}` : ''} · current through ${formatDay(s.coveredThrough!)}`
    case 'lapsed':
      return `Registration lapsed after ${formatDay(s.coveredThrough!)} · record the renewal`
    case 'opted_out':
      return 'Opted out of registration'
    case 'unverified':
      return 'Registration record can’t be verified · record it again'
    case 'not_registered':
      return 'Not recorded as registered'
  }
}

// ─── amendments after an election (BL-151) ───────────────────────────

/** The amendment the board recorded for this meeting's election, or that none was needed. */
export function amendmentFor(
  record: GaRegistrationRecord,
  meetingId: string,
): { kind: 'filed'; filing: GaFiling } | { kind: 'no_change' } | null {
  const filing = record.filings.find((f) => f.kind === 'amendment' && f.meetingId === meetingId)
  if (filing) return { kind: 'filed', filing }
  return record.noChange.includes(meetingId) ? { kind: 'no_change' } : null
}

// ─── edits (the server action applies one, then signs) ───────────────

export type GaRegistrationEdit =
  | { op: 'decide'; decision: GaDecision; today: string }
  | { op: 'add_filing'; filing: GaFiling }
  | { op: 'remove_filing'; filingId: string }
  | { op: 'no_change'; meetingId: string }
  | { op: 'undo_no_change'; meetingId: string }
  | { op: 'details'; mailingAddress: string | null; registeredAgent: string | null }

export type GaEditResult = { ok: true; record: GaRegistrationRecord } | { ok: false; error: string }

export function applyGaRegistrationEdit(record: GaRegistrationRecord, edit: GaRegistrationEdit): GaEditResult {
  const r = cleanGaRegistration(record)
  switch (edit.op) {
    case 'decide':
      return { ok: true, record: { ...r, decision: edit.decision, decidedOn: edit.today } }
    case 'add_filing': {
      const f = edit.filing
      if (!isGaFiling(f)) return { ok: false, error: 'Check the filing details.' }
      if (r.filings.length >= MAX_FILINGS) return { ok: false, error: `Up to ${MAX_FILINGS} filings can be kept. Remove an old one first.` }
      if (r.filings.some((x) => x.id === f.id)) return { ok: false, error: 'That filing is already recorded.' }
      if (f.kind === 'amendment' && f.meetingId && r.filings.some((x) => x.kind === 'amendment' && x.meetingId === f.meetingId)) {
        return { ok: false, error: 'An amendment is already recorded for that election.' }
      }
      // Recording a registration or a renewal means the association registers.
      const decision: GaDecision | null = f.kind === 'amendment' ? r.decision : 'register'
      const decidedOn = decision === r.decision ? r.decidedOn : f.filedOn
      const noChange = f.meetingId ? r.noChange.filter((id) => id !== f.meetingId) : r.noChange
      return { ok: true, record: { ...r, decision, decidedOn, noChange, filings: [...r.filings, f].sort((a, b) => a.filedOn.localeCompare(b.filedOn) || a.id.localeCompare(b.id)) } }
    }
    case 'remove_filing': {
      if (!r.filings.some((f) => f.id === edit.filingId)) return { ok: false, error: 'That filing isn’t recorded.' }
      return { ok: true, record: { ...r, filings: r.filings.filter((f) => f.id !== edit.filingId) } }
    }
    case 'no_change': {
      if (r.filings.some((f) => f.kind === 'amendment' && f.meetingId === edit.meetingId)) {
        return { ok: false, error: 'An amendment is already recorded for that election.' }
      }
      if (r.noChange.includes(edit.meetingId)) return { ok: true, record: r }
      if (r.noChange.length >= MAX_NO_CHANGE) return { ok: false, error: 'Too many elections are marked. Remove an old one first.' }
      return { ok: true, record: { ...r, noChange: [...r.noChange, edit.meetingId] } }
    }
    case 'undo_no_change':
      return { ok: true, record: { ...r, noChange: r.noChange.filter((id) => id !== edit.meetingId) } }
    case 'details':
      return { ok: true, record: { ...r, mailingAddress: edit.mailingAddress, registeredAgent: edit.registeredAgent } }
  }
}
