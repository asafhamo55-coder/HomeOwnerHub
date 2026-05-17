import Link from 'next/link'
import { Briefcase, Mail, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Button, Card, EmptyState, StatusBadge, Tabs } from '@homeowner-portal/ui'
import { listVendors, type ComplianceStatus } from '@/lib/vendors'

export const metadata = { title: 'Vendors' }

const VENDOR_TABS = [
  { label: 'Active', href: '/vendors' },
  { label: 'Invitations', href: '/vendors/invitations' },
  { label: 'Approval queue', href: '/vendors/approval-queue' },
  { label: 'RFPs', href: '/rfps' },
]

const VENDOR_STATUS_TONES = {
  prospect: 'neutral',
  active: 'success',
  inactive: 'neutral',
  blacklisted: 'destructive',
} as const

const VENDOR_STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blacklisted',
}

const COMPLIANCE_TONES: Record<ComplianceStatus, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
  missing: 'neutral',
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
          <h1>Vendors</h1>
          <p className="text-sm text-muted">
            {vendors.length} on file. The badge shows whether insurance, W-9,
            and license are up to date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/vendors/invitations">
              <Mail className="h-4 w-4" />
              Invite a vendor
            </Link>
          </Button>
          <Button asChild>
            <Link href="/vendors/new">
              <Plus className="h-4 w-4" />
              Add vendor
            </Link>
          </Button>
        </div>
      </header>

      <Tabs items={VENDOR_TABS} currentPath="/vendors" aria-label="Vendor sections" />

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
                      <p className="truncate font-medium text-foreground">
                        {v.legal_name}
                        {v.dba ? (
                          <span className="ml-2 text-xs font-normal text-muted">
                            d/b/a {v.dba}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted">
                        {(v.trades ?? []).join(', ') || 'No trades on file'}
                        {v.primary_email ? ` · ${v.primary_email}` : ''}
                      </p>
                      {v.compliance?.last_reviewed_at ? (
                        <p className="mt-0.5 text-xs text-muted">
                          Last reviewed{' '}
                          {format(new Date(v.compliance.last_reviewed_at), 'PP')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {compliance ? (
                        <StatusBadge
                          status={compliance}
                          tones={COMPLIANCE_TONES}
                          labels={COMPLIANCE_LABEL}
                        />
                      ) : (
                        <StatusBadge
                          status="missing"
                          tones={COMPLIANCE_TONES}
                          labels={{ missing: 'No review' }}
                        />
                      )}
                      <StatusBadge
                        status={v.status}
                        tones={VENDOR_STATUS_TONES}
                        labels={VENDOR_STATUS_LABELS}
                      />
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
