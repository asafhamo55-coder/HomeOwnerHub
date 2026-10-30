import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { AlertCircle, CalendarClock, CalendarDays, CalendarPlus, FileText, Gavel } from 'lucide-react'
import { format } from 'date-fns'
import {
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  LoadFailed,
  NoOrgSelected,
  Page,
  Pager,
  StatusBadge,
  StatusPill,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { todayIn } from '@/lib/association-time'
import { MEETING_STATUS, MEETING_TYPE } from '@/lib/status/community'
import { SummaryStrip } from '@/components/SummaryStrip'
import { orgTimeZone } from '@/lib/association-time-server'
import { readAllResult } from '@/lib/supabase/read-all'
import {
  formatMeetingDay,
  parseMeetingsView,
  summarizeMeetings,
  type MeetingsView,
} from '@/lib/meetings/meetings-list'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

export const metadata = { title: 'Meetings' }
export const dynamic = 'force-dynamic'

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  approved_at: string | null
  attendees: string[] | null
}

interface ActionItemAgg {
  meeting_id: string
  status: string | null
  due_date: string | null
}

type SummaryRow = Pick<MeetingRow, 'meeting_date' | 'meeting_type' | 'status' | 'approved_at'>

type Counts = { total: number; open: number; overdue: number }

// Past meetings page 50 at a time (was a silent `.limit(50)`). Upcoming
// meetings are few by nature; the first 20 are shown with a count of the
// rest so nothing is silently dropped.
const PAGE_SIZE = 50
const UPCOMING_MAX = 20

const SELECT = 'id, meeting_date, meeting_type, status, approved_at, attendees'

