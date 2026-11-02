// BL-034 amenity reservations: the pure rules. No database, no flag, no
// server imports, so client components and tests can use it.
//
// Bookings are whole hours on one day in the association's own time zone.
// The database is the final word on double booking (the trigger in migration
// 0076); checkRequest here only gives a kind answer before the write.

import { addCalendarDays, dateOnlyCompare, instantAtLocalTime, todayIn } from '@/lib/association-time'

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
}

export interface Reservation {
  id: string
  amenityId: string
  unitId: string
  startsAt: string
  endsAt: string
  status: ReservationStatus
  purpose: string | null
  decisionNote: string | null
}

export interface Busy {
  startsAt: string
  endsAt: string
}

export const AMENITY_COLUMNS =
  'id, association_id, name, description, rules, requires_approval, open_hour, close_hour, max_hours, advance_days, max_active_per_unit, is_active'
export const RESERVATION_COLUMNS = 'id, amenity_id, unit_id, starts_at, ends_at, status, purpose, decision_note'

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
  }
}

const STATUSES: ReservationStatus[] = ['pending', 'approved', 'denied', 'canceled']

export function reservationFromRow(r: Record<string, unknown>): Reservation | null {
  if (
    typeof r.id !== 'string' ||
    typeof r.amenity_id !== 'string' ||
    typeof r.unit_id !== 'string' ||
    typeof r.starts_at !== 'string' ||
    typeof r.ends_at !== 'string' ||
    !STATUSES.includes(r.status as ReservationStatus)
  ) {
    return null
  }
  return {
    id: r.id,
    amenityId: r.amenity_id,
    unitId: r.unit_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status as ReservationStatus,
    purpose: typeof r.purpose === 'string' ? r.purpose : null,
    decisionNote: typeof r.decision_note === 'string' ? r.decision_note : null,
  }
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
  return `Open ${hourLabel(a.openHour)} to ${hourLabel(a.closeHour)}. Up to ${hoursWord(a.maxHours)} a booking. Book up to ${a.advanceDays} days ahead.`
}

export type RequestCheck =
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; error: string; field?: 'day' | 'startHour' | 'endHour' }

/** Do two half-open time ranges overlap? Back-to-back bookings do not. */
export function overlaps(a: Busy, b: Busy): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt)
}

/**
 * The checks a resident's request must pass. Pure: the caller supplies the
 * time zone, "now", the slots already held and how many bookings the home
 * already has. The first failing rule is the one explained.
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
}): RequestCheck {
  const { amenity: a, day, startHour, endHour, timeZone, now, held, homeActiveCount } = args
  if (!a.isActive) return { ok: false, error: `${a.name} is not open for booking right now.` }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'Pick a day.', field: 'day' }
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return { ok: false, error: 'Pick a start and end time.', field: 'startHour' }
  }
  if (startHour < a.openHour || startHour >= a.closeHour) {
    return {
      ok: false,
      error: `${a.name} can be booked from ${hourLabel(a.openHour)} to ${hourLabel(a.closeHour)}.`,
      field: 'startHour',
    }
  }
  if (endHour <= startHour) return { ok: false, error: 'The end time must be after the start time.', field: 'endHour' }
  if (endHour > a.closeHour) return { ok: false, error: `${a.name} closes at ${hourLabel(a.closeHour)}.`, field: 'endHour' }
  if (endHour - startHour > a.maxHours) {
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
  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'That time has already passed. Pick a later time.', field: 'day' }
  }
  if (dateOnlyCompare(day, last) > 0) {
    return { ok: false, error: `You can book up to ${a.advanceDays} days ahead.`, field: 'day' }
  }
  if (homeActiveCount >= a.maxActivePerUnit) {
    const n = a.maxActivePerUnit === 1 ? '1 booking' : `${a.maxActivePerUnit} bookings`
    return { ok: false, error: `Each home can have ${n} for ${a.name} at a time. Cancel one, or wait until it has passed.` }
  }
  const wanted = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
  if (held.some((h) => overlaps(wanted, h))) return { ok: false, error: SLOT_TAKEN, field: 'startHour' }
  return { ok: true, ...wanted }
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

/** "Sat, Nov 8, 2:00 PM to 6:00 PM" in the association's zone. */
export function formatSlot(startsAt: string, endsAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(startsAt),
  )
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time.format(new Date(startsAt))} to ${time.format(new Date(endsAt))}`
}
