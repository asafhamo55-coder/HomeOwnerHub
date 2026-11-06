/**
 * BL-034 reads (amenities and amenity_reservations, migration 0076; M11_APPLIED).
 *
 * Flag off: every loader returns its "nothing" value WITHOUT touching the
 * database, because the tables may not exist yet. Not a server action (no
 * 'use server'); called from server components. Ids and error codes only in
 * logs, never addresses or purposes.
 *
 * The "held" read (which times are taken) uses the caller-supplied client and
 * returns times only, so a resident sees that a slot is busy and never who
 * holds it. The page passes the service-role client for it, confined to the
 * amenity ids it already loaded from the resident's own org.
 */

import { M11_APPLIED } from '@homeowner-portal/db/m11'
import {
  AMENITY_COLUMNS,
  RESERVATION_COLUMNS,
  amenityFromRow,
  blackoutsFromRows,
  reservationFromRow,
  weeklyHoursFromRows,
  type Amenity,
  type Busy,
  type Reservation,
} from './model'

// The M11 tables are not in the generated types until gen:types runs after
// prod has 0076 (CLAUDE.md footgun 3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

type Res = { data: Record<string, unknown>[] | null; error: { code?: string } | null }

export const AMENITIES_TABLE = 'amenities'
export const RESERVATIONS_TABLE = 'amenity_reservations'
export const HOURS_TABLE = 'amenity_hours'
export const BLACKOUTS_TABLE = 'amenity_blackouts'

/** The org's amenities, by name. [] with the flag off; null on a failed read. */
export async function loadAmenities(
  db: LooseDb,
  orgId: string,
  opts: { activeOnly?: boolean; live?: boolean } = {},
): Promise<Amenity[] | null> {
  if (!(opts.live ?? M11_APPLIED)) return []
  let q = db.from(AMENITIES_TABLE).select(AMENITY_COLUMNS).eq('organization_id', orgId)
  if (opts.activeOnly) q = q.eq('is_active', true)
  const { data, error } = (await q.order('name', { ascending: true }).range(0, 199)) as Res
  if (error) {
    console.error('[amenities] amenities read failed', { orgId, code: error.code ?? null })
    return null
  }
  const amenities = (data ?? []).map(amenityFromRow).filter((a): a is Amenity => a !== null)
  if (amenities.length === 0) return amenities

  // Weekly hours and blackout dates (migration 0076). Only dates that still matter.
  const ids = amenities.map((a) => a.id)
  const [hours, blackouts] = (await Promise.all([
    db.from(HOURS_TABLE).select('amenity_id, weekday, open_hour, close_hour').eq('organization_id', orgId).in('amenity_id', ids).range(0, 999),
    db
      .from(BLACKOUTS_TABLE)
      .select('amenity_id, starts_on, ends_on, reason')
      .eq('organization_id', orgId)
      .in('amenity_id', ids)
      .gte('ends_on', new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10))
      .order('starts_on', { ascending: true })
      .range(0, 999),
  ])) as [Res, Res]
  if (hours.error || blackouts.error) {
    console.error('[amenities] hours or blackouts read failed', {
      orgId,
      code: hours.error?.code ?? blackouts.error?.code ?? null,
    })
    return null
  }
  const group = (rows: Record<string, unknown>[] | null) => {
    const m = new Map<string, Record<string, unknown>[]>()
    for (const r of rows ?? []) {
      if (typeof r.amenity_id !== 'string') continue
      m.set(r.amenity_id, [...(m.get(r.amenity_id) ?? []), r])
    }
    return m
  }
  const hoursBy = group(hours.data)
  const blackoutsBy = group(blackouts.data)
  return amenities.map((a) => ({
    ...a,
    weeklyHours: weeklyHoursFromRows(hoursBy.get(a.id) ?? []),
    blackouts: blackoutsFromRows(blackoutsBy.get(a.id) ?? []),
  }))
}

