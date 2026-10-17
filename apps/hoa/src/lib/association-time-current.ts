import { cache } from 'react'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { loadZoneIndex, orgTimeZone } from '@/lib/association-time-server'
import { buildZoneIndex, scopeTimeZone } from '@/lib/association-zone-index'

/**
 * The signed-in board member's org zone (BL-043), memoized per request,
 * for pages that have no association row of their own in hand. Pages that
 * already load the association (getPrimaryAssociation, getAccountingContext)
 * should use its `timeZone` instead of a second read.
 */
export const currentTimeZone = cache(async (): Promise<string> => {
  const org = await getCurrentOrg()
  if (!org) return DEFAULT_ASSOCIATION_TIME_ZONE
  return orgTimeZone(await getSupabaseServerClient(), org.id)
})

/**
 * For pages listing rows scoped to an association OR to the whole org
 * (recurring events, BL-065): a resolver from a row's association_id to its
 * zone, by the same rule the recurring-events cron uses. One read per
 * request. A failed read answers America/New_York (logged, code only), as
 * currentTimeZone does — a page shows a day, it never sends on one.
 */
export const currentScopeZones = cache(async (): Promise<(associationId: string | null | undefined) => string> => {
  const org = await getCurrentOrg()
  if (!org) return () => DEFAULT_ASSOCIATION_TIME_ZONE
  const loaded = await loadZoneIndex(await getSupabaseServerClient(), [org.id])
  if (!loaded.ok) console.error('[association-time] zone index read failed', { code: loaded.error.code })
  const index = loaded.ok ? loaded.index : buildZoneIndex([])
  return (associationId) => scopeTimeZone(index, org.id, associationId)
})
