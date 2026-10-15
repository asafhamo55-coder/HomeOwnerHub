import Link from 'next/link'
import { Inbox, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import {
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { listTicketsForBoard, type TicketBoardRow, type TicketStatus } from '@/lib/tickets'
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from '@/lib/status/community'

export const metadata = { title: 'Tickets' }

// Was a hidden `.limit(200)` inside listTicketsForBoard.
const PAGE_SIZE = 100

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'closed']

function parseStatus(raw: string | undefined): TicketStatus | undefined {
  return STATUSES.find((s) => s === raw)
}

function hrefFor({ status, page }: { status?: TicketStatus; page?: number }): string {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  if (page && page > 1) q.set('page', String(page))
  const qs = q.toString()
  return qs ? `/tickets?${qs}` : '/tickets'
}

const columns: DataTableColumn<TicketBoardRow>[] = [
  {
    key: 'subject',
    header: 'Ticket',
    mobilePrimary: true,
    cell: (t) => (
      <div className="min-w-0">
        <Link
          href={`/tickets/${t.id}`}
          className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.subject}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted">
          {t.submitter_name ?? t.submitter_email ?? 'Unknown resident'}
          {t.unit_number ? ` · Unit ${t.unit_number}` : ''}
          <span className="md:hidden"> · {TICKET_CATEGORY[t.category] ?? t.category}</span>
        </p>
      </div>
    ),
  },
  {
    key: 'category',
    header: 'Category',
    hideBelowLg: true,
    hideOnMobile: true,
    cell: (t) => <span className="text-foreground-secondary">{TICKET_CATEGORY[t.category] ?? t.category}</span>,
  },
  {
    key: 'priority',
    header: 'Priority',
    // Only high/urgent earn a pill; normal and low are the quiet default.
    cell: (t) =>
      t.priority === 'high' || t.priority === 'urgent' ? (
        <StatusBadge status={t.priority} tones={TICKET_PRIORITY.tones} labels={TICKET_PRIORITY.labels} />
      ) : (
        <span className="text-foreground-secondary">{TICKET_PRIORITY.labels[t.priority] ?? t.priority}</span>
      ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (t) => <StatusBadge status={t.status} tones={TICKET_STATUS.tones} labels={TICKET_STATUS.labels} />,
  },
  {
    key: 'created',
    header: 'Opened',
    className: 'whitespace-nowrap',
    cell: (t) => (
      <time dateTime={t.created_at} className="num text-foreground-secondary">
        {format(new Date(t.created_at), 'MMM d, yyyy')}
      </time>
    ),
  },
]

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const sp = await searchParams
  const page = parsePageParam(sp.page)
  const status = parseStatus(sp.status)
  const result = await listTicketsForBoard({ page, pageSize: PAGE_SIZE, status })
  const tickets = result.ok ? result.rows : []

  const allCount = result.ok
    ? result.statusCounts.open + result.statusCounts.in_progress + result.statusCounts.closed
    : null

  return (
    <Page
      title="Tickets"
      description={
        result.ok
          ? `${result.openCount} need attention · ${allCount} total. Residents open tickets from the portal; reply, assign work, and close them here.`
          : 'Requests residents send from the portal.'
      }
    >
      {!result.ok ? (
        <LoadFailed what="tickets" />
      ) : (
        <>
          <ListToolbar>
            <FilterChips
              label="Filter tickets by status"
              linkAs={Link}
              items={[
                { label: 'All', href: hrefFor({}), active: !status, count: allCount },
                ...STATUSES.map((s) => ({
                  label: TICKET_STATUS.labels[s],
                  href: hrefFor({ status: s }),
                  active: status === s,
                  count: result.statusCounts[s],
                })),
              ]}
            />
          </ListToolbar>

          {result.total === 0 && !status ? (
            <EmptyState
              icon={<MessageSquare aria-hidden />}
              title="No tickets yet"
              description="When residents submit a request from the portal — a broken gate, a billing question — it lands here for the board to answer."
              action={
                <Button asChild variant="secondary">
                  <Link href="/communications/new">Tell residents about the portal</Link>
                </Button>
              }
            />
          ) : (
            <DataTable
              caption="Tickets"
              columns={columns}
              rows={tickets}
              rowKey={(t) => t.id}
              mobile="cards"
              empty={
                <EmptyState
                  variant="compact"
                  icon={<Inbox aria-hidden />}
                  title={`No ${status ? TICKET_STATUS.labels[status].toLowerCase() : ''} tickets`}
                  description="Nothing in this view right now."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/tickets">Show all tickets</Link>
                    </Button>
                  }
                />
              }
              footer={
                result.total <= PAGE_SIZE && page === 1 ? undefined : (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={result.total}
                  rowCount={tickets.length}
                  hrefFor={(p) => hrefFor({ status, page: p })}
                  linkAs={Link}
                  noun="tickets"
                />
                )
              }
            />
          )}
        </>
      )}
    </Page>
  )
}
