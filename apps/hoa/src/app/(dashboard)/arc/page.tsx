import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { CalendarX, ClipboardList, Hourglass, SearchX, Timer } from 'lucide-react'
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
  readArcStatusRows,
  listArcRequestsForBoard,
  type ArcRequestBoardRow,
  type ArcStatus,
} from '@/lib/board-review'
import { ARC_CATEGORY, ARC_STATUS } from '@/lib/status/community'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'
import { ArcClockChip } from '@/components/arc-review/ArcClockChip'
import { getArcClockSettings } from '@/lib/arc-review/clock-actions'
import { ARC_DEEMED_APPROVAL_NOTE, arcClock, pickArcClockSettings } from '@/lib/arc-review/clock'
import { ArcClockSettingsForm } from './ArcClockSettingsForm'
import { SummaryStrip } from '@/components/SummaryStrip'
import { countByStatus, countPastDecideBy, oldestArcWaitDays } from '@/lib/arc-review/summary'
import { plural } from '@/lib/money/format'

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

  const [list, statusRows, clockLoad] = await Promise.all([
    timed('/arc', 'arc.list', () =>
      // The work queue opens oldest first: the most urgent on the decision clock (BL-113).
      listArcRequestsForBoard({ status: statuses ?? undefined, from, to, oldestFirst: filter === 'pending' }),
    ),
    timed('/arc', 'arc.statusCounts', () => readArcStatusRows()),
    timed('/arc', 'arc.clockSettings', () => getArcClockSettings()),
  ])
  const clockSettings = clockLoad.ok
    ? clockLoad.associations.map((a) => ({ associationId: a.association.id, settings: a.settings }))
    : []
  const now = Date.now()
  const clockFor = (r: ArcRequestBoardRow) =>
    arcClock({
      status: r.status,
      submittedAt: r.submitted_at,
      settings: pickArcClockSettings(clockSettings, r.association_id),
      now,
    })

  const counts = statusRows ? countByStatus(statusRows) : null
  const countFor = (key: Filter): number | null => {
    if (!counts) return null
    const set = FILTERS[key].statuses as readonly string[] | null
    return set
      ? set.reduce((n, s) => n + (counts[s] ?? 0), 0)
      : Object.values(counts).reduce((a, b) => a + b, 0)
  }
  const pending = countFor('pending')
  const all = countFor('all')

  // The strip reads the same status rows as the chips. A failed read shows
  // "Not available", never 0. Past decide-by needs the clock settings too.
  const oldestWait = statusRows ? oldestArcWaitDays(statusRows, new Date(now)) : null
  const pastDecideBy = statusRows && clockLoad.ok ? countPastDecideBy(statusRows, clockSettings, new Date(now)) : null

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
      key: 'clock',
      header: 'Decide by',
      cell: (r) => {
        const clock = clockFor(r)
        return clock ? <ArcClockChip clock={clock} /> : <span className="text-muted">—</span>
      },
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
      <SummaryStrip
        ariaLabel="ARC summary"
        testId="arc-summary"
        tiles={[
          {
            label: 'Waiting',
            icon: <Hourglass />,
            value: pending === null ? null : String(pending),
            hint: pending === 0 ? 'Nothing needs a decision' : 'Need a board decision',
            href: href('pending'),
          },
          {
            label: 'Oldest wait',
            icon: <Timer />,
            value: statusRows ? (oldestWait === null ? 'None' : plural(oldestWait, 'day')) : null,
            hint: oldestWait === null ? 'Nothing waiting' : oldestWait === 0 ? 'Submitted today' : 'Since it was submitted',
            href: href('pending'),
          },
          {
            label: 'Past decide-by date',
            icon: <CalendarX />,
            value: pastDecideBy === null ? null : String(pastDecideBy),
            hint: pastDecideBy === 0 ? 'All within the deadline' : 'Open the list to see which',
            tone: pastDecideBy ? 'danger' : 'default',
            href: href('pending'),
          },
        ]}
      />

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

      {clockLoad.ok && clockLoad.associations.length > 0 ? (
        <details className="mb-4 rounded-xl border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Decision deadline:{' '}
            {clockLoad.associations
              .map(
                (a) =>
                  `${a.settings.days} ${a.settings.dayKind === 'business' ? 'business ' : ''}days` +
                  (clockLoad.associations.length > 1 ? ` (${a.association.name})` : ''),
              )
              .join(', ')}
          </summary>
          <div className="mt-3 space-y-4">
            <p className="text-muted">
              Applications show the days left to decide, counted from the day the resident submitted. Only the board
              sees this. {ARC_DEEMED_APPROVAL_NOTE}
            </p>
            {clockLoad.associations.some((a) => a.state === 'unverified') ? (
              <p className="font-medium text-warning">
                The saved deadline was changed outside this screen, so the default of 30 days is used. Save it again.
              </p>
            ) : null}
            {clockLoad.associations.map((a) => (
              <ArcClockSettingsForm
                key={a.association.id}
                associationId={a.association.id}
                associationName={clockLoad.associations.length > 1 ? a.association.name : undefined}
                initialDays={a.settings.days}
                initialDayKind={a.settings.dayKind}
              />
            ))}
          </div>
        </details>
      ) : null}

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
