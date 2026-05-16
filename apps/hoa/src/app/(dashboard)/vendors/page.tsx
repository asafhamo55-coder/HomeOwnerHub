import Link from 'next/link'
import { Briefcase, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeowner-portal/ui'
import { listVendors, type ComplianceStatus } from '@/lib/vendors'

export const metadata = { title: 'Vendors' }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  prospect: 'outline',
  active: 'success',
  inactive: 'outline',
  blacklisted: 'destructive',
}

const COMPLIANCE_VARIANT: Record<ComplianceStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
  missing: 'outline',
}

const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  green: 'Compliant',
  yellow: 'Action soon',
  red: 'Non-compliant',
  missing: 'Docs missing',
}

export default async function VendorsListPage() {
  const vendors = await listVendors()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Vendors</h1>
          <p className="text-sm text-muted-fg">
            {vendors.length} on file. Compliance status reflects each vendor's
            current COI, W-9, and license against your association's requirements.
          </p>
        </div>
        <Button asChild>
          <Link href="/vendors/new">
            <Plus className="h-4 w-4" />
            Add vendor
          </Link>
        </Button>
      </header>

      {vendors.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-10 w-10" aria-hidden />}
          title="No vendors yet"
          description="Add your first vendor. Once you enter their COI, W-9, and license, the Vendor Onboarder workflow grades them against your standards."
          action={
            <Button asChild>
              <Link href="/vendors/new">
                <Plus className="h-4 w-4" />
                Add first vendor
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {vendors.map((v) => {
              const compliance = v.compliance?.status
              return (
                <li key={v.id}>
                  <Link
                    href={`/vendors/${v.id}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-muted">
                        {v.legal_name}
                        {v.dba ? (
                          <span className="ml-2 text-xs font-normal text-muted-fg">
                            d/b/a {v.dba}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-fg">
                        {(v.trades ?? []).join(', ') || 'No trades on file'}
                        {v.primary_email ? ` · ${v.primary_email}` : ''}
                      </p>
                      {v.compliance?.last_reviewed_at ? (
                        <p className="mt-0.5 text-xs text-muted-fg">
                          Last reviewed{' '}
                          {format(new Date(v.compliance.last_reviewed_at), 'PP')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {compliance ? (
                        <Badge variant={COMPLIANCE_VARIANT[compliance]} size="sm">
                          {COMPLIANCE_LABEL[compliance]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" size="sm">
                          No review
                        </Badge>
                      )}
                      <Badge variant={STATUS_VARIANT[v.status] ?? 'outline'} size="sm">
                        {v.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
