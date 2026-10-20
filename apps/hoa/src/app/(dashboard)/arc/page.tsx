import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { ClipboardList, SearchX } from 'lucide-react'
import { format } from 'date-fns'
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
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  countArcRequestsByStatus,
  listArcRequestsForBoard,
  type ArcRequestBoardRow,
  type ArcStatus,
} from '@/lib/board-review'
import { ARC_CATEGORY, ARC_STATUS } from '@/lib/status/community'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

export const metadata = { title: 'ARC review' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/** Default view is the work queue: what still needs a board decision. */
const FILTERS = {
  pending: { label: 'Needs decision', statuses: ['submitted', 'in_review'] },
  approved: { label: 'Approved', statuses: ['approved'] },
  denied: { label: 'Denied', statuses: ['denied'] },
  withdrawn: { label: 'Withdrawn', statuses: ['withdrawn'] },
  all: { label: 'All', statuses: null },
} as const satisfies Record<string, { label: string; statuses: readonly ArcStatus[] | null }>
type Filter = keyof typeof FILTERS

export default async function ArcReviewListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const sp = await searchParams
  const filter: Filter = sp.status && sp.status in FILTERS ? (sp.status as Filter) : 'pending'
  const page = parsePageParam(sp.page)
  const { from, to } = pageRange(page, PAGE_SIZE)
  const statuses = FILTERS[filter].statuses

  const [list, counts] = await Promise.all([
    timed('/arc', 'arc.list', () => listArcRequestsForBoard({ status: statuses ?? undefined, from, to })),
    timed('/arc', 'arc.statusCounts', () => countArcRequestsByStatus()),
  ])

  const countFor = (key: Filter): number | null => {
    if (!counts) return null
    const set = FILTERS[key].statuses as readonly string[] | null
    return set
      ? set.reduce((n, s) => n + (counts[s] ?? 0), 0)
      : Object.values(counts).reduce((a, b) => a + b, 0)
  }
  const pending = countFor('pending')
  const all = countFor('all')

  const href = (f: Filter, p = 1) => {
    const q = new URLSearchParams()
    if (f !== 'pending') q.set('status', f)
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return qs ? `/arc?${qs}` : '/arc'
  }

  const columns: DataTableColumn<ArcRequestBoardRow>[] = [
    {
      key: 'summary',
      header: 'Application',
      mobilePrimary: true,
      className: 'min-w-[16rem]',
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/arc/${r.id}`} className="font-medium text-foreground no-underline hover:text-primary hover:underline">
            {r.summary}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {r.submitter_name ?? r.submitter_email ?? 'Unknown submitter'}
            {r.unit_number ? ` · Unit ${r.unit_number}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => <Badge variant="neutral">{ARC_CATEGORY[r.category] ?? r.category}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status} tones={ARC_STATUS.tones} labels={ARC_STATUS.labels} />,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (r) => (
        <time dateTime={r.submitted_at} className="whitespace-nowrap text-foreground-secondary">
          {format(new Date(r.submitted_at), 'MMM d, yyyy')}
        </time>
      ),
    },
    {
      key: 'decided',
      header: 'Decided',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (r) =>
        r.board_response_at ? (
          <time dateTime={r.board_response_at} className="whitespace-nowrap text-foreground-secondary">
            {format(new Date(r.board_response_at), 'MMM d, yyyy')}
          </time>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]

  return (
    <Page
      title="ARC review"
      description={
        pending != null && all != null
          ? `Architectural review applications from residents. ${pending} awaiting a decision · ${all} total.`
          : 'Architectural review applications from residents.'
      }
      linkAs={Link}
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
        <LoadFailed what="ARC applications" />
      ) : (
        <DataTable
          caption="ARC applications"
          columns={columns}
          rows={list.rows}
          rowKey={(r) => r.id}
          mobile="cards"
          empty={
            all === 0 ? (
              <EmptyState
                variant="compact"
                icon={<ClipboardList aria-hidden />}
                title="No ARC applications yet"
                secondaryAction={<HowThisWorks href={guideHref('arc-review-application')} />}
                description="When a resident submits an architectural application from their portal, it lands here for board review."
                action={
                  <Button asChild size="sm">
                    <Link href="/communications/new">Tell residents how to apply</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="compact"
                icon={filter === 'pending' ? <ClipboardList aria-hidden /> : <SearchX aria-hidden />}
                title={filter === 'pending' ? 'All caught up' : `No ${FILTERS[filter].label.toLowerCase()} applications`}
                description={
                  filter === 'pending'
                    ? 'Every application has a decision. New submissions will appear here.'
                    : 'Try another status.'
                }
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href={href('all')}>Show all applications</Link>
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
                noun="applications"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}
