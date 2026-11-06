// BL-034 amenity reservations: the pure rules. No database, no flag, no
// server imports, so client components and tests can use it.
//
// Bookings are whole hours on one day in the association's own time zone.
// The database is the final word on double booking (the trigger in migration
// 0076); checkRequest here only gives a kind answer before the write.

import { addCalendarDays, dateOnlyCompare, dayOf, hourIn, instantAtLocalTime, todayIn } from '@/lib/association-time'

export const AMENITIES_NOT_LIVE = 'Amenity booking is not turned on yet.'
export const SLOT_TAKEN = 'Someone else just booked that time. Pick another time.'

export type ReservationStatus = 'pending' | 'approved' | 'denied' | 'canceled'

export interface Amenity {
  id: string
  associationId: string
  name: string
  description: string | null
  rules: string | null
  requiresApproval: boolean
  openHour: number
  closeHour: number
  maxHours: number
  advanceDays: number
  maxActivePerUnit: number
  isActive: boolean
  /** Most people the space holds; null = no limit stated. */
  capacity: number | null
  /** How many bookings may overlap in time. 1 = exclusive. */
  concurrentLimit: number
  /** A booking must start at least this many hours from now. */
  minNoticeHours: number
  /** A resident may cancel alone until this many hours before the start; 0 = any time. */
  cancelCutoffHours: number
  /** Set when the board retired the space. */
  retiredAt: string | null
  /** Hours by weekday (0 = Sunday). null = openHour to closeHour every day; a missing weekday = closed. */
  weeklyHours: Record<number, DayHours> | null
  blackouts: Blackout[]
}

export interface DayHours {
  open: number
  close: number
}

/** Association-local dates (inclusive) the space is closed. */
export interface Blackout {
  startsOn: string
  endsOn: string
  reason: string | null
}

export interface Reservation {
  id: string
  amenityId: string
  /** null for a board hold. */
  unitId: string | null
  kind: 'booking' | 'hold'
  startsAt: string
  endsAt: string
  status: ReservationStatus
  purpose: string | null
  decisionNote: string | null
  cancelReason: string | null
  partySize: number | null
  /** When the request was made; used to hide a seller's bookings from the buyer. */
  createdAt?: string | null
}

export interface Busy {
  startsAt: string
  endsAt: string
}

export const AMENITY_COLUMNS =
  'id, association_id, name, description, rules, requires_approval, open_hour, close_hour, max_hours, advance_days, max_active_per_unit, is_active, capacity, concurrent_limit, min_notice_hours, cancel_cutoff_hours, retired_at'
export const RESERVATION_COLUMNS =
  'id, amenity_id, unit_id, kind, starts_at, ends_at, status, purpose, decision_note, cancel_reason, party_size, created_at'

export function amenityFromRow(r: Record<string, unknown>): Amenity | null {
  if (typeof r.id !== 'string' || typeof r.association_id !== 'string' || typeof r.name !== 'string') return null
  return {
    id: r.id,
    associationId: r.association_id,
    name: r.name,
    description: typeof r.description === 'string' ? r.description : null,
    rules: typeof r.rules === 'string' ? r.rules : null,
    requiresApproval: r.requires_approval !== false,
    openHour: Number(r.open_hour ?? 8),
    closeHour: Number(r.close_hour ?? 22),
    maxHours: Number(r.max_hours ?? 4),
    advanceDays: Number(r.advance_days ?? 60),
    maxActivePerUnit: Number(r.max_active_per_unit ?? 2),
    isActive: r.is_active !== false,
    capacity: typeof r.capacity === 'number' ? r.capacity : null,
    concurrentLimit: Math.max(1, Number(r.concurrent_limit ?? 1)),
    minNoticeHours: Number(r.min_notice_hours ?? 0),
    cancelCutoffHours: Number(r.cancel_cutoff_hours ?? 0),
    retiredAt: typeof r.retired_at === 'string' ? r.retired_at : null,
    weeklyHours: null,
    blackouts: [],
  }
}

const STATUSES: ReservationStatus[] = ['pending', 'approved', 'denied', 'canceled']

