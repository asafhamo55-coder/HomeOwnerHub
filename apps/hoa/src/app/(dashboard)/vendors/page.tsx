import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { Briefcase, Download, Mail, Plus, Search } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { listVendorsResult, type VendorWithCompliance } from '@/lib/vendors'
import {
  COMPLIANCE_LABELS,
  COMPLIANCE_TONES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONES,
  complianceKey,
} from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { dateOnly, daysUntil, tradesLabel } from '@/components/vendors/format'

export const metadata = { title: 'Vendors' }
export const dynamic = 'force-dynamic'

export default async function VendorsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q: qParam } = await searchParams
  const rawSearch = (qParam ?? '').trim()
  const search = rawSearch.toLowerCase()

  const res = await timed('/vendors', 'vendors.list', () => listVendorsResult())
  const allVendors = res.ok ? res.data : []
  const vendors = search
    ? allVendors.filter((v) => {
        const hay = [v.legal_name, v.dba ?? '', v.primary_email ?? '', (v.trades ?? []).join(' ')]
          .join(' ')
          .toLowerCase()
        return hay.includes(search)
      })
    : allVendors

  const columns: DataTableColumn<VendorWithCompliance>[] = [
    {
      key: 'vendor',
      header: 'Vendor',
      mobilePrimary: true,
      cell: (v) => (
        <div className="min-w-0">
          <Link
            href={`/vendors/${v.id}`}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {v.legal_name}
          </Link>
          <p className="truncate text-xs text-muted">
            {[v.dba ? `d/b/a ${v.dba}` : null, tradesLabel(v.trades) ?? 'No trade on file']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (v) => (
        <div className="min-w-0 text-sm">
          <p className="truncate text-foreground-secondary">{v.primary_email ?? '—'}</p>
          {v.primary_phone ? <p className="text-xs text-muted">{v.primary_phone}</p> : null}
        </div>
      ),
    },
    {
      key: 'compliance',
      header: 'Compliance',
      cell: (v) => (
        <StatusBadge
          status={complianceKey(v.compliance?.status)}
          tones={COMPLIANCE_TONES}
          labels={COMPLIANCE_LABELS}
        />
      ),
    },
    {
      key: 'coi',
      header: 'COI expires',
      cell: (v) => <CoiExpiry date={v.compliance?.coi_expiration_date ?? null} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => (
        <StatusBadge status={v.status} tones={VENDOR_STATUS_TONES} labels={VENDOR_STATUS_LABELS} />
      ),
    },
  ]

  return (
    <Page
      title="Vendors"
      description="Your approved and prospective vendors, with insurance, W-9 and license status at a glance."
      meta={res.ok ? <span className="num text-sm text-muted">{allVendors.length} on file</span> : null}
      actions={
        <>
          <Button asChild variant="ghost" icon={<Download aria-hidden />}>
            <a href={`/vendors/export${search ? `?q=${encodeURIComponent(search)}` : ''}`}>Export CSV</a>
          </Button>
          <Button asChild variant="secondary" icon={<Mail aria-hidden />}>
            <Link href="/vendors/invitations">Invite</Link>
          </Button>
          <Button asChild icon={<Plus aria-hidden />}>
            <Link href="/vendors/new">Add vendor</Link>
          </Button>
        </>
      }
      tabs={<VendorTabs current="/vendors" />}
    >
      {!res.ok ? (
        <LoadFailed what="your vendors" retryHref="/vendors" />
      ) : allVendors.length === 0 ? (
        <EmptyState
          icon={<Briefcase aria-hidden />}
          title="No vendors yet"
          description="Add your first vendor. Once their COI, W-9 and license are entered, the compliance check grades them against your association’s standards."
          action={
            <Button asChild icon={<Plus aria-hidden />}>
              <Link href="/vendors/new">Add vendor</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/vendors/invitations">Or invite a vendor to fill in their own details</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <form action="/vendors" method="get" role="search" className="flex w-full min-w-0 max-w-md items-center gap-2">
            <Input
              type="search"
              name="q"
              defaultValue={rawSearch}
              placeholder="Search name, email or trade"
              aria-label="Search vendors"
              prefix={<Search aria-hidden />}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {search ? (
              <Button asChild variant="ghost">
                <Link href="/vendors">Clear</Link>
              </Button>
            ) : null}
          </form>

          <DataTable
            caption="Vendors"
            columns={columns}
            rows={vendors}
            rowKey={(v) => v.id}
            mobile="cards"
            empty={
              <EmptyState
                variant="compact"
                icon={<Search aria-hidden />}
                title={`No vendors match “${rawSearch}”`}
                description="Try a shorter or different term."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/vendors">Clear search</Link>
                  </Button>
                }
              />
            }
          />
        </div>
      )}
    </Page>
  )
}

/** COI expiry with an urgency pill when it is close or past. */
function CoiExpiry({ date }: { date: string | null }) {
  if (!date) return <span className="text-sm text-muted">—</span>
  const days = daysUntil(date)
  const label = dateOnly(date)
  if (days != null && days < 0) {
    return <StatusBadge status="expired" tones={{ expired: 'danger' }} labels={{ expired: `Expired ${label}` }} />
  }
  if (days != null && days <= 30) {
    return (
      <span className="inline-flex flex-col">
        <span className="num text-sm text-foreground">{label}</span>
        <span className="text-xs font-medium text-warning">
          {days === 0 ? 'Expires today' : `In ${days} ${days === 1 ? 'day' : 'days'}`}
        </span>
      </span>
    )
  }
  return <span className="num text-sm text-foreground-secondary">{label}</span>
}
