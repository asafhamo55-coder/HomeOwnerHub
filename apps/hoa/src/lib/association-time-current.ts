import { cache } from 'react'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'

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
