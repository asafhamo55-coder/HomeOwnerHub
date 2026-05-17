import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { Button, Card, CardContent, EmptyState } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Properties' }

interface PropertyRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
}

export default async function PropertiesListPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('hoa_properties')
    .select('id, address, unit_number, owner_name, owner_email')
    .order('address', { ascending: true })

  const properties = (data ?? []) as PropertyRow[]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Properties</h1>
          <p className="text-sm text-muted">
            {properties.length} {properties.length === 1 ? 'home' : 'homes'} in {org.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/properties/new">
            <Plus className="h-4 w-4" />
            Add property
          </Link>
        </Button>
      </header>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : properties.length === 0 ? (
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
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Unit</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Owner</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Email</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
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
                    <td className="hidden px-4 py-3 text-muted md:table-cell">
                      {p.owner_email ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
