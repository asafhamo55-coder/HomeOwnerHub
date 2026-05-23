'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'
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
})

export interface PropertyActionState {
  error?: string
  fieldErrors?: Record<string, string>
}

function emptyToNull(s: string | undefined): string | null {
  const trimmed = s?.trim()
  return trimmed ? trimmed : null
}

export async function createProperty(
  _prev: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const parsed = PropertySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from('hoa_properties').insert({
    org_id: org.id,
    address: parsed.data.address,
    unit_number: emptyToNull(parsed.data.unit_number),
    owner_name: emptyToNull(parsed.data.owner_name),
    owner_email: emptyToNull(parsed.data.owner_email),
    owner_phone: emptyToNull(parsed.data.owner_phone),
    notes: emptyToNull(parsed.data.notes),
  })

  if (error) return { error: error.message }

  revalidatePath('/properties')
  redirect('/properties')
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdatePropertySchema.safeParse({
    address: input.address,
    unit_number: input.unitNumber,
    owner_name: input.ownerName,
    owner_email: input.ownerEmail,
    owner_phone: input.ownerPhone,
    notes: input.notes,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = {}
  if (parsed.data.address !== undefined) patch.address = parsed.data.address
  if (parsed.data.unit_number !== undefined) patch.unit_number = parsed.data.unit_number || null
  if (parsed.data.owner_name !== undefined) patch.owner_name = parsed.data.owner_name || null
  if (parsed.data.owner_email !== undefined) patch.owner_email = parsed.data.owner_email || null
  if (parsed.data.owner_phone !== undefined) patch.owner_phone = parsed.data.owner_phone || null
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes || null

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('hoa_properties')
    .update(patch as never)
    .eq('id', propertyId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  return { ok: true }
}

export async function deleteProperty(propertyId: string) {
  const supabase = await getSupabaseServerClient()
  // RLS scopes the delete to the user's org automatically — no extra org check needed.
  const { error } = await supabase.from('hoa_properties').delete().eq('id', propertyId)
  if (error) throw new Error(error.message)
  revalidatePath('/properties')
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

  const evTenure = await logPropertyEvent({
    propertyId: parsed.data.property_id,
    kind: 'tenure_changed',
    payload: { from: prev, to: parsed.data.tenure },
    notes: parsed.data.notes ?? null,
  })
  if (!evTenure.ok) {
    console.error('[properties.setPropertyTenure] event log failed', evTenure.error)
  }

  // When a property flips to 'leased', record a lease_started marker so
  // the timeline reads as a story instead of a single tenure-change row.
  if (parsed.data.tenure === 'leased' && prev !== 'leased') {
    const evStart = await logPropertyEvent({
      propertyId: parsed.data.property_id,
      kind: 'lease_started',
      payload: { from: prev },
    })
    if (!evStart.ok) {
      console.error('[properties.setPropertyTenure] event log failed', evStart.error)
    }
  }
  if (parsed.data.tenure !== 'leased' && prev === 'leased') {
    const evEnd = await logPropertyEvent({
      propertyId: parsed.data.property_id,
      kind: 'lease_ended',
      payload: { to: parsed.data.tenure },
    })
    if (!evEnd.ok) {
      console.error('[properties.setPropertyTenure] event log failed', evEnd.error)
    }
  }

  revalidatePath(`/properties/${parsed.data.property_id}`)
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
): Promise<ActionResult<{ updated: number; failed: number }>> {
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

  // Single round-trip to read prior tenures. RLS scopes this to the
  // user's org automatically; ids outside the org just won't return.
  const { data: existingRows, error: readErr } = await supabase
    .from('hoa_properties')
    .select('id, tenure')
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

  for (const propertyId of ids) {
    const prev = existing.get(propertyId)
    if (prev === undefined) {
      // Property either doesn't exist or RLS hid it. Count as failure.
      failed += 1
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
    if (updErr) {
      console.error('[properties.bulkSetPropertyTenure] update failed', propertyId, updErr.message)
      failed += 1
      continue
    }

    const evTenure = await logPropertyEvent({
      propertyId,
      kind: 'tenure_changed',
      payload: { from: prev, to: target, via: 'bulk' },
    })
    if (!evTenure.ok) {
      console.error('[properties.bulkSetPropertyTenure] event log failed', evTenure.error)
    }

    if (target === 'leased' && prev !== 'leased') {
      const evStart = await logPropertyEvent({
        propertyId,
        kind: 'lease_started',
        payload: { from: prev, via: 'bulk' },
      })
      if (!evStart.ok) {
        console.error('[properties.bulkSetPropertyTenure] event log failed', evStart.error)
      }
    }
    if (target !== 'leased' && prev === 'leased') {
      const evEnd = await logPropertyEvent({
        propertyId,
        kind: 'lease_ended',
        payload: { to: target, via: 'bulk' },
      })
      if (!evEnd.ok) {
        console.error('[properties.bulkSetPropertyTenure] event log failed', evEnd.error)
      }
    }

    updated += 1
  }

  revalidatePath('/properties')
  revalidatePath('/leases')
  return { ok: true, data: { updated, failed } }
}
