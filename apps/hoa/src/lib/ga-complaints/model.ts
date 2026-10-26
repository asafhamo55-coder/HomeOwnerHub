/**
 * BL-161: the Georgia SB 406 automatic stay. When a resident files a
 * complaint with the Secretary of State, "The filing of a complaint ...
 * shall act as an automatic stay prohibiting the respondent from collecting
 * or attempting to collect from the complainant any fines or fees that are
 * the subject of the complaint or related to the subject of the complaint"
 * (O.C.G.A. § 43-17A-5(c), Ga. L. 2026, SB 406 § 2, in force January 1,
 * 2027 under § 9(a)).
 *
 * Pure, client-safe and dependency-free apart from ../ga-registration/model
 * (itself dependency-free): packages/jobs (the nightly late-fee job)
 * imports ./store.ts, which imports this file, by relative path, so neither
 * may use the `@/` alias.
 *
 * WHAT THE BOARD RECORDS (associations.compliance_settings[ga_sos_complaints],
 * signed by ./store.ts; no migration), per unit:
 *   - the day the complaint was filed (as the board learned it);
 *   - what it is about, as a code: fines, fees, or both (never free text:
 *     the complaint itself stays outside HomeownerHub);
 *   - the day the hearing officer rendered conclusions (the "resolved"
 *     date), once known;
 *   - whether the hearing officer extended the stay by 15 days.
 *
 * WHAT IT MEANS (complaintStayOn). The stay runs from the filing day. It
 * "shall expire upon the rendering of the hearing officer's conclusions",
 * which HomeownerHub reads as: the last stayed day is the day before the
 * conclusions, or, when extended, the 15th day after them. The app can't
 * tell which fines or fees are "related to the subject of the complaint",
 * so while a stay runs it holds back every fine and every fee for that
 * unit. Dues are not fines or fees and are not held back.
 *
 * THE GATE (GA_COMPLAINT_STAY_FROM). From January 1, 2027 the state law
 * check (lib/compliance/statute-drift.ts) blocks fines and letters that
 * list fines or fees for that unit (override: attorney advised only,
 * audited), and the late-fee job skips the unit. Before that day the
 * statute is not in force: the check warns only.
 */

import { UUID, isCalendarDay } from '../ga-registration/model'

export { UUID, isCalendarDay }

/** associations.compliance_settings key. */
export const GA_COMPLAINTS_KEY = 'ga_sos_complaints'
/** SB 406 § 9(a): chapter 43-17A, the stay included, is in force from this day. */
export const GA_COMPLAINT_STAY_FROM = '2027-01-01'
/** § 43-17A-5(c): the hearing officer may extend the stay this many days after the conclusions. */
export const GA_COMPLAINT_EXTENSION_DAYS = 15
/** audit_log.action for one change to the record. Ids and codes only. */
export const GA_COMPLAINT_AUDIT_ACTION = 'ga_complaint.updated'
export const MAX_COMPLAINTS_PER_UNIT = 10
export const MAX_COMPLAINT_UNITS = 500

export type GaComplaintSubject = 'fines' | 'fees' | 'both'
export const GA_COMPLAINT_SUBJECTS: readonly GaComplaintSubject[] = ['fines', 'fees', 'both']
export const GA_COMPLAINT_SUBJECT_LABEL: Record<GaComplaintSubject, string> = {
  fines: 'Fines',
  fees: 'Fees',
  both: 'Fines and fees',
}

export interface GaComplaint {
  id: string
  /** YYYY-MM-DD: the day the complaint was filed with the Secretary of State. */
  filedOn: string
  subject: GaComplaintSubject
  /** YYYY-MM-DD: the day the hearing officer rendered conclusions; null until then. */
  conclusionsOn: string | null
  /** The hearing officer extended the stay 15 days past the conclusions. Only with conclusionsOn. */
  extended: boolean
}

export interface GaComplaintsRecord {
  /** unit id -> that unit's complaints. */
  units: Record<string, GaComplaint[]>
}

export const EMPTY_GA_COMPLAINTS: GaComplaintsRecord = { units: {} }

