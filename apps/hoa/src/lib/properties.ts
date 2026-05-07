'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