export function reservationFromRow(r: Record<string, unknown>): Reservation | null {
  if (
    typeof r.id !== 'string' ||
    typeof r.amenity_id !== 'string' ||
    (r.unit_id !== null && r.unit_id !== undefined && typeof r.unit_id !== 'string') ||
    typeof r.starts_at !== 'string' ||
    typeof r.ends_at !== 'string' ||
    !STATUSES.includes(r.status as ReservationStatus)
  ) {
    return null
  }
  return {
    id: r.id,
    amenityId: r.amenity_id,
    unitId: typeof r.unit_id === 'string' ? r.unit_id : null,
    kind: r.kind === 'hold' ? 'hold' : 'booking',
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status as ReservationStatus,
    purpose: typeof r.purpose === 'string' ? r.purpose : null,
    decisionNote: typeof r.decision_note === 'string' ? r.decision_note : null,
    cancelReason: typeof r.cancel_reason === 'string' ? r.cancel_reason : null,
    partySize: typeof r.party_size === 'number' ? r.party_size : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

/**
 * A home's bookings as its CURRENT owner may see them. Where the ownership
 * began with a recorded sale (`charges_from`, lib/resident-sale-window.ts),
 * bookings made before that day were the seller's and stay hidden, with their
 * purpose and board notes. Other ownerships see the whole history.
 */
export function scopeToOwnership<T extends { unitId: string | null; createdAt?: string | null }>(
  rows: readonly T[],
  units: ReadonlyArray<{ unit_id: string; charges_from?: string | null }>,
): T[] {
  const from = new Map<string, string>()
  for (const u of units) if (u.charges_from) from.set(u.unit_id, u.charges_from)
  return rows.filter((r) => {
    const start = r.unitId ? from.get(r.unitId) : undefined
    if (!start) return true
    return typeof r.createdAt === 'string' && r.createdAt.slice(0, 10) >= start
  })
}

/** Rows of amenity_hours: { weekday, open_hour, close_hour }. No rows gives null (same hours every day). */
export function weeklyHoursFromRows(rows: Record<string, unknown>[]): Record<number, DayHours> | null {
  const out: Record<number, DayHours> = {}
  for (const r of rows) {
    const d = Number(r.weekday)
    const open = Number(r.open_hour)
    const close = Number(r.close_hour)
    if (Number.isInteger(d) && d >= 0 && d <= 6 && close > open) out[d] = { open, close }
  }
  return Object.keys(out).length > 0 ? out : null
}

export function blackoutsFromRows(rows: Record<string, unknown>[]): Blackout[] {
  const out: Blackout[] = []
  for (const r of rows) {
    if (typeof r.starts_on === 'string' && typeof r.ends_on === 'string') {
      out.push({ startsOn: r.starts_on.slice(0, 10), endsOn: r.ends_on.slice(0, 10), reason: typeof r.reason === 'string' ? r.reason : null })
    }
  }
  return out
}

// ─── days, weekdays, hours ──────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekdayName = (weekday: number): string => WEEKDAYS[weekday] ?? ''

/** True for a real calendar date written YYYY-MM-DD (2026-02-31 is not). */
export function isRealDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === day
}

/** 0 = Sunday ... 6 = Saturday for an association-local date. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "Sat, Nov 8" for an association-local date (a calendar date: no time zone shift). */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

export function blackoutOn(a: Pick<Amenity, 'blackouts'>, day: string): Blackout | null {
  return a.blackouts.find((b) => dateOnlyCompare(day, b.startsOn) >= 0 && dateOnlyCompare(day, b.endsOn) <= 0) ?? null
}

/** Bookable hours on a local date, or null when it is closed (blackout or a closed weekday). */
export function hoursForDay(a: Pick<Amenity, 'openHour' | 'closeHour' | 'weeklyHours' | 'blackouts'>, day: string): DayHours | null {
  if (blackoutOn(a, day)) return null
  if (a.weeklyHours === null) return { open: a.openHour, close: a.closeHour }
  return a.weeklyHours[weekdayOf(day)] ?? null
}

/** Why a day is closed, in words. */
export function closedReason(a: Pick<Amenity, 'name' | 'blackouts'>, day: string): string {
  const b = blackoutOn(a, day)
  if (b) return b.reason ? `${a.name} is closed that day: ${b.reason}.` : `${a.name} is closed that day.`
  return `${a.name} is closed on ${weekdayName(weekdayOf(day))}s.`
}

/** 8 -> "8:00 AM", 0 and 24 -> "12:00 AM", 12 -> "12:00 PM". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? 'AM' : 'PM'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:00 ${suffix}`
}

/** The hours a booking may start at, for the "From" picker. */
export function startHours(a: Pick<Amenity, 'openHour' | 'closeHour'>): number[] {
  const out: number[] = []
  for (let h = a.openHour; h < a.closeHour; h++) out.push(h)
  return out
}

/** The hours a booking starting at `start` may end at, for the "Until" picker. */
export function endHours(a: Pick<Amenity, 'closeHour' | 'maxHours'>, start: number): number[] {
  const out: number[] = []
  for (let h = start + 1; h <= Math.min(a.closeHour, start + a.maxHours); h++) out.push(h)
  return out
}

const hoursWord = (n: number) => (n === 1 ? '1 hour' : `${n} hours`)

/** "Open 8:00 AM to 10:00 PM. Up to 4 hours a booking. Book up to 60 days ahead." */
export function rulesSummary(a: Amenity): string {
  const hours =
    a.weeklyHours === null
      ? `Open ${hourLabel(a.openHour)} to ${hourLabel(a.closeHour)}.`
      : 'Hours are different on some days.'
  const people = a.capacity ? ` Holds up to ${a.capacity} people.` : ''
  return `${hours} Up to ${hoursWord(a.maxHours)} a booking. Book up to ${a.advanceDays} days ahead.${people}`
}

export type RequestCheck =
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; error: string; field?: 'day' | 'startHour' | 'endHour' | 'partySize' }

