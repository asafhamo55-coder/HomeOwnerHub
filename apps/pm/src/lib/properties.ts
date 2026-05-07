'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const PropertySchema = z.object({
  address: z.string().trim().min(3, 'Property address is required.'),
  monthly_rent: z.coerce.number().min(0, 'Rent must be a positive number.'),
  tenant_name: z.string().trim().optional().or(z.literal('')),
  tenant_email: z
    .string()
    .trim()
    .email('Tenant email must be valid.')
    .optional()
    .or(z.literal('')),
  tenant_phone: z.string().trim().optional().or(z.literal('')),
  lease_start: z.string().optional().or(z.literal('')),
  lease_end: z.string().optional().or(z.literal('')),
})

export interface PropertyActionState {
  error?: string
  fieldErrors?: Record<string, string>
}

function emptyToNull(s: string | undefined): string | null {
  const trimmed = s?.trim()
  return trimmed ? trimmed : null
}

export async function createOrUpdateProperty(
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
  if (!org) return { error: 'No workspace selected.' }

  const supabase = await getSupabaseServerClient()
  const existingId = formData.get('id') as string | null

  // Free-tier limit: enforce one property max unless we're updating an existing one.
  if (!existingId && org.plan === 'free') {
    const { count } = await supabase
      .from('pm_properties')
      .select('id', { count: 'exact', head: true })
    if ((count ?? 0) >= 1) {
      return {
        error:
          'Free plan supports one property. Upgrade to add more.',
      }
    }
  }

  const payload = {
    org_id: org.id,
    address: parsed.data.address,
    monthly_rent: parsed.data.monthly_rent,
    tenant_name: emptyToNull(parsed.data.tenant_name),
    tenant_email: emptyToNull(parsed.data.tenant_email),
    tenant_phone: emptyToNull(parsed.data.tenant_phone),
    lease_start: emptyToNull(parsed.data.lease_start),
    lease_end: emptyToNull(parsed.data.lease_end),
  }

  if (existingId) {
    const { error } = await supabase
      .from('pm_properties')
      .update(payload)
      .eq('id', existingId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('pm_properties').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/setup')
  revalidatePath('/rent')
  redirect('/')
}
