import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { listProperties } from '@/lib/properties/list'
import type { PropertyListParams } from '@/lib/properties/list-params'

// Cast: the view postdates the last `supabase gen types` pass (see list.ts).
const VIEW = 'hoa_property_list_v'

/**
 * The list pane both /properties and /properties/[id] render. One read
 * (listProperties) drives the page, the total and every chip count, so the
 * counts describe the same search the list shows. The association's size
 * needs its own head-only count only when a search narrowed that read.
 * Any failure is reported as unknown (null), never as 0.
 */
export async function loadPropertyListPane(supabase: SupabaseClient, orgId: string, params: PropertyListParams) {
  const [list, homeCount] = await Promise.all([
    tryLoad('properties', () => listProperties(supabase, orgId, params)),
    params.search
      ? loadOrFail(
          'property count',
          supabase.from(VIEW as never).select('id', { count: 'exact', head: true }).eq('org_id' as never, orgId),
        )
      : Promise.resolve(null),
  ])
  const counts = list.ok ? list.data.counts : null
  const allCount = params.search ? (homeCount?.ok ? (homeCount.count ?? 0) : null) : (counts?.all ?? null)
  return { list, counts, allCount, searchMatches: params.search ? (counts?.all ?? null) : null }
}
