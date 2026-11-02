'use server'

// BL-034: amenity reservations (amenities, amenity_reservations, amenity_hours,
// amenity_blackouts; migration 0076; M11_APPLIED).
//
// A server action is a public endpoint, so each one checks who is asking
// before it does any work. The tables have no write policy for the web roles:
// after the checks, writes go through the service role, scoped to the
// caller's org. The database trigger (amenity_reservation_no_overlap) is the
// real double-booking guard; the 23P01 it raises is turned into a plain
// sentence here.
//
// Email: only the board's answer (approved, turned down, canceled by the
// board) goes to the resident, through lib/amenities/notify.ts and the guarded
// sendEmail; a new request rings the board's in-app bell. No texts. No money:
// fees and deposits wait for online payments. Flag off: nothing is read or
// written. Logs carry ids and error codes only.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { DEFAULT_ASSOCIATION_TIME_ZONE, associationTimeZone, isValidTimeZone } from '@/lib/association-time'
import {
  AMENITIES_NOT_LIVE,
  RESERVATION_COLUMNS,
  SLOT_TAKEN,
  bookingsBrokenByRules,
  canCancel,
  checkRequest,
  countsAgainstHome,
  hoursForDay,
  initialStatus,
  isRealDay,
  reservationFromRow,
  residentMustAskBoard,
  type Amenity,
} from './model'
import {
  AMENITIES_TABLE,
  BLACKOUTS_TABLE,
  HOURS_TABLE,
  RESERVATIONS_TABLE,
  loadAmenities,
  loadAmenityReservations,
  loadHeldSlots,
  loadHomeReservations,
  type LooseDb,
} from './queries'
import { bellBoardOfRequest, emailResidentOfAnswer } from './notify'

export type AmenityActionResult =
  | { ok: true; id?: string; status?: 'pending' | 'approved' }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; affected?: number }

const SOMETHING_WRONG = 'Something went wrong. Please try again.'
const Id = z.string().uuid()

function fieldErrors(err: z.ZodError): AmenityActionResult {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return { ok: false, error: Object.values(out)[0] ?? 'Check the highlighted fields.', fieldErrors: out }
}

