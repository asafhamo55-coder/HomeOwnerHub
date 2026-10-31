import Link from 'next/link'
import { FileSpreadsheet, Plus, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  LoadFailed,
  NoOrgSelected,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { listBidCountsByRfpResult, listRfpsResult, type RfpRow } from '@/lib/rfps'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { SummaryStrip } from '@/components/SummaryStrip'
import {
  dueChipLabel,
  isClosingSoon,
  matchesRfpsFilter,
  parseRfpsFilter,
  summarizeRfps,
  type RfpsFilter,
} from '@/lib/rfps-list'
import { RFP_STATUS_LABELS, RFP_STATUS_TONES } from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { formatBudget, shortDate } from '@/components/vendors/format'

export const metadata = { title: 'RFPs' }
export const dynamic = 'force-dynamic'

/** Bid counts by RFP id; null when the read failed (never shown as 0). */
function rfpColumns(bidCounts: Record<string, number> | null, timeZone: string): DataTableColumn<RfpRow>[] {
  return [
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
    cell: (r) => {
      const chip = dueChipLabel(r, timeZone)
      return (
        <div className="space-y-1">
          <span className="num">{shortDate(r.submission_deadline)}</span>
          {chip ? (
            <div>
              <Badge variant={isClosingSoon(r, timeZone) ? 'warning' : 'neutral'} size="sm">
                {chip}
              </Badge>
            </div>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'bids',
    header: 'Bids',
    cell: (r) =>
      bidCounts ? (
        <span className="num">{bidCounts[r.id] ?? 0}</span>
      ) : (
        <span className="text-muted">Not available</span>
      ),
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
}

function filterHref(filter: RfpsFilter): string {
  return filter === 'all' ? '/rfps' : `/rfps?status=${filter}`
}

export default async function RfpsListPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />
  const filter = parseRfpsFilter((await searchParams).status)
  const supabase = await getSupabaseServerClient()
  const [result, bidsResult, timeZone] = await Promise.all([
    listRfpsResult(),
    listBidCountsByRfpResult(org.id),
    orgTimeZone(supabase, org.id),
  ])
  const all = result.ok ? result.data : []
  const summary = result.ok ? summarizeRfps(all, timeZone) : null
  const rows = all.filter((r) => matchesRfpsFilter(r, filter, timeZone))
  const columns = rfpColumns(bidsResult.ok ? bidsResult.data : null, timeZone)

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
        <>
          <SummaryStrip
            ariaLabel="RFPs summary"
            testId="rfps-summary"
            tiles={[
              { label: 'Draft', value: String(summary?.draft ?? 0), hint: 'Not yet sent to vendors', href: filterHref('draft') },
              { label: 'Open', value: String(summary?.open ?? 0), hint: 'Taking bids', href: filterHref('open') },
              {
                label: 'Closing within 7 days',
                value: String(summary?.closing ?? 0),
                hint: 'Open, bids due soon',
                href: filterHref('closing'),
                tone: summary && summary.closing > 0 ? 'warning' : 'default',
              },
              { label: 'Awarded', value: String(summary?.awarded ?? 0), hint: 'A vendor was chosen', href: filterHref('awarded') },
            ]}
          />
          <ListToolbar>
            <FilterChips
              label="Filter RFPs"
              linkAs={Link}
              items={[
                { label: 'All', href: filterHref('all'), active: filter === 'all', count: all.length },
                { label: 'Draft', href: filterHref('draft'), active: filter === 'draft', count: summary?.draft },
                { label: 'Open', href: filterHref('open'), active: filter === 'open', count: summary?.open },
                { label: 'Closing soon', href: filterHref('closing'), active: filter === 'closing', count: summary?.closing },
                { label: 'Awarded', href: filterHref('awarded'), active: filter === 'awarded', count: summary?.awarded },
              ]}
            />
          </ListToolbar>
          {!bidsResult.ok ? (
            <LoadFailed
              what="bid counts"
              hint="The RFPs below are correct; only their bid counts are missing."
            />
          ) : null}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          mobile="cards"
          linkAs={Link}
          caption="Requests for proposal"
          empty={<EmptyState variant="compact" icon={<FileSpreadsheet aria-hidden />} title="No RFPs match this filter" />}
        />
        </>
      )}
    </Page>
  )
}
