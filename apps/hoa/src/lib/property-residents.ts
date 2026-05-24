'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'

// property_residents lands in migration 0017. Owners, tenants, family
// members and other occupants. moved_out_at NULL = currently in
// residence. The events table next door records the lifecycle.

export type PropertyResidentRole = 'owner' | 'tenant' | 'family_member' | 'other'

export interface PropertyResidentRow {
  id: string
  property_id: string
  full_name: string
  email: string | null
  phone: string | null
  role: PropertyResidentRole
  is_primary: boolean
  moved_in_at: string | null
  moved_out_at: string | null
  notes: string | null
  created_at: string
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

export async function listResidents(
  propertyId: string,
): Promise<PropertyResidentRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('property_residents' as never)
    .select(
      'id, property_id, full_name, email, phone, role, is_primary, moved_in_at, moved_out_at, notes, created_at',
    )
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('moved_out_at', { ascending: false, nullsFirst: true })
    .order('is_primary', { ascending: false })
    .order('full_name', { ascending: true })
  return (data ?? []) as unknown as PropertyResidentRow[]
}

// ─── Writes ──────────────────────────────────────────────────────────

const AddResidentSchema = z.object({
  property_id: z.string().uuid(),
  full_name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(200, 'Name must be 200 characters or fewer.'),
  email: z
    .string()
    .trim()
    .email()
    .max(200, 'Email must be 200 characters or fewer.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .max(50, 'Phone must be 50 characters or fewer.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  role: z.enum(['owner', 'tenant', 'family_member', 'other']),
  is_primary: z.boolean().optional(),
  moved_in_at: z.string().optional().or(z.literal('').transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes must be 2000 characters or fewer.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export interface AddResidentInput {
  propertyId: string
  fullName: string
  email?: string
  phone?: string
  role: PropertyResidentRole
  isPrimary?: boolean
  movedInAt?: string
  notes?: string
}

export async function addResident(
  input: AddResidentInput,
): Promise<ActionResult<{ residentId: string }>> {
  const parsed = AddResidentSchema.safeParse({
    property_id: input.propertyId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    is_primary: input.isPrimary,
    moved_in_at: input.movedInAt,
    notes: input.notes,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('property_residents' as never)
    .insert({
      organization_id: org.id,
      property_id: parsed.data.property_id,
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      role: parsed.data.role,
      is_primary: parsed.data.is_primary ?? false,
      moved_in_at: parsed.data.moved_in_at ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user?.id ?? null,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not add resident.' }
  }

  const ev = await logPropertyEvent({
    propertyId: parsed.data.property_id,
    kind: 'resident_added',
    payload: {
      residentId: data.id,
      fullName: parsed.data.full_name,
      role: parsed.data.role,
    },
  })
  if (!ev.ok) {
    console.error('[property-residents.addResident] event log failed', ev.error)
  }

  revalidatePath('/')  // dashboard rollup
  revalidatePath(`/properties/${parsed.data.property_id}`)
  return { ok: true, data: { residentId: data.id } }
}

const UpdateResidentSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1)
    .max(200, 'Name must be 200 characters or fewer.')
    .optional(),
  email: z
    .string()
    .trim()
    .email()
    .max(200, 'Email must be 200 characters or fewer.')
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .max(50, 'Phone must be 50 characters or fewer.')
    .nullable()
    .optional(),
  role: z.enum(['owner', 'tenant', 'family_member', 'other']).optional(),
  is_primary: z.boolean().optional(),
  moved_in_at: z.string().nullable().optional(),
  moved_out_at: z.string().nullable().optional(),
  notes: z
    .string()
    .max(2000, 'Notes must be 2000 characters or fewer.')
    .nullable()
    .optional(),
})

export type UpdateResidentInput = z.infer<typeof UpdateResidentSchema>

export async function updateResident(
  residentId: string,
  partial: UpdateResidentInput,
): Promise<ActionResult> {
  const parsed = UpdateResidentSchema.safeParse(partial)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const { data: existing } = await supabase
    .from('property_residents' as never)
    .select('id, property_id, role, moved_out_at, full_name')
    .eq('id', residentId)
    .maybeSingle<{
      id: string
      property_id: string
      role: PropertyResidentRole
      moved_out_at: string | null
      full_name: string
    }>()
  if (!existing) return { ok: false, error: 'Resident not found.' }

  const patch: Record<string, unknown> = {}
  if (parsed.data.full_name !== undefined) patch.full_name = parsed.data.full_name
  if (parsed.data.email !== undefined) patch.email = parsed.data.email
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone
  if (parsed.data.role !== undefined) patch.role = parsed.data.role
  if (parsed.data.is_primary !== undefined) patch.is_primary = parsed.data.is_primary
  if (parsed.data.moved_in_at !== undefined) patch.moved_in_at = parsed.data.moved_in_at
  if (parsed.data.moved_out_at !== undefined) patch.moved_out_at = parsed.data.moved_out_at
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('property_residents' as never)
    .update(patch as never)
    .eq('id', residentId)
  if (error) return { ok: false, error: error.message }

  // Only log on the changes that materially change the resident's
  // relationship to the property — name/contact tweaks aren't
  // history-worthy.
  const roleChanged = parsed.data.role !== undefined && parsed.data.role !== existing.role
  const movedOut =
    parsed.data.moved_out_at !== undefined &&
    parsed.data.moved_out_at !== existing.moved_out_at &&
    parsed.data.moved_out_at !== null
  if (roleChanged || movedOut) {
    const ev = await logPropertyEvent({
      propertyId: existing.property_id,
      kind: movedOut ? 'resident_removed' : 'note',
      payload: {
        residentId,
        fullName: existing.full_name,
        roleChange: roleChanged
          ? { from: existing.role, to: parsed.data.role }
          : undefined,
        movedOutAt: movedOut ? parsed.data.moved_out_at : undefined,
      },
    })
    if (!ev.ok) {
      console.error('[property-residents.updateResident] event log failed', ev.error)
    }
  }

  revalidatePath(`/properties/${existing.property_id}`)
  return { ok: true }
}

export async function removeResident(residentId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()
  const { data: existing } = await supabase
    .from('property_residents' as never)
    .select('id, property_id, full_name, role, moved_out_at')
    .eq('id', residentId)
    .maybeSingle<{
      id: string
      property_id: string
      full_name: string
      role: PropertyResidentRole
      moved_out_at: string | null
    }>()
  if (!existing) return { ok: false, error: 'Resident not found.' }

  // Don't fire a misleading audit row when the update would be a no-op.
  // Without this check the row count stays at 0 but we'd still log a
  // resident_removed event dated today.
  if (existing.moved_out_at) {
    return { ok: false, error: 'Resident has already been removed.' }
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const { error } = await supabase
    .from('property_residents' as never)
    .update({ moved_out_at: today } as never)
    .eq('id', residentId)
    .is('moved_out_at', null)
  if (error) return { ok: false, error: error.message }

  const ev = await logPropertyEvent({
    propertyId: existing.property_id,
    kind: 'resident_removed',
    payload: {
      residentId,
      fullName: existing.full_name,
      role: existing.role,
      movedOutAt: today,
    },
  })
  if (!ev.ok) {
    console.error('[property-residents.removeResident] event log failed', ev.error)
  }

  revalidatePath(`/properties/${existing.property_id}`)
  return { ok: true }
}
