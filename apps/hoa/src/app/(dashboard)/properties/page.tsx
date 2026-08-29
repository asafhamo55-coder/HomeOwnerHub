import { Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listProperties } from '@/lib/properties/list'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { PropertyList } from './PropertyList'
import { PropertyListFilters } from './PropertyListFilters'
import { PropertyListPager } from './PropertyListPager'
import { PropertiesHeader } from './PropertiesHeader'

export const metadata = { title: 'Properties' }
export const dynamic = 'force-dynamic'

// The view is new in 0039 and is not in the generated Database types until
// the next `supabase gen types` pass — same reasoning as list.ts, which
// this mirrors for the count-only queries below.
const VIEW = 'hoa_property_list_v'

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; q?: string; page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return null

  const params = parsePropertyListParams(await searchParams)
  const supabase = await getSupabaseServerClient()

  let rows: Awaited<ReturnType<typeof listProperties>>['rows'] = []
  let total = 0
  let counts = { attention: 0, incomplete: 0, all: 0, waiting: 0 }
  let error: string | null = null
  try {
    const result = await listProperties(supabase, org.id, params)
    rows = result.rows
    total = result.total

    // Count-only queries (`head: true`) so no rows are transferred — these
    // drive the filter-chip counts, not the paginated list above.
    // `needs_attention` rather than `severity_rank < 6` — see list.ts. The
    // old predicate counted missing-data rows as work, which put "131
    // needing attention" beside 184 homes and made the number meaningless.
    const [attentionCount, incompleteCount, allCount, waitingCount] = await Promise.all([
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id)
        .eq('needs_attention' as never, true),
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id)
        .eq('is_incomplete' as never, true),
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id),
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id)
        .eq('on_waiting_list' as never, true),
    ])
    counts = {
      attention: attentionCount.count ?? 0,
      incomplete: incompleteCount.count ?? 0,
      all: allCount.count ?? 0,
      waiting: waitingCount.count ?? 0,
    }
  } catch (e) {
    // Surfaced in the list pane rather than crashing the route, so the
    // rest of the page stays usable — the old page rendered a raw
    // error.message into a bare Card.
    error = e instanceof Error ? e.message : 'Could not load properties.'
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <PropertiesHeader
        orgName={org.name}
        filter={params.filter}
        total={total}
        allCount={counts.all}
        search={params.search}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Widens with the viewport. This was `xl:max-w-xs`, which SHRANK the
            list to 320px on exactly the large screens that have room to
            spare — leaving ~1050px of empty panel beside a cramped,
            truncating list. */}
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-md 2xl:max-w-lg">
          <PropertyListFilters params={params} counts={counts} />
          {error ? (
            <Alert variant="error" title="Could not load properties" className="m-3">
              {error}
            </Alert>
          ) : (
            <>
              <PropertyList rows={rows} params={params} />
              <PropertyListPager params={params} rowCount={rows.length} total={total} />
            </>
          )}
        </aside>

        <section className="hidden flex-1 items-center justify-center text-sm text-muted lg:flex">
          Select a property
        </section>
      </div>
    </main>
  )
}
