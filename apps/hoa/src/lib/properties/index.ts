'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { chooseAssociation, createLot, deleteLot, updateLot } from './lot'
import { asPropertyId } from './resolve'
import { propertyHref } from './href'
import {
  listResidents,
  type PropertyResidentRow,
} from '@/lib/property-residents'
import {
  listPropertyEvents,
  type PropertyEventRow,
} from '@/lib/property-events'

const PropertySchema = z.object({
  address: z.string().trim().min(3, 'Address is required.'),
  unit_number: z.string().trim().optional().or(z.literal('')),
  owner_name: z.string().trim().optional().or(z.literal('')),
  owner_email: z
    .string()
    .trim()
    .email('Owner email must be a valid email.')
    .optional()
    .or(z.literal('')),
  owner_phone: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  /** Required only when the org has more than one association. */
  association_id: z.string().uuid('Choose a community from the list.').optional().or(z.literal('')),
})

export interface PropertyActionState {
  error?: string
  fieldErrors?: Record<string, string>
  /** Set on success: where the new property lives. */
  created?: { href: string }
}

function emptyToNull(s: string | undefined): string | null {
  const trimmed = s?.trim()
  return trimmed ? trimmed : null
}

export async function createProperty(
  _prev: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { error: gate.error }
  const parsed = PropertySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  // The gate names the caller's org; every write below is scoped to it.
  const orgId = gate.orgId
  const supabase = await getSupabaseServerClient()

  const assoc = await chooseAssociation(supabase, orgId, emptyToNull(parsed.data.association_id))
  if (!assoc.ok) {
    return assoc.field ? { error: assoc.error, fieldErrors: { [assoc.field]: assoc.error } } : { error: assoc.error }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Both sides of the lot, so it can be billed, mailed and reached in the
  // portal from the moment it exists (lib/properties/lot.ts).
  const created = await createLot(supabase, {
    orgId,
    associationId: assoc.data.associationId,
    address: parsed.data.address,
    unitNumber: emptyToNull(parsed.data.unit_number),
    owner: {
      name: emptyToNull(parsed.data.owner_name),
      email: emptyToNull(parsed.data.owner_email),
      phone: emptyToNull(parsed.data.owner_phone),
    },
    notes: emptyToNull(parsed.data.notes),
    today: todayIn(await orgTimeZone(supabase, orgId)),
    userId: user?.id ?? null,
  })

  if (!created.ok) return { error: created.error }

  revalidatePath('/properties')
  revalidatePath('/dues')
  revalidatePath('/')
  // The form shows a success toast and opens the new property's page
  // (the server can't raise a toast across a redirect).
  return { created: { href: propertyHref(created.data.propertyId) } }
}

// ─── Update property ────────────────────────────────────────────────

const UpdatePropertySchema = z.object({
  address: z.string().trim().min(3).max(500).optional(),
  unit_number: z.string().trim().nullable().optional(),
  owner_name: z.string().trim().nullable().optional(),
  owner_email: z.string().trim().email().nullable().optional().or(z.literal('')),
  owner_phone: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

export interface UpdatePropertyInput {
  address?: string
  unitNumber?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  ownerPhone?: string | null
  notes?: string | null
}

export async function updateProperty(
  propertyId: string,
  input: UpdatePropertyInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const parsed = UpdatePropertySchema.safeParse({
    address: input.address,
    unit_number: input.unitNumber,
    owner_name: input.ownerName,
    owner_email: input.ownerEmail,
    owner_phone: input.ownerPhone,
    notes: input.notes,
  })
  if (!parsed.success) {
    // Keyed by the edit form's field names so each error lands under its input.
    const toForm: Record<string, string> = {
      address: 'address',
      unit_number: 'unitNumber',
      owner_name: 'ownerName',
      owner_email: 'ownerEmail',
      owner_phone: 'ownerPhone',
      notes: 'notes',
    }
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = toForm[String(issue.path[0] ?? '')] ?? '_'
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.', fieldErrors }
  }

  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const orgId = gate.orgId

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const pid = asPropertyId(propertyId)

  // The property row, its unit's address, and its current ownership move
  // together (lib/properties/lot.ts), so fixing an owner's email here also
  // changes where dues reminders and announcements go.
  const result = await updateLot(supabase, {
    orgId,
    propertyId: pid,
    patch: {
      address: parsed.data.address,
      unitNumber: parsed.data.unit_number,
      ownerName: parsed.data.owner_name,
      ownerEmail: parsed.data.owner_email,
      ownerPhone: parsed.data.owner_phone,
      notes: parsed.data.notes,
    },
    today: todayIn(await orgTimeZone(supabase, orgId)),
    userId: user?.id ?? null,
  })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(propertyHref(pid))
  revalidatePath('/properties')
  return { ok: true }
}

export async function deleteProperty(propertyId: string) {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) throw new Error(gate.error)
  const supabase = await getSupabaseServerClient()
  // Also closes the lot's current ownerships and active tenancies, which
  // is what takes it out of audiences and dues reminders (units has no
  // deleted_at of its own; see lib/properties/lot.ts deleteLot).
  const result = await deleteLot(supabase, {
    orgId: gate.orgId,
    propertyId: asPropertyId(propertyId),
    today: todayIn(await orgTimeZone(supabase, gate.orgId)),
  })
  if (!result.ok) throw new Error(result.error)
  revalidatePath('/properties')
  revalidatePath('/dues')
}

// ─── 360 detail (used by /properties/[id]) ───────────────────────────

export type PropertyTenure = 'owner_occupied' | 'leased' | 'unknown'

export interface PropertyDetailRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
  tenure: PropertyTenure
  tenure_updated_at: string | null
  tenure_updated_by: string | null
  created_at: string | null
}

export interface PropertyDetail {
  property: PropertyDetailRow
  residents: PropertyResidentRow[]
  events: PropertyEventRow[]
}

export async function getPropertyDetail(
  propertyId: string,
): Promise<PropertyDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data: property } = await supabase
    .from('hoa_properties')
    .select(
      'id, address, unit_number, owner_name, owner_email, owner_phone, notes, tenure, tenure_updated_at, tenure_updated_by, created_at',
    )
    .eq('id', propertyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!property) return null
  const p = property as unknown as PropertyDetailRow

  const [residents, events] = await Promise.all([
    listResidents(propertyId),
    listPropertyEvents(propertyId, 25),
  ])

  return { property: p, residents, events }
}