function dateOf(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; view?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const sp = await searchParams
  const page = parsePageParam(sp.page)
  const view = parseMeetingsView(sp.view)
  const { from, to } = pageRange(page, PAGE_SIZE)

  const supabase = await getSupabaseServerClient()
  const timeZone = await orgTimeZone(supabase, org.id)
  const today = todayIn(timeZone)
  const showUpcoming = view === 'all' || view === 'upcoming'
  const showPast = view !== 'upcoming'

  // Lean, paged read of every meeting for the strip and the chip counts.
  const summaryRes = await timed('/meetings', 'meetings.summary', () =>
    loadOrFail(
      'meeting summary',
      readAllResult<SummaryRow>((f, t) =>
        supabase
          .from('hoa_meeting_minutes')
          .select('meeting_date, meeting_type, status, approved_at')
          .eq('org_id', org.id)
          .is('deleted_at', null)
          .order('id')
          .range(f, t) as never,
      ),
    ),
  )
  const summaryRows = summaryRes.ok ? ((summaryRes.data ?? []) as SummaryRow[]) : null
  const summary = summaryRows ? summarizeMeetings(summaryRows, timeZone) : null
  const upcomingAll = summaryRows ? summaryRows.filter((m) => m.meeting_date >= today).length : null
  const pastAll = summaryRows ? summaryRows.length - (upcomingAll ?? 0) : null

  const [upcomingRes, pastRes] = await Promise.all([
    !showUpcoming
      ? null
      : timed('/meetings', 'meetings.upcoming', () =>
      loadOrFail(
        'upcoming meetings',
        supabase
          .from('hoa_meeting_minutes')
          .select(SELECT, { count: 'exact' })
          .eq('org_id', org.id)
          .is('deleted_at', null)
          .gte('meeting_date', today)
          .order('meeting_date', { ascending: true })
          .range(0, UPCOMING_MAX - 1),
      ),
    ),
    !showPast
      ? null
      : timed('/meetings', 'meetings.past', () => {
          let q = supabase
            .from('hoa_meeting_minutes')
            .select(SELECT, { count: 'exact' })
            .eq('org_id', org.id)
            .is('deleted_at', null)
            .lt('meeting_date', today)
          if (view === 'needs-minutes') {
            // Same rule as needsMinutes(): not approved, not archived.
            q = q.is('approved_at', null).or('status.is.null,status.not.in.(approved,archived)')
          }
          return loadOrFail('meetings', q.order('meeting_date', { ascending: false }).range(from, to))
        }),
  ])

  const upcomingOk = upcomingRes ? upcomingRes.ok : true
  const pastOk = pastRes ? pastRes.ok : true
  const upcoming = upcomingRes?.ok ? ((upcomingRes.data ?? []) as MeetingRow[]) : []
  const upcomingTotal = upcomingRes?.ok ? (upcomingRes.count ?? upcoming.length) : 0
  const past = pastRes?.ok ? ((pastRes.data ?? []) as MeetingRow[]) : []
  const pastTotal = pastRes?.ok ? (pastRes.count ?? past.length) : 0

  // Action-item tallies in one round-trip rather than N+1. A failed
  // lookup must not read as "no action items" on every row.
  let actionItemsFailed = false
  let counts = new Map<string, Counts>()
  const ids = [...upcoming, ...past].map((m) => m.id)
  if (ids.length > 0) {
    const aggResult = await timed('/meetings', 'meetings.actionItems', () =>
      loadOrFail(
        'meeting action items',
        supabase
          .from('meeting_action_items' as never)
          .select('meeting_id, status, due_date')
          .in('meeting_id' as never, ids),
      ),
    )
    actionItemsFailed = !aggResult.ok
    const agg = aggResult.ok ? ((aggResult.data ?? []) as unknown as ActionItemAgg[]) : []
    counts = agg.reduce((acc, r) => {
      const entry = acc.get(r.meeting_id) ?? { total: 0, open: 0, overdue: 0 }
      entry.total += 1
      if (r.status === 'open' || r.status === 'in_progress') {
        entry.open += 1
        if (r.due_date && r.due_date < today) entry.overdue += 1
      }
      acc.set(r.meeting_id, entry)
      return acc
    }, new Map<string, Counts>())
  }

  const nothingAtAll = summaryRows ? summaryRows.length === 0 : false

  const columns = meetingColumns(counts, actionItemsFailed, today)

  return (
    <Page
      title="Meetings"
      description="Schedule board meetings, file AI-drafted minutes, and track the action items they produce."
      actions={
        <>
          <Button asChild variant="ghost">
            <Link href="/meetings/motions">
              <Gavel className="size-4" aria-hidden />
              Motion log
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/meetings/schedule">
              <CalendarPlus className="size-4" aria-hidden />
              Schedule meeting
            </Link>
          </Button>
          <Button asChild>
            <Link href="/meetings/new">
              <FileText className="size-4" aria-hidden />
              Record minutes
            </Link>
          </Button>
        </>
      }
    >
      {actionItemsFailed ? (
        <LoadFailed
          what="action-item counts"
          hint="The meetings below are correct; only their action-item tallies are missing."
        />
      ) : null}

      {nothingAtAll ? (
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title="No meetings yet"
          description="Schedule your next board meeting, or paste a transcript and let AI draft the minutes for you to approve."
          action={
            <Button asChild>
              <Link href="/meetings/new">
                <FileText className="size-4" aria-hidden />
                Record first minutes
              </Link>
            </Button>
          }
          secondaryAction={
            <>
              <Button asChild variant="ghost">
                <Link href="/meetings/schedule">Schedule a meeting</Link>
              </Button>
              <HowThisWorks href={guideHref('meetings-schedule-and-minutes')} />
            </>
          }
        />
      ) : (
        <>
          <SummaryStrip
            ariaLabel="Meetings summary"
            testId="meetings-summary"
            tiles={[
              {
                label: 'Next meeting',
                value: summary ? (summary.next ? formatMeetingDay(summary.next.day) : 'None scheduled') : null,
                hint: summary?.next
                  ? `${(summary.next.type && MEETING_TYPE[summary.next.type]) || 'Board'} meeting`
                  : 'Nothing on the calendar yet',
                href: viewHref('upcoming'),
              },
              {
                label: 'Meetings this year',
                value: summary ? String(summary.thisYear) : null,
                hint: summary ? `Held or scheduled in ${summary.today.slice(0, 4)}` : undefined,
                href: viewHref('all'),
              },
              {
                label: 'Minutes not approved',
                value: summary ? String(summary.needsMinutes) : null,
                hint: 'Past meetings whose minutes are not approved',
                href: viewHref('needs-minutes'),
                tone: summary && summary.needsMinutes > 0 ? 'warning' : 'default',
              },
            ]}
          />
          <ListToolbar>
            <FilterChips
              label="Filter meetings"
              linkAs={Link}
              items={[
                { label: 'All', href: viewHref('all'), active: view === 'all', count: summaryRows?.length },
                { label: 'Upcoming', href: viewHref('upcoming'), active: view === 'upcoming', count: upcomingAll ?? undefined },
                { label: 'Past', href: viewHref('past'), active: view === 'past', count: pastAll ?? undefined },
                {
                  label: 'Needs minutes',
                  href: viewHref('needs-minutes'),
                  active: view === 'needs-minutes',
                  count: summary ? summary.needsMinutes : undefined,
                },
              ]}
            />
          </ListToolbar>

          {showUpcoming ? (
          <section aria-labelledby="upcoming-heading" className="space-y-3">
            <SectionHeading id="upcoming-heading" title="Upcoming" count={upcomingOk ? upcomingTotal : null} />
            {!upcomingOk ? (
              <LoadFailed what="upcoming meetings" />
            ) : (
              <DataTable
                caption="Upcoming meetings"
                columns={columns}
                rows={upcoming}
                rowKey={(m) => m.id}
                mobile="cards"
                linkAs={Link}
                empty={
                  <EmptyState
                    variant="compact"
                    icon={<CalendarClock aria-hidden />}
                    title="Nothing scheduled"
                    description="Put the next board meeting on the calendar so it shows on the dashboard."
                    action={
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/meetings/schedule">Schedule meeting</Link>
                      </Button>
                    }
                  />
                }
                footer={
                  upcomingTotal > upcoming.length ? (
                    <p className="px-4 py-3 text-sm text-muted">
                      Showing the next {upcoming.length} of {upcomingTotal} scheduled meetings.
                    </p>
                  ) : undefined
                }
              />
            )}
          </section>
          ) : null}

          {showPast ? (
          <section aria-labelledby="past-heading" className="space-y-3">
            <SectionHeading
              id="past-heading"
              title={view === 'needs-minutes' ? 'Minutes to approve' : 'Past meetings'}
              count={pastOk ? pastTotal : null}
            />
            {!pastOk ? (
              <LoadFailed what="past meetings" />
            ) : (
              <DataTable
                caption={view === 'needs-minutes' ? 'Meetings with minutes not approved' : 'Past meetings'}
                columns={columns}
                rows={past}
                rowKey={(m) => m.id}
                mobile="cards"
                linkAs={Link}
                empty={
                  view === 'needs-minutes' ? (
                    <EmptyState
                      variant="compact"
                      icon={<FileText aria-hidden />}
                      title="Every past meeting has approved minutes"
                      description="Nothing is waiting on the board. A meeting shows here once its date passes without approved minutes."
                      action={
                        <Button asChild size="sm" variant="secondary">
                          <Link href={viewHref('past')}>See past meetings</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      variant="compact"
                      icon={<FileText aria-hidden />}
                      title="No past meetings on file"
                      description="Minutes you record appear here once the meeting date has passed."
                      action={
                        <Button asChild size="sm" variant="secondary">
                          <Link href="/meetings/new">Record past minutes</Link>
                        </Button>
                      }
                    />
                  )
                }
                footer={
                  <Pager
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={pastTotal}
                    rowCount={past.length}
                    hrefFor={(p) => viewHref(view, p)}
                    linkAs={Link}
                    noun="meetings"
                  />
                }
              />
            )}
          </section>
          ) : null}
        </>
      )}
    </Page>
  )
}

function viewHref(view: MeetingsView, page = 1): string {
  const params = new URLSearchParams()
  if (view !== 'all') params.set('view', view)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/meetings?${qs}` : '/meetings'
}

function SectionHeading({ id, title, count }: { id: string; title: string; count: number | null }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
      {title}
      {count != null ? <span className="num text-sm font-normal text-muted">{count}</span> : null}
    </h2>
  )
}

function meetingColumns(
  counts: Map<string, Counts>,
  countsFailed: boolean,
  today: string,
): DataTableColumn<MeetingRow>[] {
  return [
    {
      key: 'date',
      header: 'Date',
      mobilePrimary: true,
      className: 'w-[30%]',
      cell: (m) => (
        <Link
          href={`/meetings/${m.id}`}
          className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {format(dateOf(m.meeting_date), 'EEE, MMM d, yyyy')}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'w-[14%]',
      cell: (m) =>
        m.meeting_type ? (
          <span className="text-foreground-secondary">{MEETING_TYPE[m.meeting_type] ?? m.meeting_type}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Minutes',
      className: 'w-[18%]',
      cell: (m) =>
        m.meeting_date >= today && (m.status ?? 'draft') === 'draft' ? (
          <StatusPill tone="info" label="Scheduled" icon={<CalendarClock aria-hidden />} />
        ) : (
          <StatusBadge status={m.status ?? 'draft'} tones={MEETING_STATUS.tones} labels={MEETING_STATUS.labels} />
        ),
    },
    {
      key: 'attendees',
      header: 'Attendees',
      numeric: true,
      className: 'w-[12%]',
      hideBelowLg: true,
      cell: (m) =>
        m.attendees && m.attendees.length > 0 ? m.attendees.length : <span className="text-muted">—</span>,
    },
    {
      key: 'actions',
      header: 'Action items',
      cell: (m) => {
        if (countsFailed) return <span className="text-muted">—</span>
        const c = counts.get(m.id)
        if (!c || c.total === 0) return <span className="text-muted">None</span>
        return (
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 md:justify-start">
            <span className="num text-foreground">
              {c.open} open <span className="text-muted">/ {c.total}</span>
            </span>
            {c.overdue > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                <AlertCircle className="size-3.5" aria-hidden />
                {c.overdue} overdue
              </span>
            ) : null}
          </span>
        )
      },
    },
  ]
}
