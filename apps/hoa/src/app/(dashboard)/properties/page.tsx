import { Building2 } from 'lucide-react'
import { LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { SplitPaneFrame, SplitPaneHeader, SplitPanePlaceholder } from '@/components/split-pane/SplitPane'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { PropertyList } from './PropertyList'
import { PropertyListFilters } from './PropertyListFilters'
import { PropertyListPager } from './PropertyListPager'
import { PropertiesHeader } from './PropertiesHeader'
import { loadPropertyListPane } from './load-list-pane'

export const metadata = { title: 'Properties' }
export const dynamic = 'force-dynamic'

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

  const { list, counts, allCount, searchMatches } = await loadPropertyListPane(supabase, org.id, params)

  return (
    <SplitPaneFrame>
      <SplitPaneHeader>
        <PropertiesHeader
          orgName={org.name}
          filter={params.filter}
          total={list.ok ? list.data.total : null}
          allCount={allCount}
          search={params.search}
          searchMatches={searchMatches}
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
              <PropertyList
                rows={list.data.rows}
                params={params}
                noPropertiesYet={allCount === 0}
                allMatches={counts?.all ?? null}
              />
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
