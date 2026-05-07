'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminClient } from '@homeownerhub/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Give your workspace a name (at least 2 characters).'),
})

export interface OnboardingActionState {
  error?: string
}

// Eviction onboarding mirrors HOA: create org + org_members atomically via
// the admin client to sidestep the founder-flow RLS visibility issue.
export async function createEvictionOrg(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = Schema.safeParse({ name: formData.get('name') })
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
      hub_type: 'eviction',
      plan: 'free',
    })
    .select('id')
    .single()

  if (orgError || !org) {
    return { error: orgError?.message ?? 'Could not create the workspace.' }
  }

  const { error: memberError } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
    joined_at: new Date().toISOString(),
  })

  if (memberError) {
    await admin.from('orgs').delete().eq('id', org.id)
    return { error: memberError.message }
  }

  redirect('/')
}
