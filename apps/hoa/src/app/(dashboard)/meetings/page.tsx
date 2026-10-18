import Link from 'next/link'
import { AlertCircle, CalendarClock, CalendarDays, CalendarPlus, FileText } from 'lucide-react'
import { format } from 'date-fns'
import {
  Button,
  DataTable,
  EmptyState,
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
import { MEETING_STATUS, MEETING_TYPE } from '@/lib/status/community'
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

type Counts = { total: number; open: number; overdue: number }

// Past meetings page 50 at a time (was a silent `.limit(50)`). Upcoming
// meetings are few by nature; the first 20 are shown with a count of the
// rest so nothing is silently dropped.
const PAGE_SIZE = 50
const UPCOMING_MAX = 20

const SELECT = 'id, meeting_date, meeting_type, status, approved_at, attendees'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateOf(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const page = parsePageParam((await searchParams).page)
  const { from, to } = pageRange(page, PAGE_SIZE)
  const today = localToday()

  const supabase = await getSupabaseServerClient()
  const [upcomingRes, pastRes] = await Promise.all([
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
    loadOrFail(
      'meetings',
      supabase
        .from('hoa_meeting_minutes')
        .select(SELECT, { count: 'exact' })
        .eq('org_id', org.id)
        .is('deleted_at', null)
        .lt('meeting_date', today)
        .order('meeting_date', { ascending: false })
        .range(from, to),
    ),
  ])

  const upcoming = upcomingRes.ok ? ((upcomingRes.data ?? []) as MeetingRow[]) : []
  const upcomingTotal = upcomingRes.ok ? (upcomingRes.count ?? upcoming.length) : 0
  const past = pastRes.ok ? ((pastRes.data ?? []) as MeetingRow[]) : []
  const pastTotal = pastRes.ok ? (pastRes.count ?? past.length) : 0

  // Action-item tallies in one round-trip rather than N+1. A failed
  // lookup must not read as "no action items" on every row.
  let actionItemsFailed = false
  let counts = new Map<string, Counts>()
  const ids = [...upcoming, ...past].map((m) => m.id)
  if (ids.length > 0) {
    const aggResult = await loadOrFail(
      'meeting action items',
      supabase
        .from('meeting_action_items' as never)
        .select('meeting_id, status, due_date')
        .in('meeting_id' as never, ids),
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

  const nothingAtAll =
    upcomingRes.ok && pastRes.ok && upcomingTotal === 0 && pastTotal === 0 && page === 1

  const columns = meetingColumns(counts, actionItemsFailed, today)

  return (
    <Page
      title="Meetings"
      description="Schedule board meetings, file AI-drafted minutes, and track the action items they produce."
      actions={
        <>
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
          <section aria-labelledby="upcoming-heading" className="space-y-3">
            <SectionHeading id="upcoming-heading" title="Upcoming" count={upcomingRes.ok ? upcomingTotal : null} />
            {!upcomingRes.ok ? (
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

          <section aria-labelledby="past-heading" className="space-y-3">
            <SectionHeading id="past-heading" title="Past meetings" count={pastRes.ok ? pastTotal : null} />
            {!pastRes.ok ? (
              <LoadFailed what="past meetings" />
            ) : (
              <DataTable
                caption="Past meetings"
                columns={columns}
                rows={past}
                rowKey={(m) => m.id}
                mobile="cards"
                linkAs={Link}
                empty={
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
                }
                footer={
                  <Pager
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={pastTotal}
                    rowCount={past.length}
                    hrefFor={(p) => (p > 1 ? `/meetings?page=${p}` : '/meetings')}
                    linkAs={Link}
                    noun="meetings"
                  />
                }
              />
            )}
          </section>
        </>
      )}
    </Page>
  )
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
