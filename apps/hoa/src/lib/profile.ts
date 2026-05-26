'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface MyProfile {
  id: string
  email: string | null
  full_name: string | null
}

type ActionOk = { ok: true }
type ActionErr = { ok: false; error: string }
export type ActionResult = ActionOk | ActionErr

/**
 * Loads the current user's profile row. Returns null if not signed in.
 * Uses the user-bound client — profiles RLS lets you read your own row.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', user.id)
    .maybeSingle<{ id: string; email: string | null; full_name: string | null }>()

  // If the profiles row hasn't been created yet (e.g. trigger raced),
  // synthesize from auth.users so the greeting + settings page still
  // render something useful.
  return data ?? {
    id: user.id,
    email: user.email ?? null,
    full_name: null,
  }
}

const UpdateProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(200, 'Name must be 200 characters or fewer.'),
})

export interface UpdateMyProfileInput {
  fullName: string
}

/**
 * Updates the current user's full_name. RLS policy lets you update
 * only your own profile row (id = auth.uid()), so this is safe via
 * the user-bound client.
 *
 * Revalidates the dashboard (greeting reads from here) and /settings
 * (form re-renders with the new value).
 */
export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<ActionResult> {
  const parsed = UpdateProfileSchema.safeParse({ full_name: input.fullName })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // upsert covers both "row exists" and "row missing" without an extra
  // SELECT. profiles.id is the PK so onConflict-on-id is implicit.
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: parsed.data.full_name,
      email: user.email ?? null,
    } as never)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}
