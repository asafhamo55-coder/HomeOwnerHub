'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  name: z.string().trim().min(2, 'Give your HOA a name (at least 2 characters).'),
  doors_count: z.coerce.number().int().min(1).max(10_000).optional(),
})

export interface OnboardingActionState {
  error?: string
}

export async function createHoaOrg(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = Schema.safeParse({
    name: formData.get('name'),
    doors_count: formData.get('doors_count') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in.' }

  // 1) Create the org. RLS allows authenticated users to insert; the
  //    org_members row we add next is what links the org to this user.
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .insert({
      name: parsed.data.name,
      hub_type: 'hoa',
      plan: 'free',
      doors_count: parsed.data.doors_count ?? null,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    return { error: orgError?.message ?? 'Could not create the HOA.' }
  }

  // 2) Make the creator an owner.
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    // Roll back the org so the user can retry without colliding on a stranded row.
    await supabase.from('orgs').delete().eq('id', org.id)
    return { error: memberError.message }
  }

  redirect('/')
}
