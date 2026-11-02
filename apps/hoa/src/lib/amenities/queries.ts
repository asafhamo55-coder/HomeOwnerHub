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
  reservationFromRow,
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
  return (data ?? []).map(amenityFromRow).filter((a): a is Amenity => a !== null)
}

/** Times that are taken (pending or approved) from `fromIso` on, per amenity. Times only. */
export async function loadHeldSlots(
  db: LooseDb,
  orgId: string,
  amenityIds: string[],
  fromIso: string,
  live: boolean = M11_APPLIED,
): Promise<Map<string, Busy[]> | null> {
  const out = new Map<string, Busy[]>()
  if (!live || amenityIds.length === 0) return out
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .select('amenity_id, starts_at, ends_at')
    .eq('organization_id', orgId)
    .in('amenity_id', amenityIds)
    .in('status', ['pending', 'approved'])
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })
    .range(0, 999)) as Res
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
  const unitIds = [...new Set(rows.map((r) => r.unitId))]
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
  return rows.map((r) => ({ ...r, homeLabel: labels.get(r.unitId) ?? 'A home' }))
}
