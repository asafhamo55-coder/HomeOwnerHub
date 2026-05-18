'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
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

  await logPropertyEvent({
    propertyId: parsed.data.property_id,
    kind: 'tenure_changed',
    payload: { from: prev, to: parsed.data.tenure },
    notes: parsed.data.notes ?? null,
  })

  // When a property flips to 'leased', record a lease_started marker so
  // the timeline reads as a story instead of a single tenure-change row.
  if (parsed.data.tenure === 'leased' && prev !== 'leased') {
    await logPropertyEvent({
      propertyId: parsed.data.property_id,
      kind: 'lease_started',
      payload: { from: prev },
    })
  }
  if (parsed.data.tenure !== 'leased' && prev === 'leased') {
    await logPropertyEvent({
      propertyId: parsed.data.property_id,
      kind: 'lease_ended',
      payload: { to: parsed.data.tenure },
    })
  }

  revalidatePath(`/properties/${parsed.data.property_id}`)
  revalidatePath('/leases')
  return { ok: true }
}