// ─── Tenure ──────────────────────────────────────────────────────────

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

const SetTenureSchema = z.object({
  property_id: z.string().uuid(),
  tenure: z.enum(['owner_occupied', 'leased', 'unknown']),
  notes: z.string().trim().optional(),
})

export interface SetTenureInput {
  propertyId: string
  tenure: PropertyTenure
  notes?: string
}

// Everything that follows a committed tenure write, shared by the single
// and bulk paths so they cannot drift: the tenure_changed event, lease
// started/ended markers, and (on becoming leased) resolving the home's open
// waiting-list entries. `via: 'bulk'` is stamped on the audit payloads.
async function recordTenureChange(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  propertyId: string,
  prev: PropertyTenure,
  target: PropertyTenure,
  opts: { notes?: string | null; via?: 'bulk' } = {},
): Promise<void> {
  const via = opts.via ? { via: opts.via } : {}
  const evTenure = await logPropertyEvent({
    propertyId: propertyId,
    kind: 'tenure_changed',
    payload: { from: prev, to: target, ...via },
    notes: opts.notes ?? null,
  })
  if (!evTenure.ok) {
    console.error('[properties.recordTenureChange] event log failed', evTenure.error)
  }

  // When a property flips to 'leased', record a lease_started marker so
  // the timeline reads as a story instead of a single tenure-change row.
  if (target === 'leased' && prev !== 'leased') {
    const evStart = await logPropertyEvent({
      propertyId: propertyId,
      kind: 'lease_started',
      payload: { from: prev, ...via },
    })
    if (!evStart.ok) {
      console.error('[properties.recordTenureChange] event log failed', evStart.error)
    }

    // Setting tenure by hand is the other way a queued property starts
    // leasing — approveWaitingListEntry is the first, and it flips tenure
    // from the entry's side. Without this, the entry sits at 'waiting'
    // forever: the property shows a "Waiting list" pill while reading as
    // leased, /leases keeps offering Approve/Deny on it, the dashboard
    // count overstates, and listWaitingListCandidates won't re-offer it
    // (it excludes leased properties) so nobody can clear it from the UI.
    //
    // Recorded as 'approved' because that is what materially happened,
    // with `via` naming the route so the audit trail never implies a
    // board vote that didn't take place. Conditional on status='waiting'
    // for the same TOCTOU reason approveWaitingListEntry is.
    const { data: resolved, error: wlErr } = await supabase
      .from('lease_waiting_list' as never)
      .update({
        status: 'approved',
        status_updated_at: new Date().toISOString(),
        status_updated_by: userId,
      } as never)
      .eq('property_id', propertyId)
      .eq('status', 'waiting')
      .select('id')

    if (wlErr) {
      // Non-fatal: the tenure change itself already committed, and
      // failing the action here would report "couldn't set tenure" for a
      // write that succeeded. The stale entry is recoverable by hand.
      console.error('[properties.recordTenureChange] waiting list', wlErr.message)
    } else {
      for (const row of (resolved ?? []) as unknown as Array<{ id: string }>) {
        const evWl = await logPropertyEvent({
          propertyId: propertyId,
          kind: 'waiting_list_resolved',
          payload: {
            outcome: 'approved',
            entryId: row.id,
            via: opts.via ? `${opts.via}_tenure_change` : 'manual_tenure_change',
          },
        })
        if (!evWl.ok) {
          console.error('[properties.recordTenureChange] event log failed', evWl.error)
        }
      }
    }
  }
  if (target !== 'leased' && prev === 'leased') {
    const evEnd = await logPropertyEvent({
      propertyId: propertyId,
      kind: 'lease_ended',
      payload: { to: target, ...via },
    })
    if (!evEnd.ok) {
      console.error('[properties.recordTenureChange] event log failed', evEnd.error)
    }
  }
}

