/**
 * BL-113 — the ARC decision clock.
 *
 * A board setting, "Decide ARC applications within N days", and the
 * days-left math behind the chip on /arc and /arc/[id], the overdue banner
 * and the daily digest's ARC lines. Board-facing only: nothing here is
 * ever sent to a resident.
 *
 * STORAGE. No migration: associations.compliance_settings[ARC_CLOCK_KEY],
 * next to pay_by_zelle, resident_notifications and resident_assistant.
 * Every write keeps the other keys.
 *
 * WHY SIGNED. Same reason as those (lib/resident-notify/settings.ts): until
 * 0063 is applied any org member can PATCH compliance_settings with their
 * own session. Only a value whose HMAC verifies with the server-only secret
 * is the board's. A value that does not verify reads as the default
 * (30 calendar days) and the settings form says so.
 *
 * DEFAULT. 30 calendar days. The governing-docs brain (W1) does not extract
 * an ARC review period today, so there is no parsed value to start from;
 * the form tells the board to check its declaration.
 *
 * Pure and dependency-free (node:crypto only) on purpose: packages/jobs
 * (the daily digest) imports this file by relative path, the same way it
 * imports lib/inbox/waiting.ts, so it must not use the `@/` alias.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const ARC_CLOCK_KEY = 'arc_decision_clock'
export const DEFAULT_ARC_DECISION_DAYS = 30
export const MIN_ARC_DECISION_DAYS = 1
export const MAX_ARC_DECISION_DAYS = 365
/** Amber at or below this many days left. */
export const ARC_DUE_SOON_DAYS = 7
/** The digest lists applications due within this many days. */
export const ARC_DIGEST_DUE_DAYS = 3
/** Calendar dates are taken in this zone, like the digest cron. */
export const ARC_CLOCK_TIME_ZONE = 'America/New_York'

const SIGNATURE_DOMAIN = 'arc-decision-clock:v1'

export type ArcDayKind = 'calendar' | 'business'

export interface ArcClockSettings {
  days: number
  dayKind: ArcDayKind
}

export const DEFAULT_ARC_CLOCK: ArcClockSettings = { days: DEFAULT_ARC_DECISION_DAYS, dayKind: 'calendar' }

// ─── Settings: sign / read / merge ──────────────────────────────────

export interface ArcClockStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.arc_decision_clock. */
export interface StoredArcClockSettings {
  days: number
  day_kind: ArcDayKind
  updated_at: string
  updated_by: string | null
  sig: string
}

export type ArcClockReadResult =
  | ({ state: 'configured' } & ArcClockSettings & ArcClockStamp)
  | ({ state: 'not_configured' } & ArcClockSettings)
  /** Present but not written by the signed board save. Uses the default. */
  | ({ state: 'unverified' } & ArcClockSettings)

type Unsigned = Omit<StoredArcClockSettings, 'sig'>

/**
 * The server-only signing secret. Same chain as paySettingsSecret()
 * (lib/pay-by-zelle.ts), repeated here because this file is imported by
 * packages/jobs and may not import app code. clock.test.ts pins the two
 * together.
 */
export function arcClockSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PAY_SETTINGS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

export function isValidArcDecisionDays(days: unknown): days is number {
  return (
    typeof days === 'number' &&
    Number.isInteger(days) &&
    days >= MIN_ARC_DECISION_DAYS &&
    days <= MAX_ARC_DECISION_DAYS
  )
}

function isDayKind(v: unknown): v is ArcDayKind {
  return v === 'calendar' || v === 'business'
}

function payload(associationId: string, s: Unsigned): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, s.days, s.day_kind, s.updated_at, s.updated_by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signArcClockSettings(
  associationId: string,
  settings: ArcClockSettings,
  stamp: ArcClockStamp,
  secret: string,
): StoredArcClockSettings {
  if (!isValidArcDecisionDays(settings.days)) throw new RangeError('days out of range')
  if (!isDayKind(settings.dayKind)) throw new RangeError('unknown day kind')
  const unsigned: Unsigned = {
    days: settings.days,
    day_kind: settings.dayKind,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredArcClockSettings {
  return (
    isValidArcDecisionDays(v.days) &&
    isDayKind(v.day_kind) &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readArcClockSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): ArcClockReadResult {
  const raw = asObject(complianceSettings)?.[ARC_CLOCK_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured', ...DEFAULT_ARC_CLOCK }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified', ...DEFAULT_ARC_CLOCK }
  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: 'unverified', ...DEFAULT_ARC_CLOCK }
  }
  return {
    state: 'configured',
    days: obj.days,
    dayKind: obj.day_kind,
    updatedAt: obj.updated_at,
    updatedBy: obj.updated_by,
  }
}

/** compliance_settings with ours replaced; every other key kept. */
export function withArcClockSettings(complianceSettings: unknown, stored: StoredArcClockSettings): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [ARC_CLOCK_KEY]: stored }
}

// ─── Day math ───────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** The calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function localDate(at: string | number | Date, timeZone: string = ARC_CLOCK_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function dayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS)
}

function fromDayIndex(i: number): string {
  return new Date(i * DAY_MS).toISOString().slice(0, 10)
}

function isWeekend(i: number): boolean {
  const dow = new Date(i * DAY_MS).getUTCDay()
  return dow === 0 || dow === 6
}

/** Weekdays in (fromIdx, toIdx]. No holidays: the board's declaration decides those. */
function weekdaysBetween(fromIdx: number, toIdx: number): number {
  let n = 0
  for (let i = fromIdx + 1; i <= toIdx; i++) if (!isWeekend(i)) n++
  return n
}

