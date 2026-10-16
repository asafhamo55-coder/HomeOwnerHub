import { Building2 } from 'lucide-react'
import { LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { SplitPaneFrame, SplitPaneHeader, SplitPanePlaceholder } from '@/components/split-pane/SplitPane'
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
    <SplitPaneFrame>
      <SplitPaneHeader>
        <PropertiesHeader
          orgName={org.name}
          filter={params.filter}
          total={list.ok ? list.data.total : null}
          allCount={counts ? counts.all : null}
          search={params.search}
        />
      </SplitPaneHeader>

      <div className="flex min-h-0 flex-1">
        {/* Widens with the viewport, so the large screens that have room
            don't get a cramped, truncating list beside an empty panel. */}
        <aside
          aria-label="Property list"
          className="flex w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:w-[24rem] xl:w-[28rem] 2xl:w-[32rem]"
        >
          <PropertyListFilters params={params} counts={counts} />
          {/* Surfaced in the list pane rather than crashing the route, so
              the rest of the page stays usable. Never the raw message. */}
          {!list.ok ? (
            <LoadFailed what="properties" className="m-3" />
          ) : (
            <>
              <PropertyList rows={list.data.rows} params={params} noPropertiesYet={counts?.all === 0} />
              <PropertyListPager
                params={params}
                rowCount={list.data.rows.length}
                total={list.data.total}
              />
            </>
          )}
        </aside>

        <SplitPanePlaceholder
          icon={<Building2 aria-hidden />}
          title="Select a property"
          hint="Open a home to see its owner, residents, balance, violations and mail in one place."
        />
      </div>
    </SplitPaneFrame>
  )
}