function refreshAll() {
  revalidatePath('/amenities')
  revalidatePath('/resident/amenities')
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

type Sb = { data: unknown; error: { code?: string } | null }

/** The association's local zone, from its state (the same rule the rest of the app uses). */
async function zoneOfAssociation(db: LooseDb, orgId: string, associationId: string): Promise<string> {
  const { data } = (await db
    .from('associations')
    .select('state')
    .eq('id', associationId)
    .eq('organization_id', orgId)
    .maybeSingle()) as { data: { state: string | null } | null }
  const zone = associationTimeZone(data)
  return isValidTimeZone(zone) ? zone : DEFAULT_ASSOCIATION_TIME_ZONE
}

// ─── Board: set up an amenity ───────────────────────────────────────────

const HourRow = z.object({
  weekday: z.number().int().min(0).max(6),
  openHour: z.number().int().min(0).max(23),
  closeHour: z.number().int().min(1).max(24),
})

const BlackoutRow = z.object({
  startsOn: z.string().refine(isRealDay, 'Enter a real date.'),
  endsOn: z.string().refine(isRealDay, 'Enter a real date.'),
  reason: optionalText(200),
})

const AmenitySchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name, like Clubhouse.').max(80, 'Keep it under 80 characters.'),
    description: optionalText(1000),
    rules: optionalText(4000),
    requiresApproval: z.boolean(),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
    maxHours: z.number().int().min(1, 'Pick 1 hour or more.').max(24),
    advanceDays: z.number().int().min(1, 'Enter 1 or more days.').max(365, 'Enter 365 days or fewer.'),
    maxActivePerUnit: z.number().int().min(1, 'Enter 1 or more.').max(20, 'Enter 20 or fewer.'),
    isActive: z.boolean(),
    capacity: z.number().int().min(1, 'Enter 1 or more people.').max(1000, 'Enter 1000 or fewer.').nullable().optional(),
    concurrentLimit: z.number().int().min(1, 'Enter 1 or more.').max(50, 'Enter 50 or fewer.').optional(),
    minNoticeHours: z.number().int().min(0).max(720, 'Enter 720 hours or fewer.').optional(),
    cancelCutoffHours: z.number().int().min(0).max(720, 'Enter 720 hours or fewer.').optional(),
    /** null: the same hours every day. A list: only those weekdays are open. */
    weeklyHours: z.array(HourRow).max(7).nullable().optional(),
    blackouts: z.array(BlackoutRow).max(100, 'That is too many closed dates.').optional(),
    /** New amenities only. Needed when the community has more than one association. */
    associationId: z.string().uuid().optional(),
    /** What to do with bookings the new rules would break: ask first, keep them, or cancel them. */
    affected: z.enum(['ask', 'keep', 'cancel']).optional(),
    affectedNote: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.closeHour <= v.openHour) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['closeHour'], message: 'Closing time must be after opening time.' })
    } else if (v.maxHours > v.closeHour - v.openHour && !v.weeklyHours) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxHours'], message: 'That is longer than the hours it is open.' })
    }
    const seen = new Set<number>()
    for (const h of v.weeklyHours ?? []) {
      if (seen.has(h.weekday)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weeklyHours'], message: 'Each day can be listed once.' })
      seen.add(h.weekday)
      if (h.closeHour <= h.openHour) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weeklyHours'], message: 'Closing time must be after opening time on each day.' })
      }
    }
    for (const b of v.blackouts ?? []) {
      if (b.endsOn < b.startsOn) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blackouts'], message: 'A closed period must end on or after its first day.' })
      }
    }
    if (v.affected === 'cancel' && !v.affectedNote) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['affectedNote'], message: 'Add a short note the residents will read.' })
    }
  })

export type AmenityInput = z.input<typeof AmenitySchema>