/**
 * The last day to decide. Day 1 is the day after submission; with business
 * days, day 1 is the first weekday after submission and weekends are
 * skipped, so the due date is always a weekday.
 */
export function arcDueDate(submittedYmd: string, settings: ArcClockSettings): string {
  const start = dayIndex(submittedYmd)
  if (settings.dayKind === 'calendar') return fromDayIndex(start + settings.days)
  let i = start
  let counted = 0
  while (counted < settings.days) {
    i++
    if (!isWeekend(i)) counted++
  }
  return fromDayIndex(i)
}

/**
 * Days left from `todayYmd` to `dueYmd`, in the configured kind. 0 means due
 * today; negative means overdue by that many days. A business-day count
 * that lands on 0 after the due date (a weekend right after a Friday due
 * date) still reads as 1 day overdue: the deadline has passed.
 */
export function arcDaysLeft(todayYmd: string, dueYmd: string, dayKind: ArcDayKind): number {
  const today = dayIndex(todayYmd)
  const due = dayIndex(dueYmd)
  if (dayKind === 'calendar') return due - today
  if (today <= due) return weekdaysBetween(today, due)
  return -Math.max(1, weekdaysBetween(due, today))
}

// ─── Clock state (chip, banner, digest) ─────────────────────────────

export type ArcClockTone = 'ok' | 'soon' | 'overdue'

export interface ArcClock {
  dueDate: string
  /** Negative when overdue. */
  daysLeft: number
  tone: ArcClockTone
  /** "12 days left", "Due today", "3 business days overdue". */
  label: string
  dayKind: ArcDayKind
}

/** Statuses the clock runs for: the application still needs a decision. */
export const ARC_OPEN_STATUSES = ['submitted', 'in_review'] as const

export function isArcOpen(status: string): boolean {
  return (ARC_OPEN_STATUSES as readonly string[]).includes(status)
}

function plural(n: number, kind: ArcDayKind): string {
  const unit = kind === 'business' ? 'business day' : 'day'
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

export function arcClockLabel(daysLeft: number, dayKind: ArcDayKind): string {
  if (daysLeft === 0) return 'Due today'
  if (daysLeft > 0) return `${plural(daysLeft, dayKind)} left`
  return `${plural(-daysLeft, dayKind)} overdue`
}

export function arcClockTone(daysLeft: number): ArcClockTone {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= ARC_DUE_SOON_DAYS) return 'soon'
  return 'ok'
}

/**
 * The clock for one application, or null when it no longer runs (decided
 * or withdrawn).
 */
export function arcClock(input: {
  status: string
  submittedAt: string
  settings: ArcClockSettings
  now?: number | Date | string
  timeZone?: string
}): ArcClock | null {
  if (!isArcOpen(input.status)) return null
  const tz = input.timeZone ?? ARC_CLOCK_TIME_ZONE
  const dueDate = arcDueDate(localDate(input.submittedAt, tz), input.settings)
  const daysLeft = arcDaysLeft(localDate(input.now ?? Date.now(), tz), dueDate, input.settings.dayKind)
  return {
    dueDate,
    daysLeft,
    tone: arcClockTone(daysLeft),
    label: arcClockLabel(daysLeft, input.settings.dayKind),
    dayKind: input.settings.dayKind,
  }
}

/** Digest counts: overdue, and due within ARC_DIGEST_DUE_DAYS (today included). */
export function arcDigestCounts(
  rows: Array<{ status: string; submittedAt: string; settings: ArcClockSettings }>,
  now: number | Date | string,
): { overdue: number; dueSoon: number } {
  let overdue = 0
  let dueSoon = 0
  for (const r of rows) {
    const c = arcClock({ status: r.status, submittedAt: r.submittedAt, settings: r.settings, now })
    if (!c) continue
    if (c.daysLeft < 0) overdue++
    else if (c.daysLeft <= ARC_DIGEST_DUE_DAYS) dueSoon++
  }
  return { overdue, dueSoon }
}

// ─── Plain-language notes ───────────────────────────────────────────

/**
 * Said wherever the deadline is shown. No statute in our sources
 * (scripts/fixtures/state-law) deems an ARC application approved when the
 * board misses a deadline, so this points the board at its declaration
 * rather than citing a law.
 */
export const ARC_DEEMED_APPROVAL_NOTE =
  'Some declarations treat an application as approved if the board doesn’t decide in time. Check your declaration for its deadline and whether it has that rule.'

/**
 * A state-specific note, only where our statute fixtures carry the text.
 * Florida § 720.3035(4)(a) (scripts/fixtures/state-law/flsenate-ch720-2026.html):
 * a denial must be written and name the rule relied on and the part of the
 * plan that doesn't conform.
 */
export function arcStateNote(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase()
  if (s === 'FL' || s === 'FLORIDA') {
    return 'Florida § 720.3035(4)(a): if you deny, the written notice must name the rule or covenant you relied on and the part of the plan that doesn’t conform.'
  }
  return null
}

/**
 * The settings for one application: its association's, or — for an older
 * row with no association_id — the org's only association's. Otherwise
 * the default.
 */
export function pickArcClockSettings(
  byAssociation: ReadonlyArray<{ associationId: string; settings: ArcClockSettings }>,
  associationId: string | null,
): ArcClockSettings {
  if (associationId) {
    const hit = byAssociation.find((a) => a.associationId === associationId)
    if (hit) return hit.settings
  }
  if (!associationId && byAssociation.length === 1) return byAssociation[0]!.settings
  return DEFAULT_ARC_CLOCK
}