/** Held (pending or approved) bookings of one amenity that end after `fromIso` and start before `toIso`. Org-scoped. */
export async function loadAmenityReservations(
  db: LooseDb,
  orgId: string,
  amenityId: string,
  fromIso: string,
  toIso: string | null,
  live: boolean = M11_APPLIED,
): Promise<BoardReservation[] | null> {
  if (!live) return []
  let q = db
    .from(RESERVATIONS_TABLE)
    .select(RESERVATION_COLUMNS)
    .eq('organization_id', orgId)
    .eq('amenity_id', amenityId)
    .in('status', ['pending', 'approved'])
    .gt('ends_at', fromIso)
  if (toIso) q = q.lt('starts_at', toIso)
  const { data, error } = (await q.order('starts_at', { ascending: true }).range(0, 999)) as Res
  if (error) {
    console.error('[amenities] amenity reservations read failed', { orgId, code: error.code ?? null })
    return null
  }
  const rows = (data ?? []).map(reservationFromRow).filter((r): r is Reservation => r !== null)
  return withHomeLabels(db, orgId, rows)
}

/**
 * Times that are taken (pending or approved) from `fromIso` on, per amenity.
 * Times only. With `toIso` the read is a bounded window and runs one query per
 * amenity, so one busy space cannot push another's bookings past the row cap.
 */
export async function loadHeldSlots(
  db: LooseDb,
  orgId: string,
  amenityIds: string[],
  fromIso: string,
  live: boolean = M11_APPLIED,
  toIso?: string,
): Promise<Map<string, Busy[]> | null> {
  const out = new Map<string, Busy[]>()
  if (!live || amenityIds.length === 0) return out
  const groups = toIso ? amenityIds.map((id) => [id]) : [amenityIds]
  const results = await Promise.all(
    groups.map(async (ids) => {
      let q = db
        .from(RESERVATIONS_TABLE)
        .select('amenity_id, starts_at, ends_at')
        .eq('organization_id', orgId)
        .in('amenity_id', ids)
        .in('status', ['pending', 'approved'])
        .gt('ends_at', fromIso)
      if (toIso) q = q.lt('starts_at', toIso)
      return (await q.order('starts_at', { ascending: true }).range(0, 999)) as Res
    }),
  )
  for (const { data, error } of results) {
    if (error) {
      console.error('[amenities] held slots read failed', { orgId, code: error.code ?? null })
      return null
    }
    for (const r of data ?? []) {
      if (typeof r.amenity_id !== 'string' || typeof r.starts_at !== 'string' || typeof r.ends_at !== 'string') continue
      const list = out.get(r.amenity_id) ?? []
      list.push({ startsAt: r.starts_at, endsAt: r.ends_at })
      out.set(r.amenity_id, list)
    }
  }
  return out
}

/** A home's recent and upcoming bookings (the last 30 days on), newest first. */
export async function loadHomeReservations(
  db: LooseDb,
  orgId: string,
  unitIds: string[],
  sinceIso: string,
  live: boolean = M11_APPLIED,
): Promise<Reservation[] | null> {
  if (!live || unitIds.length === 0) return []
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .select(RESERVATION_COLUMNS)
    .eq('organization_id', orgId)
    .in('unit_id', unitIds)
    .gt('ends_at', sinceIso)
    .order('starts_at', { ascending: false })
    .range(0, 199)) as Res
  if (error) {
    console.error('[amenities] home reservations read failed', { orgId, code: error.code ?? null })
    return null
  }
  return (data ?? []).map(reservationFromRow).filter((r): r is Reservation => r !== null)
}

export interface BoardReservation extends Reservation {
  /** "12 Oak Lane" or "Unit 4B": what the board needs to know who asked. */
  homeLabel: string
}

/** Every booking that has not ended yet, soonest first, with the home it is for. */
export async function loadBoardReservations(
  db: LooseDb,
  orgId: string,
  fromIso: string,
  live: boolean = M11_APPLIED,
): Promise<BoardReservation[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .select(RESERVATION_COLUMNS)
    .eq('organization_id', orgId)
    .gt('ends_at', fromIso)
    .in('status', ['pending', 'approved'])
    .order('starts_at', { ascending: true })
    .range(0, 499)) as Res
  if (error) {
    console.error('[amenities] board reservations read failed', { orgId, code: error.code ?? null })
    return null
  }
  const rows = (data ?? []).map(reservationFromRow).filter((r): r is Reservation => r !== null)
  return withHomeLabels(db, orgId, rows)
}

