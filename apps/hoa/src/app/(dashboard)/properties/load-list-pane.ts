import type { SupabaseClient } from '@supabase/supabase-js'
import { tryLoad } from '@/lib/load-or-fail'
import { listProperties } from '@/lib/properties/list'
import type { PropertyListParams } from '@/lib/properties/list-params'

/**
 * Everything /properties renders. One roster read (listProperties) drives
 * the page, the total, every chip count and the association's size, so
 * the counts describe the same search the table shows; the open-ARC and
 * last-activity signals are read alongside it. Any failure is reported as
 * unknown (null), never as 0.
 */
export async function loadPropertyListPane(supabase: SupabaseClient, orgId: string, params: PropertyListParams) {
  const list = await tryLoad('properties', () => listProperties(supabase, orgId, params))
  const counts = list.ok ? list.data.counts : null
  const allCount = list.ok ? list.data.allCount : null
  return { list, counts, allCount, searchMatches: params.search ? (counts?.all ?? null) : null }
}
