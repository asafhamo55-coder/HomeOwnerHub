import Link from 'next/link'
import { FileSpreadsheet, Plus, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { listRfpsResult, type RfpRow } from '@/lib/rfps'
import { RFP_STATUS_LABELS, RFP_STATUS_TONES } from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { formatBudget, shortDate } from '@/components/vendors/format'

export const metadata = { title: 'RFPs' }

const columns: DataTableColumn<RfpRow>[] = [
  {
    key: 'title',
    header: 'RFP',
    mobilePrimary: true,
    cell: (r) => (
      <div className="min-w-0">
        <Link href={`/rfps/${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
          {r.title}
        </Link>
        <p className="num flex items-center gap-2 text-xs text-muted">
          {r.rfp_number}
          {r.ai_generated ? (
            <Badge variant="ai" size="sm" icon={<Sparkles aria-hidden />}>
              AI draft
            </Badge>
          ) : null}
        </p>
      </div>
    ),
  },
  {
    key: 'deadline',
    header: 'Bids due',
    cell: (r) => <span className="num">{shortDate(r.submission_deadline)}</span>,
  },
  {
    key: 'budget',
    header: 'Budget',
    hideBelowLg: true,
    cell: (r) => <span className="num">{formatBudget(r.budget_min, r.budget_max) ?? '—'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <StatusBadge status={r.status} tones={RFP_STATUS_TONES} labels={RFP_STATUS_LABELS} />,
  },
]

export default async function RfpsListPage() {
  const result = await listRfpsResult()

  return (
    <Page
      title="Vendors"
      description="Requests for proposal: describe the need, edit the drafted RFP, invite vendors and compare their bids."
      actions={
        <Button asChild icon={<Plus aria-hidden />}>
          <Link href="/rfps/new">New RFP</Link>
        </Button>
      }
      tabs={<VendorTabs current="/rfps" />}
      linkAs={Link}
    >
      {!result.ok ? (
        <LoadFailed what="RFPs" retryHref="/rfps" />
      ) : result.data.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet aria-hidden />}
          title="No RFPs yet"
          description="Describe what your association needs. The composer drafts a scoped RFP you can edit and send to vendors."
          action={
            <Button asChild icon={<Plus aria-hidden />}>
              <Link href="/rfps/new">Draft your first RFP</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={result.data}
          rowKey={(r) => r.id}
          mobile="cards"
          linkAs={Link}
          caption="Requests for proposal"
        />
      )}
    </Page>
  )
}