export async function setPropertyTenure(
  input: SetTenureInput,
): Promise<ActionResult> {
  const parsed = SetTenureSchema.safeParse({
    property_id: input.propertyId,
    tenure: input.tenure,
    notes: input.notes,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  // Board/admin only: the (dashboard) layout already redirects residents,
  // but server actions are reachable via direct POST regardless of which
  // page rendered them, so we gate here too.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: existing } = await supabase
    .from('hoa_properties')
    .select('id, tenure')
    .eq('id', parsed.data.property_id)
    .maybeSingle<{ id: string; tenure: PropertyTenure | null }>()
  if (!existing) return { ok: false, error: 'Property not found.' }

  const prev: PropertyTenure = (existing.tenure ?? 'unknown') as PropertyTenure
  if (prev === parsed.data.tenure && !parsed.data.notes) {
    // No-op write would still trigger an event; bail early.
    return { ok: true }
  }

  const { error } = await supabase
    .from('hoa_properties')
    .update({
      tenure: parsed.data.tenure,
      tenure_updated_at: new Date().toISOString(),
      tenure_updated_by: user.id,
    } as never)
    .eq('id', parsed.data.property_id)
  if (error) return { ok: false, error: error.message }

  await recordTenureChange(supabase, user.id, parsed.data.property_id, prev, parsed.data.tenure, {
    notes: parsed.data.notes ?? null,
  })

  revalidatePath(propertyHref(asPropertyId(parsed.data.property_id)))
  revalidatePath('/properties')
  revalidatePath('/leases')
  return { ok: true }
}

// ─── Bulk tenure ─────────────────────────────────────────────────────

const BulkSetTenureSchema = z.object({
  property_ids: z
    .array(z.string().uuid())
    .min(1, 'Select at least one property.')
    .max(200, 'You can update at most 200 properties at a time.'),
  tenure: z.enum(['owner_occupied', 'leased', 'unknown']),
})

export interface BulkSetTenureInput {
  propertyIds: string[]
  tenure: PropertyTenure
}

// Bulk-set tenure across many properties. We loop and call the same
// underlying steps as `setPropertyTenure` so each property gets:
//   • the table update with stamped tenure_updated_at / _by
//   • a `tenure_changed` property_events row
//   • lease_started / lease_ended markers on the boundary cases
// We deliberately do NOT call setPropertyTenure() in a loop — that would
// re-run getCurrentUserRoleInOrg() for every row (one round-trip each).
export async function bulkSetPropertyTenure(
  input: BulkSetTenureInput,
): Promise<ActionResult<{ updated: number; failed: number; failedIds: string[] }>> {
  const parsed = BulkSetTenureSchema.safeParse({
    property_ids: input.propertyIds,
    tenure: input.tenure,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  // Board/admin only — mirror the security fix pattern from setPropertyTenure.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // De-dupe IDs in case the client posted the same id twice.
  const ids = Array.from(new Set(parsed.data.property_ids))

  // Single round-trip to read prior tenures. Scoped to the caller's org
  // explicitly, not only by RLS: an id from another org never returns, so
  // it counts as failed and is never written.
  const { data: existingRows, error: readErr } = await supabase
    .from('hoa_properties')
    .select('id, tenure')
    .eq('org_id', org.id)
    .in('id', ids)
  if (readErr) return { ok: false, error: readErr.message }

  const existing = new Map<string, PropertyTenure>()
  for (const row of (existingRows ?? []) as unknown as Array<{
    id: string
    tenure: PropertyTenure | null
  }>) {
    existing.set(row.id, (row.tenure ?? 'unknown') as PropertyTenure)
  }

  const nowIso = new Date().toISOString()
  const target = parsed.data.tenure
  let updated = 0
  let failed = 0
  const failedIds: string[] = []

  for (const propertyId of ids) {
    const prev = existing.get(propertyId)
    if (prev === undefined) {
      // Property either doesn't exist or belongs to another org. Count as failure.
      failed += 1
      failedIds.push(propertyId)
      continue
    }
    if (prev === target) {
      // No-op — don't log a noisy event, but count it as "updated" so
      // the user sees the intuitive total.
      updated += 1
      continue
    }

    const { error: updErr } = await supabase
      .from('hoa_properties')
      .update({
        tenure: target,
        tenure_updated_at: nowIso,
        tenure_updated_by: user.id,
      } as never)
      .eq('id', propertyId)
      .eq('org_id', org.id)
    if (updErr) {
      console.error('[properties.bulkSetPropertyTenure] update failed', propertyId, updErr.message)
      failed += 1
      failedIds.push(propertyId)
      continue
    }

    await recordTenureChange(supabase, user.id, propertyId, prev, target, { via: 'bulk' })

    updated += 1
  }

  revalidatePath('/properties')
  revalidatePath('/leases')
  return { ok: true, data: { updated, failed, failedIds } }
}
