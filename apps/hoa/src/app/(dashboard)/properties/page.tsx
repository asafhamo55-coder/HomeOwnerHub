import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listProperties } from '@/lib/properties/list'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { PropertyList } from './PropertyList'
import { PropertyListFilters } from './PropertyListFilters'

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
  let counts = { attention: 0, all: 0 }
  let error: string | null = null
  try {
    const result = await listProperties(supabase, org.id, params)
    rows = result.rows
    total = result.total

    // Count-only queries (`head: true`) so no rows are transferred — these
    // drive the filter-chip counts, not the paginated list above.
    const [attentionCount, allCount] = await Promise.all([
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id)
        .lt('severity_rank' as never, 6),
      supabase
        .from(VIEW as never)
        .select('*', { count: 'exact', head: true })
        .eq('org_id' as never, org.id),
    ])
    counts = {
      attention: attentionCount.count ?? 0,
      all: allCount.count ?? 0,
    }
  } catch (e) {
    // Surfaced in the list pane rather than crashing the route, so the
    // rest of the page stays usable — the old page rendered a raw
    // error.message into a bare Card.
    error = e instanceof Error ? e.message : 'Could not load properties.'
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Properties</h1>
          <p className="text-xs text-muted">
            {total} {total === 1 ? 'home' : 'homes'} in {org.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            {/* Plain anchor — Link would prefetch the CSV. */}
            <a href="/properties/export">
              <Download className="h-4 w-4" />
              Export
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/properties/new">
              <Plus className="h-4 w-4" />
              Add property
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-xs">
          <PropertyListFilters params={params} counts={counts} />
          {error ? (
            <Alert variant="error" title="Could not load properties" className="m-3">
              {error}
            </Alert>
          ) : (
            <>
              <PropertyList rows={rows} params={params} />
              {total > params.limit ? (
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
                  <span>
                    Showing {params.offset + 1}–{Math.min(params.offset + rows.length, total)} of{' '}
                    {total}
                  </span>
                  <div className="flex gap-3">
                    {params.page > 1 ? (
                      <Link
                        href={`/properties?${new URLSearchParams({ filter: params.filter, sort: params.sort, ...(params.search ? { q: params.search } : {}), page: String(params.page - 1) })}`}
                        className="underline hover:text-foreground"
                      >
                        Previous
                      </Link>
                    ) : (
                      <span className="text-muted/50">Previous</span>
                    )}
                    {params.offset + rows.length < total ? (
                      <Link
                        href={`/properties?${new URLSearchParams({ filter: params.filter, sort: params.sort, ...(params.search ? { q: params.search } : {}), page: String(params.page + 1) })}`}
                        className="underline hover:text-foreground"
                      >
                        Next
                      </Link>
                    ) : (
                      <span className="text-muted/50">Next</span>
                    )}
                  </div>
                </div>
              ) : null}
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