/** Add an amenity (id null) or change one. Board or admin only. */
export async function saveAmenity(args: { id: string | null; amenity: AmenityInput }): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (args.id !== null && !Id.safeParse(args.id).success) return { ok: false, error: 'That amenity is not valid.' }
  const parsed = AmenitySchema.safeParse(args.amenity)
  if (!parsed.success) return fieldErrors(parsed.error)
  const v = parsed.data

  const db = createAdminClient() as unknown as LooseDb
  const row = {
    name: v.name,
    description: v.description,
    rules: v.rules,
    requires_approval: v.requiresApproval,
    open_hour: v.openHour,
    close_hour: v.closeHour,
    max_hours: v.maxHours,
    advance_days: v.advanceDays,
    max_active_per_unit: v.maxActivePerUnit,
    is_active: v.isActive,
    capacity: v.capacity ?? null,
    concurrent_limit: v.concurrentLimit ?? 1,
    min_notice_hours: v.minNoticeHours ?? 0,
    cancel_cutoff_hours: v.cancelCutoffHours ?? 0,
  }

  let amenityId: string
  let associationId: string
  let cancelIds: string[] = []

  if (args.id) {
    const current = (await loadAmenities(db, gate.orgId))?.find((a) => a.id === args.id)
    if (current === undefined) return { ok: false, error: 'That amenity was not found.' }
    associationId = current.associationId

    // Existing bookings keep their place: show what the new rules would break
    // and let the board choose. Nothing is canceled without that choice.
    const proposed: Amenity = {
      ...current,
      openHour: v.openHour,
      closeHour: v.closeHour,
      maxHours: v.maxHours,
      weeklyHours: v.weeklyHours ? Object.fromEntries(v.weeklyHours.map((h) => [h.weekday, { open: h.openHour, close: h.closeHour }])) : null,
      blackouts: (v.blackouts ?? []).map((b) => ({ startsOn: b.startsOn, endsOn: b.endsOn, reason: b.reason })),
    }
    const upcoming = await loadAmenityReservations(db, gate.orgId, current.id, new Date().toISOString(), null)
    if (upcoming === null) return { ok: false, error: SOMETHING_WRONG }
    const zone = await zoneOfAssociation(db, gate.orgId, associationId)
    const broken = bookingsBrokenByRules(proposed, upcoming, zone, new Date())
    const mode = v.affected ?? 'ask'
    if (broken.length > 0 && mode === 'ask') {
      const n = broken.length === 1 ? '1 booking' : `${broken.length} bookings`
      return { ok: false, error: `This change affects ${n}. Choose what to do with them, then save again.`, affected: broken.length }
    }
    if (broken.length > 0 && mode === 'cancel') cancelIds = broken

    const { data, error } = await db
      .from(AMENITIES_TABLE)
      .update(row)
      .eq('id', args.id)
      .eq('organization_id', gate.orgId)
      .select('id')
      .maybeSingle()
    if (error) {
      console.error('[amenities] update failed', { id: args.id, code: error.code ?? null })
      return { ok: false, error: SOMETHING_WRONG }
    }
    if (!data) return { ok: false, error: 'That amenity was not found.' }
    amenityId = args.id
  } else {
    const assocs = (await db
      .from('associations')
      .select('id')
      .eq('organization_id', gate.orgId)
      .order('created_at', { ascending: true })
      .limit(50)) as { data: { id: string }[] | null; error: { code?: string } | null }
    if (assocs.error || !assocs.data || assocs.data.length === 0) {
      if (assocs.error) console.error('[amenities] association read failed', { orgId: gate.orgId, code: assocs.error.code ?? null })
      return { ok: false, error: 'Set up your association first, then add amenities.' }
    }
    if (v.associationId) {
      if (!assocs.data.some((a) => a.id === v.associationId)) {
        return { ok: false, error: 'That community was not found.', fieldErrors: { associationId: 'Pick one of your communities.' } }
      }
      associationId = v.associationId
    } else if (assocs.data.length === 1) {
      associationId = assocs.data[0].id
    } else {
      return { ok: false, error: 'Pick which community this space is for.', fieldErrors: { associationId: 'Pick a community.' } }
    }
    const user = await getSupabaseServerClient().then((s) => s.auth.getUser())
    const { data, error } = (await db
      .from(AMENITIES_TABLE)
      .insert({ ...row, organization_id: gate.orgId, association_id: associationId, created_by: user.data.user?.id ?? null })
      .select('id')
      .single()) as { data: { id: string } | null; error: { code?: string } | null }
    if (error || !data) {
      console.error('[amenities] insert failed', { orgId: gate.orgId, code: error?.code ?? null })
      return { ok: false, error: SOMETHING_WRONG }
    }
    amenityId = data.id
  }

  // Weekly hours and closed dates are replaced as a set.
  const hoursWrite = await replaceChildren(db, HOURS_TABLE, gate.orgId, amenityId, (v.weeklyHours ?? []).map((h) => ({
    weekday: h.weekday,
    open_hour: h.openHour,
    close_hour: h.closeHour,
  })))
  const blackoutsWrite = hoursWrite
    ? await replaceChildren(db, BLACKOUTS_TABLE, gate.orgId, amenityId, (v.blackouts ?? []).map((b) => ({
        starts_on: b.startsOn,
        ends_on: b.endsOn,
        reason: b.reason,
      })))
    : false
  if (!hoursWrite || !blackoutsWrite) return { ok: false, error: 'Your changes were saved except the hours or closed dates. Open it again and save once more.' }

  if (cancelIds.length > 0) {
    await cancelMany(db, gate.orgId, cancelIds, v.affectedNote ?? 'The rules for this space changed.')
  }
  refreshAll()
  return { ok: true, id: amenityId }
}

