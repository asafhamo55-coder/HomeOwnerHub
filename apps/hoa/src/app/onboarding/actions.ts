'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminClient } from '@homeownerhub/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  name: z.string().trim().min(2, 'Give your HOA a name (at least 2 characters).'),
  doors_count: z.coerce.number().int().min(1).max(10_000).optional(),
})

export interface OnboardingActionState {
  error?: string
}

// Onboarding is a privileged founder operation: the user is creating the
// first org they belong to, so RLS-as-them gives a chicken-and-egg failure
// (they're not a member of the org they're trying to create, so the
// SELECT-after-INSERT visibility check fails). We use the admin client
// (service role) for this single setup step. The user is identified by
// their authenticated session via the regular client; the admin client
// just performs the writes.
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

  const userClient = await getSupabaseServerClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return { error: 'You must be signed in.' }

  const admin = createAdminClient()

  const { data: org, error: orgError } = await admin
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

  const { error: memberError } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
    joined_at: new Date().toISOString(),
  })

  if (memberError) {
    // Roll back the org so the user can retry without colliding on a stranded row.
    await admin.from('orgs').delete().eq('id', org.id)
    return { error: memberError.message }
  }

  redirect('/')
}
