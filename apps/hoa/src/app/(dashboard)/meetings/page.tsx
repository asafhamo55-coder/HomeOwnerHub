import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { Button, Card, EmptyState, StatusBadge } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Meetings' }
export const dynamic = 'force-dynamic'

const MEETING_STATUS_TONES: Record<
  string,
  'success' | 'warning' | 'neutral' | 'outline'
> = {
  draft: 'neutral',
  in_progress: 'warning',
  approved: 'success',
  archived: 'neutral',
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  approved: 'Approved',
  archived: 'Archived',
}

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  approved_at: string | null
  attendees: string[] | null
  ai_summary: string | null
}

interface ActionItemAgg {
  meeting_id: string
  status: string | null
  due_date: string | null
}

export default async function MeetingsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status, approved_at, attendees, ai_summary')
    .eq('org_id', org.id)
    .is('deleted_at', null)
    .order('meeting_date', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as MeetingRow[]

  // Aggregate action item counts in one round-trip rather than N+1.
  let countsByMeeting: Map<
    string,
    { total: number; open: number; overdue: number }
  > = new Map()
  if (rows.length > 0) {
    const meetingIds = rows.map((m) => m.id)
    const { data: agg } = await supabase
      .from('meeting_action_items' as never)
      .select('meeting_id, status, due_date')
      .in('meeting_id' as never, meetingIds)
    const todayIso = new Date().toISOString().slice(0, 10)
    countsByMeeting = ((agg ?? []) as unknown as ActionItemAgg[]).reduce((acc, raw) => {
      const r = raw as ActionItemAgg
      const entry = acc.get(r.meeting_id) ?? {
        total: 0,
        open: 0,
        overdue: 0,
      }
      entry.total += 1
      const isOpen = r.status === 'open' || r.status === 'in_progress'
      if (isOpen) {
        entry.open += 1
        if (r.due_date && r.due_date < todayIso) entry.overdue += 1
      }
      acc.set(r.meeting_id, entry)
      return acc
    }, new Map<string, { total: number; open: number; overdue: number }>())
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Board record
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Meetings
          </h1>
          <p className="mt-1 text-sm text-muted">
            Paste a transcript, get AI-drafted minutes, approve via BarBGate.
            Action items track due dates &amp; status separately.
          </p>
        </div>
        <Button asChild>
          <Link href="/meetings/new">
            <Plus className="h-4 w-4" />
            New minutes
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <Card>
          <div className="p-8">
            <EmptyState
              icon={<CalendarDays className="h-10 w-10" aria-hidden />}
              title="No minutes yet"
              description="Run your first meeting through the transcript wizard."
              action={
                <Button asChild>
                  <Link href="/meetings/new">
                    <Plus className="h-4 w-4" />
                    File first minutes
                  </Link>
                </Button>
              }
            />
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((m) => {
              const counts = countsByMeeting.get(m.id)
              const dateObj = new Date(m.meeting_date + 'T00:00:00')
              return (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-medium text-foreground">
                          {format(dateObj, 'PPP')}
                        </p>
                        {m.meeting_type ? (
                          <span className="text-xs font-normal text-muted">
                            · {m.meeting_type}
                          </span>
                        ) : null}
                        <StatusBadge
                          status={m.status ?? 'draft'}
                          tones={MEETING_STATUS_TONES}
                          labels={MEETING_STATUS_LABELS}
                          size="sm"
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                        <span>
                          {m.attendees && m.attendees.length > 0
                            ? `${m.attendees.length} attendees`
                            : 'No attendee list'}
                        </span>
                        {m.approved_at ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Approved {format(new Date(m.approved_at), 'MMM d')}
                          </span>
                        ) : null}
                        {counts && counts.total > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-medium tabular-nums text-foreground">
                              {counts.total}
                            </span>
                            action {counts.total === 1 ? 'item' : 'items'}
                            {counts.open > 0 ? (
                              <span className="text-muted">
                                · {counts.open} open
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {counts && counts.overdue > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            {counts.overdue} overdue
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