/** Do two half-open time ranges overlap? Back-to-back bookings do not. */
export function overlaps(a: Busy, b: Busy): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt)
}

/**
 * The checks a resident's request must pass. Pure: the caller supplies the
 * time zone, "now", the slots already held and how many bookings the home
 * already has. The first failing rule is the one explained.
 *
 * `board: true` is for a board hold: the board may hold a space outside the
 * resident rules (notice, days ahead, per-home limit, party size, longest
 * booking), but the space must still be open and free.
 */
export function checkRequest(args: {
  amenity: Amenity
  day: string
  startHour: number
  endHour: number
  timeZone: string
  now: Date
  held: Busy[]
  homeActiveCount: number
  partySize?: number | null
  board?: boolean
}): RequestCheck {
  const { amenity: a, day, startHour, endHour, timeZone, now, held, homeActiveCount, partySize, board } = args
  if (a.retiredAt) return { ok: false, error: `${a.name} is no longer offered.` }
  if (!a.isActive) return { ok: false, error: `${a.name} is not open for booking right now.` }
  if (!isRealDay(day)) return { ok: false, error: 'Pick a day.', field: 'day' }
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return { ok: false, error: 'Pick a start and end time.', field: 'startHour' }
  }
  const hours = hoursForDay(a, day)
  if (hours === null) return { ok: false, error: closedReason(a, day), field: 'day' }
  if (startHour < hours.open || startHour >= hours.close) {
    return {
      ok: false,
      error: `${a.name} can be booked from ${hourLabel(hours.open)} to ${hourLabel(hours.close)} that day.`,
      field: 'startHour',
    }
  }
  if (endHour <= startHour) return { ok: false, error: 'The end time must be after the start time.', field: 'endHour' }
  if (endHour > hours.close) return { ok: false, error: `${a.name} closes at ${hourLabel(hours.close)} that day.`, field: 'endHour' }
  if (!board && endHour - startHour > a.maxHours) {
    return { ok: false, error: `One booking can be at most ${hoursWord(a.maxHours)}.`, field: 'endHour' }
  }

  let startsAt: Date
  let endsAt: Date
  let last: string
  try {
    startsAt = instantAtLocalTime(day, startHour, timeZone)
    endsAt = instantAtLocalTime(day, endHour, timeZone)
    last = addCalendarDays(todayIn(timeZone, now), a.advanceDays)
  } catch {
    return { ok: false, error: 'Pick a valid day.', field: 'day' }
  }
  // A wall-clock hour that does not exist (spring forward) is never accepted.
  if (hourIn(timeZone, startsAt) !== startHour) {
    return { ok: false, error: `${hourLabel(startHour)} does not exist that day because the clocks change. Pick another time.`, field: 'startHour' }
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'That time has already passed. Pick a later time.', field: 'day' }
  }
  if (!board) {
    if (a.minNoticeHours > 0 && startsAt.getTime() < now.getTime() + a.minNoticeHours * 3_600_000) {
      return { ok: false, error: `Book at least ${hoursWord(a.minNoticeHours)} ahead.`, field: 'day' }
    }
    if (dateOnlyCompare(day, last) > 0) {
      return { ok: false, error: `You can book up to ${a.advanceDays} days ahead.`, field: 'day' }
    }
    if (a.capacity !== null && partySize != null && partySize > a.capacity) {
      return { ok: false, error: `${a.name} holds up to ${a.capacity} people.`, field: 'partySize' }
    }
    if (homeActiveCount >= a.maxActivePerUnit) {
      const n = a.maxActivePerUnit === 1 ? '1 booking' : `${a.maxActivePerUnit} bookings`
      return { ok: false, error: `Each home can have ${n} for ${a.name} at a time. Cancel one, or wait until it has passed.` }
    }
  }
  const wanted = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
  if (heldCount(held, wanted) >= a.concurrentLimit) return { ok: false, error: SLOT_TAKEN, field: 'startHour' }
  return { ok: true, ...wanted }
}

