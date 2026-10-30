import Link from 'next/link'
import { FileText, Inbox, MessageSquare, Search } from 'lucide-react'
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { format } from 'date-fns'
import {
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  SearchForm,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { SummaryStrip } from '@/components/SummaryStrip'
import { formatTicketAge, ticketAgeDays } from '@/lib/tickets-board'
import { listTicketsForBoard, type TicketBoardRow, type TicketStatus } from '@/lib/tickets'
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from '@/lib/status/community'

export const metadata = { title: 'Tickets' }

// Was a hidden `.limit(200)` inside listTicketsForBoard.
const PAGE_SIZE = 100

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'closed']

function parseStatus(raw: string | undefined): TicketStatus | undefined {
  return STATUSES.find((s) => s === raw)
}

function hrefFor({ status, page, q: term }: { status?: TicketStatus; page?: number; q?: string }): string {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  if (term) q.set('q', term)
  if (page && page > 1) q.set('page', String(page))
  const qs = q.toString()
  return qs ? `/tickets?${qs}` : '/tickets'
}

function buildColumns(timeZone: string): DataTableColumn<TicketBoardRow>[] {
  return [
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
    key: 'age',
    header: 'Age',
    className: 'whitespace-nowrap',
    cell: (t) => (
      <time dateTime={t.created_at} className="block">
        <span className="num text-foreground">
          {formatTicketAge(ticketAgeDays(t.created_at, timeZone))}
        </span>
        <span className="num block text-xs text-muted">{format(new Date(t.created_at), 'MMM d, yyyy')}</span>
      </time>
    ),
  },
  ]
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}) {
  const sp = await searchParams
  const page = parsePageParam(sp.page)
  const status = parseStatus(sp.status)
  const q = (sp.q ?? '').trim().slice(0, 80)
  const result = await listTicketsForBoard({ page, pageSize: PAGE_SIZE, status, q })
  const tickets = result.ok ? result.rows : []
  const summary = result.ok ? result.summary : null
  const columns = buildColumns(result.ok ? result.timeZone : 'America/New_York')

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
      actions={
        RECORDS_REQUESTS_LIVE ? (
          <Button asChild variant="secondary">
            <Link href="/tickets/records">
              <FileText className="size-4" aria-hidden />
              Records requests
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!result.ok ? (
        <LoadFailed what="tickets" />
      ) : (
        <>
          <SummaryStrip
            ariaLabel="Ticket summary"
            testId="tickets-summary"
            tiles={[
              {
                label: 'Needs attention',
                value: summary ? String(summary.needsAttention) : null,
                hint: 'Open and in progress',
                href: hrefFor({ status: 'open' }),
                tone: summary && summary.needsAttention > 0 ? 'warning' : 'default',
              },
              {
                label: 'Oldest open',
                value: summary ? (summary.oldestOpenDays === null ? 'None' : formatTicketAge(summary.oldestOpenDays)) : null,
                hint: 'Days since it was opened',
              },
              {
                label: 'Unassigned',
                value: summary ? String(summary.unassigned) : null,
                hint: 'Open, no action item with an owner',
              },
            ]}
          />
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
            <SearchForm
              action="/tickets"
              defaultValue={q}
              label="Search tickets"
              placeholder="Search subject, resident or unit"
              keep={{ status }}
              linkAs={Link}
            />
          </ListToolbar>

          {result.total === 0 && !status && !q ? (
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
                q ? (
                  <EmptyState
                    variant="compact"
                    icon={<Search aria-hidden />}
                    title={`No tickets match “${q}”`}
                    description="Try part of the subject, the resident's name or the unit number."
                    action={
                      <Button asChild variant="secondary" size="sm">
                        <Link href={hrefFor({ status })}>Clear search</Link>
                      </Button>
                    }
                  />
                ) : (
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
                )
              }
              footer={
                result.total <= PAGE_SIZE && page === 1 ? undefined : (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={result.total}
                  rowCount={tickets.length}
                  hrefFor={(p) => hrefFor({ status, q, page: p })}
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