// ─── validation ──────────────────────────────────────────────────────

export function isGaComplaint(v: unknown): v is GaComplaint {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  if (typeof c.id !== 'string' || !UUID.test(c.id)) return false
  if (!isCalendarDay(c.filedOn)) return false
  if (!GA_COMPLAINT_SUBJECTS.includes(c.subject as GaComplaintSubject)) return false
  if (!(c.conclusionsOn === null || (isCalendarDay(c.conclusionsOn) && c.conclusionsOn >= (c.filedOn as string)))) return false
  if (typeof c.extended !== 'boolean') return false
  return !(c.extended && c.conclusionsOn === null)
}

export function isGaComplaintsRecord(v: unknown): v is GaComplaintsRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const units = (v as Record<string, unknown>).units
  if (typeof units !== 'object' || units === null || Array.isArray(units)) return false
  const entries = Object.entries(units as Record<string, unknown>)
  if (entries.length > MAX_COMPLAINT_UNITS) return false
  const ids = new Set<string>()
  for (const [unitId, list] of entries) {
    if (!UUID.test(unitId) || !Array.isArray(list) || list.length > MAX_COMPLAINTS_PER_UNIT) return false
    for (const c of list) {
      if (!isGaComplaint(c) || ids.has(c.id)) return false
      ids.add(c.id)
    }
  }
  return true
}

/**
 * Only the record's own fields, in a fixed order: unit ids sorted (jsonb
 * reorders object keys), each unit's complaints by filing day then id,
 * units without complaints dropped. What the signature covers.
 */
export function cleanGaComplaints(r: GaComplaintsRecord): GaComplaintsRecord {
  const units: Record<string, GaComplaint[]> = {}
  for (const unitId of Object.keys(r.units).sort()) {
    const list = (r.units[unitId] ?? [])
      .map((c) => ({ id: c.id, filedOn: c.filedOn, subject: c.subject, conclusionsOn: c.conclusionsOn, extended: c.extended }))
      .sort((a, b) => (a.filedOn === b.filedOn ? a.id.localeCompare(b.id) : a.filedOn.localeCompare(b.filedOn)))
    if (list.length > 0) units[unitId] = list
  }
  return { units }
}

// ─── the stay ────────────────────────────────────────────────────────

/** `day` plus `n` calendar days (n may be negative). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

/** The last day the stay runs, or null while no conclusions are recorded (it runs on). */
export function stayLastDay(c: Pick<GaComplaint, 'conclusionsOn' | 'extended'>): string | null {
  if (c.conclusionsOn === null) return null
  return c.extended ? addDays(c.conclusionsOn, GA_COMPLAINT_EXTENSION_DAYS) : addDays(c.conclusionsOn, -1)
}

export function stayRunsOn(c: Pick<GaComplaint, 'filedOn' | 'conclusionsOn' | 'extended'>, day: string): boolean {
  if (day < c.filedOn) return false
  const last = stayLastDay(c)
  return last === null || day <= last
}

/**
 * What the state law check and the panel take: the complaints recorded for
 * the unit (or units) in question, and whether the stored record verified.
 * `verified: false` means something is stored that HomeownerHub didn't
 * sign, so a stay can't be ruled out: treated as a running stay (fail
 * closed: nothing is collected on a record nobody can trust).
 */
export interface GaComplaintStayGate {
  verified: boolean
  complaints: readonly Pick<GaComplaint, 'filedOn' | 'conclusionsOn' | 'extended'>[]
}

export type StayOnDay =
  | { kind: 'none' }
  /** filedOn: the earliest running complaint; lastDay: null while any runs on with no conclusions. */
  | { kind: 'running'; filedOn: string; lastDay: string | null }
  | { kind: 'unverified' }

