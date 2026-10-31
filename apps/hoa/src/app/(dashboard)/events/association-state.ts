import 'server-only'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/** The primary association's state, or null when it cannot be read. */
export async function loadAssociationState(): Promise<string | null> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return null
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from('associations').select('state').eq('id', assoc.id).maybeSingle()
  if (error) console.error('[events] association state read failed', { code: error.code ?? null })
  return (data as { state: string | null } | null)?.state ?? null
}
