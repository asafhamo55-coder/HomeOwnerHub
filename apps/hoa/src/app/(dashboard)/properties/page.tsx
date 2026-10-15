import { LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
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

// Split-pane list/detail layout, deliberately NOT wrapped in <Page>: it is
// full-height with its own scrolling panes, which a fixed-width container
// would break. It adopts the shared Pager and LoadFailed instead (see the
// decision log in docs/specs/2026-10-15-enterprise-ux-plan.md).
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; q?: string; page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const params = parsePropertyListParams(await searchParams)
  const supabase = await getSupabaseServerClient()

  const countQuery = () =>
    supabase
      .from(VIEW as never)
      .select('*', { count: 'exact', head: true })
      .eq('org_id' as never, org.id)

  // Count-only queries (`head: true`) so no rows are transferred — these
  // drive the filter-chip counts, not the paginated list.
  // `needs_attention` rather than `severity_rank < 6` — see list.ts. The
  // old predicate counted missing-data rows as work, which put "131
  // needing attention" beside 184 homes and made the number meaningless.
  const [list, attentionCount, incompleteCount, allCount, waitingCount] = await Promise.all([
    tryLoad('properties', () => listProperties(supabase, org.id, params)),
    loadOrFail('property attention count', countQuery().eq('needs_attention' as never, true)),
    loadOrFail('property incomplete count', countQuery().eq('is_incomplete' as never, true)),
    loadOrFail('property count', countQuery()),
    loadOrFail('property waiting-list count', countQuery().eq('on_waiting_list' as never, true)),
  ])

  // A failed count used to read as 0 ("0 homes"). Unknown is shown as
  // unknown: the chips drop their numbers and the header says so.
  const counts =
    attentionCount.ok && incompleteCount.ok && allCount.ok && waitingCount.ok
      ? {
          attention: attentionCount.count ?? 0,
          incomplete: incompleteCount.count ?? 0,
          all: allCount.count ?? 0,
          waiting: waitingCount.count ?? 0,
        }
      : null

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <PropertiesHeader
        orgName={org.name}
        filter={params.filter}
        total={list.ok ? list.data.total : null}
        allCount={counts ? counts.all : null}
        search={params.search}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Widens with the viewport. This was `xl:max-w-xs`, which SHRANK the
            list to 320px on exactly the large screens that have room to
            spare — leaving ~1050px of empty panel beside a cramped,
            truncating list. */}
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-md 2xl:max-w-lg">
          <PropertyListFilters params={params} counts={counts} />
          {/* Surfaced in the list pane rather than crashing the route, so
              the rest of the page stays usable. Never the raw message —
              this pane used to print error.message verbatim. */}
          {!list.ok ? (
            <LoadFailed what="properties" className="m-3" />
          ) : (
            <>
              <PropertyList rows={list.data.rows} params={params} />
              <PropertyListPager
                params={params}
                rowCount={list.data.rows.length}
                total={list.data.total}
              />
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