/** How many held bookings overlap a range. */
export function heldCount(held: Busy[], range: Busy): number {
  let n = 0
  for (const h of held) if (overlaps(range, h)) n++
  return n
}

// ─── the free-time picker ───────────────────────────────────────────────

export type SlotState = 'free' | 'taken' | 'past' | 'too_soon'

export interface Slot {
  hour: number
  label: string
  state: SlotState
}

export type DayStatus = 'open' | 'full' | 'closed' | 'past' | 'too_far'

export interface DayView {
  day: string
  label: string
  status: DayStatus
  /** Plain words for the day: "Free times", "Full", "Closed", "Too far ahead". */
  note: string
  hours: DayHours | null
  slots: Slot[]
  /**
   * For each free start hour, the end hours that checkRequest would accept
   * (same whole-range count against concurrentLimit). Computed on the server.
   */
  ends: Record<number, number[]>
}

/**
 * Every start hour on one local date and whether it is free, for the picker.
 * Only the amenity's own rules and what is held: the server checks the rest
 * again on submit. A wall-clock hour that does not exist (spring forward) is
 * left out. Pure.
 */
export function daySlots(args: { amenity: Amenity; day: string; timeZone: string; now: Date; held: Busy[] }): DayView {
  const { amenity: a, day, timeZone, now, held } = args
  const label = dayLabel(day)
  const today = todayIn(timeZone, now)
  const base = { day, label, slots: [] as Slot[], ends: {} as Record<number, number[]> }
  if (dateOnlyCompare(day, today) < 0) return { ...base, status: 'past', note: 'Passed', hours: null }
  if (dateOnlyCompare(day, addCalendarDays(today, a.advanceDays)) > 0) {
    return { ...base, status: 'too_far', note: 'Too far ahead', hours: null }
  }
  const hours = hoursForDay(a, day)
  if (hours === null) return { ...base, status: 'closed', note: 'Closed', hours: null }

  const slots: Slot[] = []
  const ends: Record<number, number[]> = {}
  for (let h = hours.open; h < hours.close; h++) {
    const startsAt = instantAtLocalTime(day, h, timeZone)
    if (hourIn(timeZone, startsAt) !== h) continue
    const endsAt = instantAtLocalTime(day, h + 1, timeZone)
    let state: SlotState = 'free'
    if (startsAt.getTime() <= now.getTime()) state = 'past'
    else if (a.minNoticeHours > 0 && startsAt.getTime() < now.getTime() + a.minNoticeHours * 3_600_000) state = 'too_soon'
    else if (heldCount(held, { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) >= a.concurrentLimit) state = 'taken'
    slots.push({ hour: h, label: hourLabel(h), state })
    if (state === 'free') {
      // Same rule as checkRequest: the whole range counts against the limit.
      const list: number[] = []
      for (let e = h + 1; e <= Math.min(hours.close, h + a.maxHours); e++) {
        const range = { startsAt: startsAt.toISOString(), endsAt: instantAtLocalTime(day, e, timeZone).toISOString() }
        if (heldCount(held, range) >= a.concurrentLimit) break
        list.push(e)
      }
      ends[h] = list
    }
  }
  const anyFree = slots.some((s) => s.state === 'free')
  return { ...base, status: anyFree ? 'open' : 'full', note: anyFree ? 'Free times' : 'Full', hours, slots, ends }
}

/**
 * `count` days starting at `startDay` (default today), each with its free
 * times. Held bookings are parsed once and bucketed per day so a long strip
 * does not rescan every booking for every hour.
 */
export function dayStrip(args: {
  amenity: Amenity
  timeZone: string
  now: Date
  held: Busy[]
  count: number
  startDay?: string
}): DayView[] {
  const first = args.startDay ?? todayIn(args.timeZone, args.now)
  const parsed = args.held.map((h) => ({ h, s: Date.parse(h.startsAt), e: Date.parse(h.endsAt) }))
  return Array.from({ length: args.count }, (_, i) => {
    const day = addCalendarDays(first, i)
    let held: Busy[] = []
    if (parsed.length > 0) {
      const from = instantAtLocalTime(day, 0, args.timeZone).getTime()
      const to = instantAtLocalTime(addCalendarDays(day, 1), 0, args.timeZone).getTime()
      held = parsed.filter((p) => p.s < to && p.e > from).map((p) => p.h)
    }
    return daySlots({ amenity: args.amenity, day, timeZone: args.timeZone, now: args.now, held })
  })
}

/**
 * The hours a booking that starts at `startHour` may end at: up to the longest
 * booking and the closing time, stopping at the first slot that is not free.
 * (An hour that does not exist on a clock-change day is passed over.)
 */
export function validEnds(view: Pick<DayView, 'hours' | 'slots'> & { ends?: DayView['ends'] }, startHour: number, maxHours: number): number[] {
  if (!view.hours) return []
  // The server's answer, counted over the whole range as checkRequest does.
  if (view.ends) return view.ends[startHour] ?? []
  const bySlot = new Map(view.slots.map((s) => [s.hour, s]))
  const out: number[] = []
  for (let h = startHour; h < Math.min(view.hours.close, startHour + maxHours); h++) {
    const slot = bySlot.get(h)
    if (slot && slot.state !== 'free') break
    out.push(h + 1)
  }
  return out
}

// ─── when the board changes the rules ───────────────────────────────────

/**
 * Ids of held bookings that start after `now` and would no longer fit the
 * amenity's rules (closed day, blackout, new hours, shorter maximum, retired).
 * The board is shown this count before it saves; nothing is canceled silently.
 */
export function bookingsBrokenByRules(
  a: Amenity,
  reservations: Pick<Reservation, 'id' | 'startsAt' | 'endsAt' | 'status'>[],
  timeZone: string,
  now: Date,
): string[] {
  const out: string[] = []
  for (const r of reservations) {
    if (r.status !== 'pending' && r.status !== 'approved') continue
    if (Date.parse(r.startsAt) <= now.getTime()) continue
    const day = dayOf(r.startsAt, timeZone)
    if (!day) continue
    if (a.retiredAt) {
      out.push(r.id)
      continue
    }
    const hours = hoursForDay(a, day)
    const startHour = hourIn(timeZone, new Date(r.startsAt))
    const endDay = dayOf(r.endsAt, timeZone)
    const endHour = hourIn(timeZone, new Date(r.endsAt)) + (endDay !== day ? 24 : 0)
    if (!hours || startHour < hours.open || endHour > hours.close || endHour - startHour > a.maxHours) out.push(r.id)
  }
  return out
}

// ─── the board's month calendar ─────────────────────────────────────────

export interface MonthCell {
  day: string
  inMonth: boolean
  held: number
  waiting: number
  closed: boolean
}

/** Weeks (Sunday first) for a 'YYYY-MM' month, with a count of bookings per local day. */
export function monthGrid(args: {
  month: string
  timeZone: string
  reservations: Pick<Reservation, 'startsAt' | 'status'>[]
  amenity?: Pick<Amenity, 'openHour' | 'closeHour' | 'weeklyHours' | 'blackouts'> | null
}): MonthCell[][] {
  const first = `${args.month}-01`
  if (!isRealDay(first)) return []
  const counts = new Map<string, { held: number; waiting: number }>()
  for (const r of args.reservations) {
    if (r.status !== 'pending' && r.status !== 'approved') continue
    const d = dayOf(r.startsAt, args.timeZone)
    if (!d) continue
    const c = counts.get(d) ?? { held: 0, waiting: 0 }
    c.held++
    if (r.status === 'pending') c.waiting++
    counts.set(d, c)
  }
  const start = addCalendarDays(first, -weekdayOf(first))
  const weeks: MonthCell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = []
    for (let i = 0; i < 7; i++) {
      const day = addCalendarDays(start, w * 7 + i)
      const c = counts.get(day)
      row.push({
        day,
        inMonth: day.startsWith(args.month),
        held: c?.held ?? 0,
        waiting: c?.waiting ?? 0,
        closed: args.amenity ? hoursForDay(args.amenity, day) === null : false,
      })
    }
    if (w > 0 && !row[0].inMonth) break
    weeks.push(row)
  }
  return weeks
}