async function replaceChildren(
  db: LooseDb,
  table: string,
  orgId: string,
  amenityId: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  const del = (await db.from(table).delete().eq('amenity_id', amenityId).eq('organization_id', orgId)) as Sb
  if (del.error) {
    console.error('[amenities] child delete failed', { table, amenityId, code: del.error.code ?? null })
    return false
  }
  if (rows.length === 0) return true
  const ins = (await db.from(table).insert(rows.map((r) => ({ ...r, organization_id: orgId, amenity_id: amenityId })))) as Sb
  if (ins.error) {
    console.error('[amenities] child insert failed', { table, amenityId, code: ins.error.code ?? null })
    return false
  }
  return true
}

/**
 * Cancel many bookings on the board's behalf with one note, and email each
 * resident through the guarded sender. Returns how many were canceled.
 */
async function cancelMany(db: LooseDb, orgId: string, ids: string[], note: string): Promise<number> {
  const user = await getSupabaseServerClient().then((s) => s.auth.getUser())
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), canceled_by: user.data.user?.id ?? null, cancel_reason: note })
    .in('id', ids)
    .eq('organization_id', orgId)
    .in('status', ['pending', 'approved'])
    .select('id, association_id, amenity_id, requested_by, starts_at, ends_at, kind')) as {
    data: Record<string, unknown>[] | null
    error: { code?: string } | null
  }
  if (error) {
    console.error('[amenities] bulk cancel failed', { orgId, count: ids.length, code: error.code ?? null })
    return 0
  }
  const canceled = data ?? []
  const names = new Map(((await loadAmenities(db, orgId)) ?? []).map((a) => [a.id, a.name]))
  for (const r of canceled) {
    if (r.kind === 'hold' || typeof r.id !== 'string') continue
    await emailResidentOfAnswer({
      kind: 'canceled_by_board',
      organizationId: orgId,
      associationId: String(r.association_id),
      reservationId: r.id,
      residentId: typeof r.requested_by === 'string' ? r.requested_by : null,
      amenityName: names.get(String(r.amenity_id)) ?? 'the space',
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      note,
    })
  }
  return canceled.length
}

// ─── Board: retire an amenity ───────────────────────────────────────────

const RetireSchema = z.object({
  id: z.string().uuid(),
  /** false: block new requests and keep what is booked. true: cancel upcoming bookings with a note. */
  cancelUpcoming: z.boolean(),
  note: optionalText(500),
})

/**
 * Stop offering a space. History stays. Residents no longer see it. By default
 * upcoming bookings are kept; with cancelUpcoming they are canceled with the
 * board's note and each resident is told.
 */
