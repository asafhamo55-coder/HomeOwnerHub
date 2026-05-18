import Link from 'next/link'
import { Building2, Download, Plus, Search, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, EmptyState, Input } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Properties' }

type Tenure = 'owner_occupied' | 'leased' | 'unknown'

interface PropertyRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  tenure: Tenure | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const TENURE_LABEL: Record<Tenure, string> = {
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
  unknown: 'Unknown',
}

const TENURE_VARIANT: Record<Tenure, 'success' | 'warning' | 'neutral'> = {
  owner_occupied: 'success',
  leased: 'warning',
  unknown: 'neutral',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const TENURE_FILTERS: Array<{ key: 'all' | Tenure; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'owner_occupied', label: 'Owner-occupied' },
  { key: 'leased', label: 'Leased' },
  { key: 'unknown', label: 'Unknown' },
]

export default async function PropertiesListPage({
  searchParams,
}: {
  searchParams: Promise<{ tenure?: string; q?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return null

  const { tenure: tenureParam, q: qParam } = await searchParams
  const activeTenure: 'all' | Tenure =
    tenureParam === 'owner_occupied' || tenureParam === 'leased' || tenureParam === 'unknown'
      ? tenureParam
      : 'all'
  const search = (qParam ?? '').trim()

  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('hoa_properties')
    .select(
      'id, address, unit_number, owner_name, owner_email, owner_phone, tenure, notes, created_at, updated_at',
    )
    .order('address', { ascending: true })
  if (activeTenure !== 'all') {
    // `tenure` was added in migration 0017; DB types are stale until the
    // next gen pass. Cast to `never` keeps tsc happy without changing
    // behavior.
    query = query.eq('tenure' as never, activeTenure)
  }
  if (search.length > 0) {
    // Escape `,` and `)` which PostgREST treats as `.or` separators —
    // unlikely in real addresses but cheap to guard. Match on address,
    // unit_number, owner_name, or owner_email.
    const safe = search.replace(/[,()]/g, ' ')
    query = query.or(
      `address.ilike.%${safe}%,unit_number.ilike.%${safe}%,owner_name.ilike.%${safe}%,owner_email.ilike.%${safe}%`,
    )
  }
  const { data, error } = await query

  const properties = (data ?? []) as unknown as PropertyRow[]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Properties</h1>
          <p className="text-sm text-muted">
            {properties.length} {properties.length === 1 ? 'home' : 'homes'}
            {activeTenure !== 'all' ? ` · ${TENURE_LABEL[activeTenure]}` : ''}
            {search ? ` · matching “${search}”` : ''} in {org.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            {/* Plain anchor — Next Link would prefetch the CSV. We want a
                straight GET request that triggers the browser download. */}
            <a
              href={`/properties/export${
                activeTenure !== 'all' || search
                  ? `?${new URLSearchParams({
                      ...(activeTenure !== 'all' ? { tenure: activeTenure } : {}),
                      ...(search ? { q: search } : {}),
                    }).toString()}`
                  : ''
              }`}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/properties/new">
              <Plus className="h-4 w-4" />
              Add property
            </Link>
          </Button>
        </div>
      </header>

      {/* Search + tenure filters. Server-form GET to /properties preserves
          the tenure filter via a hidden input. */}
      <div className="flex flex-wrap items-end gap-3">
        <form action="/properties" method="get" className="flex flex-1 items-center gap-2 sm:max-w-md">
          {activeTenure !== 'all' ? (
            <input type="hidden" name="tenure" value={activeTenure} />
          ) : null}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search address, unit, owner, or email"
              className="pl-9"
              aria-label="Search properties"
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
          {search ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={activeTenure === 'all' ? '/properties' : `/properties?tenure=${activeTenure}`}>
                <X className="h-3.5 w-3.5" />
                Clear
              </Link>
            </Button>
          ) : null}
        </form>
      </div>

      {/* Tenure filter chips — server-side URL-driven so it survives reloads + share. */}
      <nav aria-label="Filter by tenure" className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">Tenure</span>
        {TENURE_FILTERS.map((f) => {
          const active = activeTenure === f.key
          const params = new URLSearchParams()
          if (f.key !== 'all') params.set('tenure', f.key)
          if (search) params.set('q', search)
          const qs = params.toString()
          const href = qs ? `/properties?${qs}` : '/properties'
          return (
            <Link
              key={f.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </nav>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : properties.length === 0 ? (
        search ? (
          <EmptyState
            icon={<Search className="h-10 w-10" aria-hidden />}
            title={`No properties match “${search}”`}
            description="Try a shorter or different search term, or clear the filter."
            action={
              <Button asChild variant="outline">
                <Link href={activeTenure === 'all' ? '/properties' : `/properties?tenure=${activeTenure}`}>
                  Clear search
                </Link>
              </Button>
            }
          />
        ) : activeTenure !== 'all' ? (
          <EmptyState
            icon={<Building2 className="h-10 w-10" aria-hidden />}
            title={`No ${TENURE_LABEL[activeTenure].toLowerCase()} properties`}
            description="Adjust the tenure filter to see other properties."
            action={
              <Button asChild variant="outline">
                <Link href="/properties">Show all</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Building2 className="h-10 w-10" aria-hidden />}
            title="No properties yet"
            description="Add your first home to start tracking violations, dues, and meetings."
            action={
              <Button asChild>
                <Link href="/properties/new">
                  <Plus className="h-4 w-4" />
                  Add property
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Unit</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Owner</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Email</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Phone</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Tenure</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">Notes</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">Added</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => {
                  const tenure: Tenure = p.tenure ?? 'unknown'
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-background/50"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/properties/${p.id}`} className="font-medium text-foreground hover:text-primary">
                          {p.address}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-muted sm:table-cell">
                        {p.unit_number ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">
                        {p.owner_name ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 text-muted lg:table-cell">
                        {p.owner_email ? (
                          <a href={`mailto:${p.owner_email}`} className="hover:text-primary">
                            {p.owner_email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted lg:table-cell">
                        {p.owner_phone ? (
                          <a href={`tel:${p.owner_phone}`} className="hover:text-primary">
                            {p.owner_phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <Badge variant={TENURE_VARIANT[tenure]} size="sm">
                          {TENURE_LABEL[tenure]}
                        </Badge>
                      </td>
                      <td className="hidden max-w-xs px-4 py-3 text-muted xl:table-cell">
                        <span className="line-clamp-2" title={p.notes ?? undefined}>
                          {p.notes ?? '—'}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-muted xl:table-cell">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-muted xl:table-cell">
                        {formatDate(p.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
