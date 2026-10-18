import { Alert, LoadFailed, NoOrgSelected, Page } from '@homeowner-portal/ui'
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

// A full-width table (cards on phones). It used to be a 448px list beside
// an always-empty "Select a property" panel; opening a home is now a page
// of its own (/properties/[id]), whose back link returns to this exact
// view (filter, sort, search and page ride along in the URL).
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; dir?: string; q?: string; page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const params = parsePropertyListParams(await searchParams)
  const supabase = await getSupabaseServerClient()

  const { list, counts, allCount, searchMatches } = await loadPropertyListPane(supabase, org.id, params)

  return (
    <Page
      width="wide"
      className="max-w-none"
      header={
        <PropertiesHeader
          orgName={org.name}
          filter={params.filter}
          total={list.ok ? list.data.total : null}
          allCount={allCount}
          search={params.search}
          searchMatches={searchMatches}
        />
      }
    >
      <PropertyListFilters params={params} counts={counts} />
      {/* Surfaced in place rather than crashing the route. Never the raw message. */}
      {!list.ok ? (
        <LoadFailed what="properties" />
      ) : (
        <>
          {!list.data.signalsOk ? (
            <Alert variant="warning" title="Open ARC and last activity couldn’t load">
              Those two columns show “—”. Balances, violations and everything else are current.
            </Alert>
          ) : null}
          <PropertyList
            rows={list.data.rows}
            params={params}
            noPropertiesYet={allCount === 0}
            allMatches={counts?.all ?? null}
            signalsOk={list.data.signalsOk}
            footer={<PropertyListPager params={params} rowCount={list.data.rows.length} total={list.data.total} />}
          />
        </>
      )}
    </Page>
  )
}