export function complaintStayOn(gate: GaComplaintStayGate, day: string): StayOnDay {
  if (!gate.verified) return { kind: 'unverified' }
  const running = gate.complaints.filter((c) => stayRunsOn(c, day))
  if (running.length === 0) return { kind: 'none' }
  const filedOn = running.map((c) => c.filedOn).sort()[0]!
  const lasts = running.map(stayLastDay)
  const sorted = (lasts.filter((l) => l !== null) as string[]).sort()
  const lastDay = lasts.includes(null) ? null : sorted[sorted.length - 1]!
  return { kind: 'running', filedOn, lastDay }
}

/** The stay is the law from Jan 1, 2027: before that a recorded complaint is a warning only. */
export function gaComplaintStayBlocks(day: string): boolean {
  return day >= GA_COMPLAINT_STAY_FROM
}

/** The units whose stay runs on `day`; 'all' when the record can't be verified. */
export function stayedUnitsOn(read: { state: 'saved' | 'none' | 'unverified'; record: GaComplaintsRecord }, day: string): ReadonlySet<string> | 'all' {
  if (read.state === 'unverified') return 'all'
  const out = new Set<string>()
  for (const [unitId, list] of Object.entries(read.record.units)) if (list.some((c) => stayRunsOn(c, day))) out.add(unitId)
  return out
}

/** The gate for these units from a read record. */
export function stayGateFor(read: { state: 'saved' | 'none' | 'unverified'; record: GaComplaintsRecord }, unitIds: readonly string[]): GaComplaintStayGate {
  if (read.state === 'unverified') return { verified: false, complaints: [] }
  return { verified: true, complaints: unitIds.flatMap((u) => read.record.units[u] ?? []) }
}

// ─── edits (the server action applies one, then signs) ───────────────

export type GaComplaintEdit =
  | { op: 'add'; unitId: string; complaint: GaComplaint }
  | { op: 'conclude'; unitId: string; complaintId: string; conclusionsOn: string | null; extended: boolean }
  | { op: 'remove'; unitId: string; complaintId: string }

export type GaComplaintEditResult = { ok: true; record: GaComplaintsRecord } | { ok: false; error: string }

export function applyGaComplaintEdit(record: GaComplaintsRecord, edit: GaComplaintEdit): GaComplaintEditResult {
  const r = cleanGaComplaints(record)
  if (!UUID.test(edit.unitId)) return { ok: false, error: 'Invalid input.' }
  const list = r.units[edit.unitId] ?? []
  switch (edit.op) {
    case 'add': {
      const c = edit.complaint
      if (!isGaComplaint(c)) return { ok: false, error: 'Check the complaint details.' }
      if (list.length >= MAX_COMPLAINTS_PER_UNIT) return { ok: false, error: `Up to ${MAX_COMPLAINTS_PER_UNIT} complaints can be kept for one home. Remove an old one first.` }
      if (!r.units[edit.unitId] && Object.keys(r.units).length >= MAX_COMPLAINT_UNITS) return { ok: false, error: 'Too many homes have complaints recorded. Remove old ones first.' }
      if (Object.values(r.units).some((l) => l.some((x) => x.id === c.id))) return { ok: false, error: 'That complaint is already recorded.' }
      return { ok: true, record: cleanGaComplaints({ units: { ...r.units, [edit.unitId]: [...list, c] } }) }
    }
    case 'conclude': {
      const c = list.find((x) => x.id === edit.complaintId)
      if (!c) return { ok: false, error: 'That complaint isn’t recorded for this home.' }
      const next: GaComplaint = { ...c, conclusionsOn: edit.conclusionsOn, extended: edit.conclusionsOn === null ? false : edit.extended }
      if (!isGaComplaint(next)) return { ok: false, error: 'The conclusions day can’t be before the day the complaint was filed.' }
      return { ok: true, record: cleanGaComplaints({ units: { ...r.units, [edit.unitId]: list.map((x) => (x.id === c.id ? next : x)) } }) }
    }
    case 'remove': {
      if (!list.some((x) => x.id === edit.complaintId)) return { ok: false, error: 'That complaint isn’t recorded for this home.' }
      return { ok: true, record: cleanGaComplaints({ units: { ...r.units, [edit.unitId]: list.filter((x) => x.id !== edit.complaintId) } }) }
    }
  }
}
