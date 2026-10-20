'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'
import { getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  parseNewAssociation,
  readPrimaryAssociation,
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

  const user = await getSignedInUser()
  if (!user) return { error: 'Sign in to your HOA first.' }

  const supabase = await getSupabaseServerClient()
  const res = await setUpAssociationCore(supabase, {
    orgId: ctx.org.id,
    userId: user.id,
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

export interface OpenBooksState {
  error?: string
}

/**
 * BL-064: "Open the books" for an association that exists but has no
 * funds, chart of accounts or fiscal period. Admin only, like the create
 * form. It opens the books of the org's PRIMARY association (the one the
 * accounting pages show) — the id is never taken from the form — and
 * never creates an association.
 */
export async function openBooks(_prev: OpenBooksState, formData: FormData): Promise<OpenBooksState> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return { error: 'Sign in to your HOA first.' }
  if (ctx.role !== 'admin') return { error: 'Only an admin of your HOA can open the books.' }

  const user = await getSignedInUser()
  if (!user) return { error: 'Sign in to your HOA first.' }

  const supabase = await getSupabaseServerClient()
  const assoc = await readPrimaryAssociation(supabase, ctx.org.id)
  if (!assoc.ok) return { error: 'We couldn’t check your association just now. Try again.' }
  if (!assoc.data) return { error: 'Your HOA has no association yet. Set one up first.' }

  const res = await setUpAssociationCore(supabase, {
    orgId: ctx.org.id,
    associationId: assoc.data.id,
    userId: user.id,
    year: new Date().getFullYear(),
  })
  // A part-way failure may have added some rows; refresh either way.
  revalidatePath('/', 'layout')
  if (!res.ok) return { error: res.error }
  redirect(safeSetupReturnTo(formData.get('return_to')))
}
