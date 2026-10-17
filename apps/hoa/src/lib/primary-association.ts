import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { LoadResult } from '@/lib/load-or-fail'
import { readPrimaryAssociation } from '@/lib/association-setup'

/**
 * `getPrimaryAssociation` (lib/vendors.ts) that keeps "none yet"
 * (`data: null`) apart from "could not read" (`ok: false`) — for pages
 * whose empty state says the association does not exist (BL-046). No org
 * selected reads as none.
 */
export async function getPrimaryAssociationResult(): Promise<LoadResult<{ id: string; name: string; timeZone: string } | null>> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, data: null, count: null }
  return readPrimaryAssociation(await getSupabaseServerClient(), org.id)
}
