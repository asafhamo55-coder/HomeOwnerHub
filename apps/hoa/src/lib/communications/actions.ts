'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function deleteCommunication(
  commId: string,
): Promise<ActionResult> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: comm } = await supabase
    .from('communications')
    .select('id, status')
    .eq('id', commId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (!comm) return { ok: false, error: 'Communication not found.' }

  if (comm.status === 'sending') {
    return { ok: false, error: 'Cannot delete a communication that is currently being sent.' }
  }

  const { error } = await supabase
    .from('communications')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', commId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/communications')
  return { ok: true }
}