export interface PendingBooking extends BoardReservation {
  amenityName: string
}

/**
 * Bookings waiting on the board, for /approvals. Only a resident's request
 * (kind booking) that is still pending AND has not started, because
 * decideReservation refuses a request whose time has passed; listing one
 * would be a button that can never work. Oldest request first. Reads run on
 * the caller's client (the board member's own RLS session in the app):
 * amenity_reservations_board_select scopes them to the board's org, and the
 * org filter is repeated here. `total` can exceed rows.length (limit). Null
 * on a failed read; empty with the flag off, without touching the database.
 */
export async function loadPendingBookings(
  db: LooseDb,
  orgId: string,
  nowIso: string,
  limit: number,
  live: boolean = M11_APPLIED,
): Promise<{ rows: PendingBooking[]; total: number } | null> {
  if (!live) return { rows: [], total: 0 }
  const res = (await db
    .from(RESERVATIONS_TABLE)
    .select(RESERVATION_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .eq('kind', 'booking')
    .gt('starts_at', nowIso)
    .order('created_at', { ascending: true })
    .range(0, limit - 1)) as Res & { count?: number | null }
  if (res.error) {
    console.error('[amenities] pending bookings read failed', { orgId, code: res.error.code ?? null })
    return null
  }
  const base = (res.data ?? []).map(reservationFromRow).filter((r): r is Reservation => r !== null)
  if (base.length === 0) return { rows: [], total: res.count ?? 0 }
  const labelled = await withHomeLabels(db, orgId, base)
  if (labelled === null) return null
  const ids = [...new Set(base.map((r) => r.amenityId))]
  const names = (await db.from(AMENITIES_TABLE).select('id, name').eq('organization_id', orgId).in('id', ids)) as Res
  if (names.error) {
    console.error('[amenities] amenity names read failed', { orgId, code: names.error.code ?? null })
    return null
  }
  const nameOf = new Map<string, string>()
  for (const a of names.data ?? []) if (typeof a.id === 'string' && typeof a.name === 'string') nameOf.set(a.id, a.name)
  return {
    rows: labelled.map((r) => ({ ...r, amenityName: nameOf.get(r.amenityId) ?? 'Amenity' })),
    total: res.count ?? base.length,
  }
}

/** Head-only count with the same predicate as loadPendingBookings. Null on a failed read. */
export async function countPendingBookings(db: LooseDb, orgId: string, nowIso: string, live: boolean = M11_APPLIED): Promise<number | null> {
  if (!live) return 0
  const res = (await db
    .from(RESERVATIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .eq('kind', 'booking')
    .gt('starts_at', nowIso)) as Res & { count?: number | null }
  if (res.error) {
    console.error('[amenities] pending bookings count failed', { orgId, code: res.error.code ?? null })
    return null
  }
  return res.count ?? 0
}

async function withHomeLabels(db: LooseDb, orgId: string, rows: Reservation[]): Promise<BoardReservation[] | null> {
  const unitIds = [...new Set(rows.map((r) => r.unitId).filter((id): id is string => id !== null))]
  const labels = new Map<string, string>()
  if (unitIds.length > 0) {
    const units = (await db
      .from('units')
      .select('id, address_line1, unit_number')
      .eq('organization_id', orgId)
      .in('id', unitIds)) as Res
    if (units.error) {
      console.error('[amenities] unit labels read failed', { orgId, code: units.error.code ?? null })
      return null
    }
    for (const u of units.data ?? []) {
      if (typeof u.id !== 'string') continue
      const street = typeof u.address_line1 === 'string' ? u.address_line1 : ''
      const num = typeof u.unit_number === 'string' && u.unit_number ? `Unit ${u.unit_number}` : ''
      labels.set(u.id, [street, num].filter(Boolean).join(', ') || 'A home')
    }
  }
  return rows.map((r) => ({ ...r, homeLabel: r.kind === 'hold' ? 'Board hold' : (r.unitId && labels.get(r.unitId)) || 'A home' }))
}
