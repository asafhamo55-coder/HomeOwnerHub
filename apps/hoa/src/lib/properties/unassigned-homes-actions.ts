'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserRole } from '@/lib/auth'
import { getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { assignUnassignedHomes } from './unassigned-homes'

export interface AssignHomesState {
  error?: string
  /** Homes attached by the last submit. */
  assigned?: number
}

/**
 * BL-125: the board's "Assign them" on the "N homes aren't assigned to an
 * association" notice. Board or admin (units are a board write; RLS is the
 * backstop). The association is the board's pick from the form; it must
 * belong to the current org. Idempotent and audited (ids and counts only)
 * by `assignUnassignedHomes`.
 */
export async function assignUnassignedHomesAction(_prev: AssignHomesState, formData: FormData): Promise<AssignHomesState> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return { error: 'Sign in to your HOA first.' }
  if (ctx.role !== 'admin' && ctx.role !== 'board') return { error: 'Only the board can assign homes to an association.' }

  const associationId = formData.get('association_id')
  if (typeof associationId !== 'string' || associationId === '') return { error: 'Choose an association.' }

  const user = await getSignedInUser()
  if (!user) return { error: 'Sign in to your HOA first.' }

  const supabase = await getSupabaseServerClient()
  const res = await assignUnassignedHomes(supabase, {
    orgId: ctx.org.id,
    associationId,
    userId: user.id,
    source: 'board_bulk_assign',
  })
  if (!res.ok) return { error: res.error }

  revalidatePath('/', 'layout')
  return { assigned: res.assigned }
}