export async function retireAmenity(input: z.input<typeof RetireSchema>): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = RetireSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That amenity is not valid.' }
  const { id, cancelUpcoming, note } = parsed.data
  if (cancelUpcoming && !note) {
    return { ok: false, error: 'Add a short note so residents know why.', fieldErrors: { note: 'Add a short note.' } }
  }

  const db = createAdminClient() as unknown as LooseDb
  const upcoming = await loadAmenityReservations(db, gate.orgId, id, new Date().toISOString(), null)
  if (upcoming === null) return { ok: false, error: SOMETHING_WRONG }

  const { data, error } = await db
    .from(AMENITIES_TABLE)
    .update({ retired_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('organization_id', gate.orgId)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[amenities] retire failed', { id, code: error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  if (!data) return { ok: false, error: 'That amenity was not found.' }
  if (cancelUpcoming && upcoming.length > 0) {
    await cancelMany(db, gate.orgId, upcoming.map((r) => r.id), note ?? '')
  }
  refreshAll()
  return { ok: true, id }
}

// ─── Board: hold a time (maintenance, a meeting) ────────────────────────

const HoldSchema = z.object({
  amenityId: z.string().uuid('Pick an amenity.'),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a day.'),
  startHour: z.number().int('Pick a start time.'),
  endHour: z.number().int('Pick an end time.'),
  note: z.string().trim().min(1, 'Say what it is for, like Pool cleaning.').max(200, 'Keep it under 200 characters.'),
})

/** The board blocks a time so no one can book it. Needs no home; shows to residents as taken. */
export async function createBoardHold(input: z.input<typeof HoldSchema>): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = HoldSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error)
  const v = parsed.data

  const db = createAdminClient() as unknown as LooseDb
  const amenity = (await loadAmenities(db, gate.orgId))?.find((a) => a.id === v.amenityId)
  if (!amenity) return { ok: false, error: 'That amenity was not found.' }
  const now = new Date()
  const held = await loadHeldSlots(db, gate.orgId, [amenity.id], now.toISOString())
  if (held === null) return { ok: false, error: SOMETHING_WRONG }
  const zone = await zoneOfAssociation(db, gate.orgId, amenity.associationId)
  const check = checkRequest({
    amenity: { ...amenity, isActive: true },
    day: v.day,
    startHour: v.startHour,
    endHour: v.endHour,
    timeZone: zone,
    now,
    held: held.get(amenity.id) ?? [],
    homeActiveCount: 0,
    board: true,
  })
  if (!check.ok) {
    return { ok: false, error: check.error, ...(check.field ? { fieldErrors: { [check.field]: check.error } } : {}) }
  }
  const user = await getSupabaseServerClient().then((s) => s.auth.getUser())
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .insert({
      organization_id: gate.orgId,
      association_id: amenity.associationId,
      amenity_id: amenity.id,
      unit_id: null,
      kind: 'hold',
      requested_by: user.data.user?.id ?? null,
      starts_at: check.startsAt,
      ends_at: check.endsAt,
      status: 'approved',
      purpose: v.note,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    if (error?.code === '23P01') return { ok: false, error: SLOT_TAKEN, fieldErrors: { startHour: SLOT_TAKEN } }
    console.error('[amenities] hold insert failed', { amenityId: amenity.id, code: error?.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  refreshAll()
  return { ok: true, id: data.id }
}

// ─── Resident: ask for a time ───────────────────────────────────────────

const RequestSchema = z.object({
  amenityId: z.string().uuid('Pick an amenity.'),
  unitId: z.string().uuid('Pick your home.'),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a day.'),
  startHour: z.number().int('Pick a start time.'),
  endHour: z.number().int('Pick an end time.'),
  purpose: optionalText(500),
  partySize: z.number().int('Enter a number of people.').min(1, 'Enter 1 or more people.').max(1000).nullable().optional(),
})

/**
 * A resident books an amenity for their home. Confirmed at once when the
 * board does not need to approve; otherwise it waits for the board and still
 * holds the time.
 */
export async function requestReservation(input: z.input<typeof RequestSchema>): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  const parsed = RequestSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error)
  const v = parsed.data

  if ((await getResidentActor()).impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No community is selected.' }

  const units = await getResidentUnits()
  const unit = units.find((u) => u.unit_id === v.unitId)
  if (!unit) return { ok: false, error: 'You can only book for a home you own or live in.' }

  const db = createAdminClient() as unknown as LooseDb
  const all = await loadAmenities(db, org.id)
  if (all === null) return { ok: false, error: SOMETHING_WRONG }
  const amenity = all.find((a) => a.id === v.amenityId)
  // The home must belong to the same association as the amenity.
  if (!amenity || amenity.associationId !== unit.association_id) {
    return { ok: false, error: 'That amenity was not found.' }
  }

  const now = new Date()
  const held = await loadHeldSlots(db, org.id, [amenity.id], now.toISOString())
  const mine = await loadHomeReservations(db, org.id, [unit.unit_id], now.toISOString())
  if (held === null || mine === null) return { ok: false, error: SOMETHING_WRONG }
  const homeActiveCount = mine.filter((r) => r.amenityId === amenity.id && countsAgainstHome(r, now)).length

  const timeZone = unit.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const check = checkRequest({
    amenity,
    day: v.day,
    startHour: v.startHour,
    endHour: v.endHour,
    timeZone,
    now,
    held: held.get(amenity.id) ?? [],
    homeActiveCount,
    partySize: v.partySize ?? null,
  })
  if (!check.ok) {
    return { ok: false, error: check.error, ...(check.field ? { fieldErrors: { [check.field]: check.error } } : {}) }
  }

  const status = initialStatus(amenity)
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .insert({
      organization_id: org.id,
      association_id: amenity.associationId,
      amenity_id: amenity.id,
      unit_id: unit.unit_id,
      requested_by: user.id,
      starts_at: check.startsAt,
      ends_at: check.endsAt,
      status,
      purpose: v.purpose,
      party_size: v.partySize ?? null,
      // The rules this booking was made under, so a later change does not rewrite them.
      rules_snapshot: {
        hours: hoursForDay(amenity, v.day),
        maxHours: amenity.maxHours,
        minNoticeHours: amenity.minNoticeHours,
        requiresApproval: amenity.requiresApproval,
        rules: amenity.rules,
      },
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    // 23P01: the database refused an overlap that raced past the check above.
    if (error?.code === '23P01') return { ok: false, error: SLOT_TAKEN, fieldErrors: { startHour: SLOT_TAKEN } }
    console.error('[amenities] reservation insert failed', { amenityId: amenity.id, code: error?.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  if (status === 'pending') {
    await bellBoardOfRequest({ organizationId: org.id, actorId: user.id, reservationId: data.id, amenityName: amenity.name })
  }
  refreshAll()
  return { ok: true, id: data.id, status }
}

// ─── Cancel (the home's own booking, or the board) ──────────────────────

/**
 * Cancel a booking that has not started. A resident cancels their home's (and
 * inside the amenity's cancel cutoff is asked to contact the board); the
 * board cancels any and gives a reason, which the resident is emailed.
 */
export async function cancelReservation(reservationId: string, reason?: string): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  if (!Id.safeParse(reservationId).success) return { ok: false, error: 'That booking is not valid.' }
  const note = (reason ?? '').trim().slice(0, 500) || null

  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No community is selected.' }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const db = createAdminClient() as unknown as LooseDb
  const found = (await db
    .from(RESERVATIONS_TABLE)
    .select(`${RESERVATION_COLUMNS}, association_id, requested_by`)
    .eq('id', reservationId)
    .eq('organization_id', org.id)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (found.error) {
    console.error('[amenities] reservation read failed', { id: reservationId, code: found.error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  const row = found.data ? reservationFromRow(found.data) : null
  if (!row) return { ok: false, error: 'That booking was not found.' }

  const now = new Date()
  const boardGate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  const asBoard = boardGate.ok
  if (!asBoard) {
    const units = await getResidentUnits()
    if (!row.unitId || !units.some((u) => u.unit_id === row.unitId)) return { ok: false, error: 'That booking was not found.' }
  } else if (row.kind === 'booking' && !note) {
    return { ok: false, error: 'Add a short reason so the resident knows why.', fieldErrors: { note: 'Add a short reason.' } }
  }
  if (!canCancel(row, now)) return { ok: false, error: 'That booking can no longer be canceled.' }

  const amenity = (await loadAmenities(db, org.id))?.find((a) => a.id === row.amenityId)
  if (!asBoard && amenity && residentMustAskBoard(row, amenity.cancelCutoffHours, now)) {
    return { ok: false, error: 'This booking is too close to its start time to cancel here. Please ask the board to cancel it.' }
  }

  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .update({ status: 'canceled', canceled_at: now.toISOString(), canceled_by: user.id, cancel_reason: note })
    .eq('id', reservationId)
    .eq('organization_id', org.id)
    .in('status', ['pending', 'approved'])
    .select('id')
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error) {
    console.error('[amenities] cancel failed', { id: reservationId, code: error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  if (!data) return { ok: false, error: 'That booking was already changed. Refresh the page.' }

  const requestedBy = typeof found.data?.requested_by === 'string' ? found.data.requested_by : null
  if (asBoard && row.kind === 'booking' && requestedBy !== user.id) {
    await emailResidentOfAnswer({
      kind: 'canceled_by_board',
      organizationId: org.id,
      associationId: String(found.data?.association_id),
      reservationId,
      residentId: requestedBy,
      amenityName: amenity?.name ?? 'the space',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      note,
    })
  }
  refreshAll()
  return { ok: true, id: reservationId }
}

// ─── Board: approve or deny ─────────────────────────────────────────────

const DecisionSchema = z.object({
  reservationId: z.string().uuid(),
  decision: z.enum(['approve', 'deny']),
  note: optionalText(500),
})

/** The board answers a waiting request. A denial needs a short reason the resident will read. */
export async function decideReservation(input: z.input<typeof DecisionSchema>): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = DecisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That request is not valid.' }
  const { reservationId, decision, note } = parsed.data
  if (decision === 'deny' && !note) {
    return { ok: false, error: 'Add a short reason so the resident knows why.', fieldErrors: { note: 'Add a short reason.' } }
  }
  const user = await getSupabaseServerClient().then((s) => s.auth.getUser())
  const userId = user.data.user?.id ?? null

  const db = createAdminClient() as unknown as LooseDb
  const found = (await db
    .from(RESERVATIONS_TABLE)
    .select('id, amenity_id, association_id, requested_by, starts_at, ends_at')
    .eq('id', reservationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (found.error) {
    console.error('[amenities] decision read failed', { id: reservationId, code: found.error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  if (!found.data) return { ok: false, error: 'That request was not found.' }
  const requestedBy = typeof found.data.requested_by === 'string' ? found.data.requested_by : null

  // The person who asked cannot approve their own request when another board
  // member can. If they are the only one, they may.
  if (decision === 'approve' && userId && requestedBy === userId) {
    const others = (await db
      .from('org_members')
      .select('user_id')
      .eq('org_id', gate.orgId)
      .in('role', ['board', 'admin'])
      .neq('user_id', userId)
      .limit(1)) as { data: unknown[] | null; error: { code?: string } | null }
    if (others.error) return { ok: false, error: SOMETHING_WRONG }
    if ((others.data ?? []).length > 0) {
      return { ok: false, error: 'Another board member needs to approve your own request.' }
    }
  }

  const { data, error } = await db
    .from(RESERVATIONS_TABLE)
    .update({
      status: decision === 'approve' ? 'approved' : 'denied',
      decision_note: note,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('organization_id', gate.orgId)
    .eq('status', 'pending')
    .gt('starts_at', new Date().toISOString())
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[amenities] decision failed', { id: reservationId, code: error.code ?? null })
    return { ok: false, error: error.code === '23P01' ? SLOT_TAKEN : SOMETHING_WRONG }
  }
  if (!data) return { ok: false, error: 'That request was already answered, or its time has passed.' }

  if (requestedBy && requestedBy !== userId) {
    const name = (await loadAmenities(db, gate.orgId))?.find((a) => a.id === found.data?.amenity_id)?.name
    await emailResidentOfAnswer({
      kind: decision === 'approve' ? 'approved' : 'denied',
      organizationId: gate.orgId,
      associationId: String(found.data.association_id),
      reservationId,
      residentId: requestedBy,
      amenityName: name ?? 'the space',
      startsAt: String(found.data.starts_at),
      endsAt: String(found.data.ends_at),
      note,
    })
  }
  refreshAll()
  return { ok: true, id: reservationId }
}
