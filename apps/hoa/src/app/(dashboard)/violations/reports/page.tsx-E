import Link from 'next/link'
import { Megaphone, SearchX } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  Tabs,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  countViolationReportsByStatus,
  listResidentViolationReportsForBoard,
  type ViolationReportBoardRow,
  type ViolationReportStatus,
} from '@/lib/board-review'
import { VIOLATION_REPORT_CATEGORY, VIOLATION_REPORT_STATUS } from '@/lib/status/community'
import { violationTabs } from '../tabs'
import { formatMonthDayTime, formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Resident violation reports' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const FILTERS = {
  pending: { label: 'Needs decision', statuses: ['submitted', 'under_review'] },
  opened: { label: 'Opened as violation', statuses: ['opened_as_violation'] },
  closed: { label: 'Closed', statuses: ['closed_no_action', 'dismissed'] },
  all: { label: 'All', statuses: null },
} as const satisfies Record<string, { label: string; statuses: readonly ViolationReportStatus[] | null }>
type Filter = keyof typeof FILTERS

export default async function ViolationReportsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const sp = await searchParams
  const filter: Filter = sp.status && sp.status in FILTERS ? (sp.status as Filter) : 'pending'
  const page = parsePageParam(sp.page)
  const { from, to } = pageRange(page, PAGE_SIZE)

  const [list, counts] = await Promise.all([
    listResidentViolationReportsForBoard({ status: FILTERS[filter].statuses ?? undefined, from, to }),
    countViolationReportsByStatus(),
  ])

  const countFor = (key: Filter): number | null => {
    if (!counts) return null
    const set = FILTERS[key].statuses as readonly string[] | null
    return set
      ? set.reduce((n, s) => n + (counts[s] ?? 0), 0)
      : Object.values(counts).reduce((a, b) => a + b, 0)
  }
  const all = countFor('all')

  const href = (f: Filter, p = 1) => {
    const q = new URLSearchParams()
    if (f !== 'pending') q.set('status', f)
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return qs ? `/violations/reports?${qs}` : '/violations/reports'
  }

  const columns: DataTableColumn<ViolationReportBoardRow>[] = [
    {
      key: 'about',
      header: 'Concern',
      mobilePrimary: true,
      className: 'min-w-[14rem]',
      cell: (r) => (
        <div className="min-w-0">
          <Link
            href={`/violations/reports/${r.id}`}
            className="font-medium text-foreground no-underline hover:text-primary hover:underline"
          >
            {r.about_address ?? 'No address given'}
          </Link>
          {r.occurred_at ? (
            <p className="mt-0.5 text-xs text-muted">
              Occurred {formatMonthDayTime(r.occurred_at)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => <Badge variant="neutral">{VIOLATION_REPORT_CATEGORY[r.category] ?? r.category}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusBadge status={r.status} tones={VIOLATION_REPORT_STATUS.tones} labels={VIOLATION_REPORT_STATUS.labels} />
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (r) => (
        <time dateTime={r.submitted_at} className="whitespace-nowrap text-foreground-secondary">
          {formatShortDate(r.submitted_at)}
        </time>
      ),
    },
  ]

  return (
    <Page
      title="Violations"
      width="wide"
      description="Concerns residents submitted from their portal. You see who reported. Residents were told their identity is kept confidential where possible, so don't share it with other residents."
      linkAs={Link}
      tabs={<Tabs items={violationTabs('/violations/reports')} aria-label="Violation sections" linkAs={Link} />}
    >
      <ListToolbar>
        <FilterChips
          label="Filter by status"
          linkAs={Link}
          items={(Object.keys(FILTERS) as Filter[]).map((key) => ({
            label: FILTERS[key].label,
            href: href(key),
            active: key === filter,
            count: countFor(key),
          }))}
        />
      </ListToolbar>

      {!list.ok ? (
        <LoadFailed what="resident reports" />
      ) : (
        <DataTable
          caption="Resident violation reports"
          columns={columns}
          rows={list.rows}
          rowKey={(r) => r.id}
          mobile="cards"
          empty={
            all === 0 ? (
              <EmptyState
                variant="compact"
                icon={<Megaphone aria-hidden />}
                title="No reports yet"
                description="When a resident submits a concern from their portal, it lands here for board review."
              />
            ) : (
              <EmptyState
                variant="compact"
                icon={filter === 'pending' ? <Megaphone aria-hidden /> : <SearchX aria-hidden />}
                title={filter === 'pending' ? 'All caught up' : `No reports in “${FILTERS[filter].label}”`}
                description={filter === 'pending' ? 'Every report has a decision.' : 'Try another status.'}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href={href('all')}>Show all reports</Link>
                  </Button>
                }
              />
            )
          }
          footer={
            list.total > PAGE_SIZE || page > 1 ? (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={list.total}
                rowCount={list.rows.length}
                hrefFor={(p) => href(filter, p)}
                linkAs={Link}
                noun="reports"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}
