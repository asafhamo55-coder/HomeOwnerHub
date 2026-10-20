import { notFound } from 'next/navigation'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadKitContext, type KitLoad } from '@/lib/meeting-quorum/load'
import { UUID } from '@/lib/meeting-quorum/quorum'

/**
 * The gate every quorum-kit page runs first (BL-122): board or admin, or a
 * redirect before any database client is made. Then the meeting (404 when
 * it isn't this org's), the roster and the kit.
 */
export async function loadKitPage(id: string): Promise<{ ok: true; ctx: Extract<KitLoad, { ok: true }>['ctx'] } | { ok: false }> {
  const { org } = await requireBoardOrAdmin()
  if (!UUID.test(id)) notFound()
  const supabase = await getSupabaseServerClient()
  const res = await loadKitContext(supabase, org.id, id)
  if (!res.ok) {
    if (res.reason === 'not_found') notFound()
    return { ok: false }
  }
  return res
}
