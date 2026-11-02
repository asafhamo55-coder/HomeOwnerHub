'use server'

// BL-034: amenity reservations (amenities and amenity_reservations, migration
// 0076; M11_APPLIED).
//
// A server action is a public endpoint, so each one checks who is asking
// before it does any work. The tables have no write policy for the web roles:
// after the checks, writes go through the service role, scoped to the
// caller's org. The database trigger (amenity_reservation_no_overlap) is the
// real double-booking guard; the 23P01 it raises is turned into a plain
// sentence here.
//
// Nothing is emailed or texted from here. No money: fees and deposits wait for
// online payments. Flag off: nothing is read or written. Logs carry ids and
// error codes only.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import {
  AMENITIES_NOT_LIVE,
  AMENITY_COLUMNS,
  SLOT_TAKEN,
  amenityFromRow,
  canCancel,
  checkRequest,
  countsAgainstHome,
  initialStatus,
  reservationFromRow,
  RESERVATION_COLUMNS,
} from './model'
import { AMENITIES_TABLE, RESERVATIONS_TABLE, loadHeldSlots, loadHomeReservations, type LooseDb } from './queries'

export type AmenityActionResult =
  | { ok: true; id?: string; status?: 'pending' | 'approved' }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

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

// ─── Board: set up an amenity ───────────────────────────────────────────

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
  })
  .superRefine((v, ctx) => {
    if (v.closeHour <= v.openHour) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['closeHour'], message: 'Closing time must be after opening time.' })
    } else if (v.maxHours > v.closeHour - v.openHour) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxHours'], message: 'That is longer than the hours it is open.' })
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
  }

  if (args.id) {
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
    refreshAll()
    return { ok: true, id: args.id }
  }

  // The association: the org's first one (self-managed HOAs have one).
  const assoc = (await db
    .from('associations')
    .select('id')
    .eq('organization_id', gate.orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null }
  if (assoc.error || !assoc.data) {
    if (assoc.error) console.error('[amenities] association read failed', { orgId: gate.orgId, code: assoc.error.code ?? null })
    return { ok: false, error: 'Set up your association first, then add amenities.' }
  }
  const user = await getSupabaseServerClient().then((s) => s.auth.getUser())
  const { data, error } = (await db
    .from(AMENITIES_TABLE)
    .insert({ ...row, organization_id: gate.orgId, association_id: assoc.data.id, created_by: user.data.user?.id ?? null })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    console.error('[amenities] insert failed', { orgId: gate.orgId, code: error?.code ?? null })
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
  const found = (await db
    .from(AMENITIES_TABLE)
    .select(AMENITY_COLUMNS)
    .eq('id', v.amenityId)
    .eq('organization_id', org.id)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (found.error) {
    console.error('[amenities] amenity read failed', { id: v.amenityId, code: found.error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  const amenity = found.data ? amenityFromRow(found.data) : null
  // The home must belong to the same association as the amenity.
  if (!amenity || amenity.associationId !== unit.association_id) {
    return { ok: false, error: 'That amenity was not found.' }
  }

  const now = new Date()
  const held = await loadHeldSlots(db, org.id, [amenity.id], now.toISOString())
  const mine = await loadHomeReservations(db, org.id, [unit.unit_id], now.toISOString())
  if (held === null || mine === null) return { ok: false, error: SOMETHING_WRONG }
  const homeActiveCount = mine.filter((r) => r.amenityId === amenity.id && countsAgainstHome(r, now)).length

  const check = checkRequest({
    amenity,
    day: v.day,
    startHour: v.startHour,
    endHour: v.endHour,
    timeZone: unit.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE,
    now,
    held: held.get(amenity.id) ?? [],
    homeActiveCount,
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
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    // 23P01: the database refused an overlap that raced past the check above.
    if (error?.code === '23P01') return { ok: false, error: SLOT_TAKEN, fieldErrors: { startHour: SLOT_TAKEN } }
    console.error('[amenities] reservation insert failed', { amenityId: amenity.id, code: error?.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  refreshAll()
  return { ok: true, id: data.id, status }
}

// ─── Cancel (the home's own booking, or the board) ──────────────────────

/** Cancel a booking that has not started. A resident cancels their home's; the board cancels any. */
export async function cancelReservation(reservationId: string): Promise<AmenityActionResult> {
  if (!M11_APPLIED) return { ok: false, error: AMENITIES_NOT_LIVE }
  if (!Id.safeParse(reservationId).success) return { ok: false, error: 'That booking is not valid.' }

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
    .select(RESERVATION_COLUMNS)
    .eq('id', reservationId)
    .eq('organization_id', org.id)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (found.error) {
    console.error('[amenities] reservation read failed', { id: reservationId, code: found.error.code ?? null })
    return { ok: false, error: SOMETHING_WRONG }
  }
  const row = found.data ? reservationFromRow(found.data) : null
  if (!row) return { ok: false, error: 'That booking was not found.' }

  const boardGate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!boardGate.ok) {
    const units = await getResidentUnits()
    if (!units.some((u) => u.unit_id === row.unitId)) return { ok: false, error: 'That booking was not found.' }
  }
  if (!canCancel(row, new Date())) return { ok: false, error: 'That booking can no longer be canceled.' }

  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), canceled_by: user.id })
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

  const db = createAdminClient() as unknown as LooseDb
  const { data, error } = (await db
    .from(RESERVATIONS_TABLE)
    .update({
      status: decision === 'approve' ? 'approved' : 'denied',
      decision_note: note,
      decided_by: user.data.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('organization_id', gate.orgId)
    .eq('status', 'pending')
    .gt('starts_at', new Date().toISOString())
    .select('id')
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error) {
    console.error('[amenities] decision failed', { id: reservationId, code: error.code ?? null })
    return { ok: false, error: error.code === '23P01' ? SLOT_TAKEN : SOMETHING_WRONG }
  }
  if (!data) return { ok: false, error: 'That request was already answered, or its time has passed.' }
  refreshAll()
  return { ok: true, id: reservationId }
}
