'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  parseNewAssociation,
  safeSetupReturnTo,
  setUpAssociationCore,
  type NewAssociationField,
} from './association-setup'

export interface SetUpAssociationState {
  error?: string
  fieldErrors?: Partial<Record<NewAssociationField, string>>
}

/**
 * BL-046: the inline "Set up your association" form on /dues and the
 * accounting pages. Admin only — RLS (0063 `associations_insert`) refuses
 * anyone else; this gate refuses first, without touching the database.
 */
export async function setUpAssociation(
  _prev: SetUpAssociationState,
  formData: FormData,
): Promise<SetUpAssociationState> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return { error: 'Sign in to your HOA first.' }
  if (ctx.role !== 'admin') return { error: 'Only an admin of your HOA can create the association.' }

  const parsed = parseNewAssociation({
    name: formData.get('name'),
    state: formData.get('state'),
    type: formData.get('type'),
  })
  if (!parsed.ok) return { error: 'Check the highlighted fields.', fieldErrors: parsed.fieldErrors }

  const supabase = await getSupabaseServerClient()
  const res = await setUpAssociationCore(supabase, {
    orgId: ctx.org.id,
    input: parsed.data,
    year: new Date().getFullYear(),
  })
  // A part-way failure may still have created the association; refresh so
  // the pages show what exists.
  if (!res.ok) {
    if (res.associationId) revalidatePath('/', 'layout')
    return { error: res.error }
  }

  revalidatePath('/', 'layout')
  redirect(safeSetupReturnTo(formData.get('return_to')))
}
