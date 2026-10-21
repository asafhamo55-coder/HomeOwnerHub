import { notFound } from 'next/navigation'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadElectionContext, type ElectionContext } from '@/lib/elections/load'
import { UUID } from '@/lib/meeting-quorum/quorum'

/**
 * The gate every election-planner page runs first (BL-141): board or
 * admin, or a redirect before any database client is made. Then the
 * meeting (404 when it isn't this org's), the roster, the ledger on the
 * check day and the saved election.
 */
export async function loadElectionPage(id: string): Promise<{ ok: true; ctx: ElectionContext } | { ok: false }> {
  const { org } = await requireBoardOrAdmin()
  if (!UUID.test(id)) notFound()
  const supabase = await getSupabaseServerClient()
  const res = await loadElectionContext(supabase, org.id, id)
  if (!res.ok) {
    if (res.reason === 'not_found') notFound()
    return { ok: false }
  }
  return res
}