/** The status a new request starts in. */
export function initialStatus(a: Pick<Amenity, 'requiresApproval'>): 'pending' | 'approved' {
  return a.requiresApproval ? 'pending' : 'approved'
}

/** A held booking counts against the home's limit until it ends. */
export function countsAgainstHome(r: Pick<Reservation, 'status' | 'endsAt'>, now: Date): boolean {
  return (r.status === 'pending' || r.status === 'approved') && Date.parse(r.endsAt) > now.getTime()
}

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Waiting for the board',
  approved: 'Confirmed',
  denied: 'Not approved',
  canceled: 'Canceled',
}

/** Can the booking still be canceled? Only before it starts and while held. */
export function canCancel(r: Pick<Reservation, 'status' | 'startsAt'>, now: Date): boolean {
  return (r.status === 'pending' || r.status === 'approved') && Date.parse(r.startsAt) > now.getTime()
}

/**
 * Inside the amenity's cancel cutoff a resident cannot cancel alone and is
 * asked to contact the board. The board can always cancel. No money is tied
 * to this yet.
 */
export function residentMustAskBoard(r: Pick<Reservation, 'startsAt'>, cutoffHours: number, now: Date): boolean {
  return cutoffHours > 0 && Date.parse(r.startsAt) - now.getTime() < cutoffHours * 3_600_000
}

export type DisplayStatus = ReservationStatus | 'completed' | 'expired'

export const DISPLAY_LABELS: Record<DisplayStatus, string> = {
  ...STATUS_LABELS,
  completed: 'Completed',
  expired: 'No longer held',
}

/** The status a person sees: derived at read time, never stored. */
export function displayStatus(r: Pick<Reservation, 'status' | 'startsAt' | 'endsAt'>, now: Date): DisplayStatus {
  if (r.status === 'approved' && Date.parse(r.endsAt) <= now.getTime()) return 'completed'
  if (r.status === 'pending' && Date.parse(r.startsAt) <= now.getTime()) return 'expired'
  return r.status
}

/** "Sat, Nov 8, 2:00 PM to 6:00 PM" in the association's zone. */
export function formatSlot(startsAt: string, endsAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(startsAt),
  )
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time.format(new Date(startsAt))} to ${time.format(new Date(endsAt))}`
}
