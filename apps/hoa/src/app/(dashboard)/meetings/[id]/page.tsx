import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Users,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBadge,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listActionItems } from '@/lib/meeting-action-items'
import { ActionItemsSection } from './ActionItemsSection'
import { MeetingActions } from './MeetingActions'

export const dynamic = 'force-dynamic'

interface MotionRow {
  id?: string
  text?: string
  motion?: string
  yea?: number
  nay?: number
  abstain?: number
  result?: string
}

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  attendees: string[] | null
  ai_summary: string | null
  raw_transcript: string | null
  motions: MotionRow[] | null
  status: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string | null
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular (board) meeting',
  special: 'Special meeting',
  annual: 'Annual meeting',
  emergency: 'Emergency meeting',
}

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

export default async function MeetingDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_meeting_minutes')
    .select(
      'id, meeting_date, meeting_type, attendees, ai_summary, raw_transcript, motions, status, approved_at, approved_by, created_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const meeting = data as unknown as MeetingRow
  const actionItems = await listActionItems(id)

  const dateObj = new Date(meeting.meeting_date + 'T00:00:00')
  const typeLabel = meeting.meeting_type
    ? MEETING_TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type
    : 'Meeting'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All meetings
      </Link>

      {/* Title block */}
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {typeLabel} · {format(dateObj, 'EEEE')}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {format(dateObj, 'PPP')}
          </h1>
          <div className="flex items-center gap-2">
            <MeetingActions meetingId={meeting.id} />
            <StatusBadge
            status={meeting.status ?? 'draft'}
            tones={MEETING_STATUS_TONES}
            labels={MEETING_STATUS_LABELS}
          />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          {meeting.attendees && meeting.attendees.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {meeting.attendees.length} attendees
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> No attendee list
            </span>
          )}
          {meeting.approved_at ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Approved {format(new Date(meeting.approved_at), 'MMM d, yyyy')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Awaiting approval
            </span>
          )}
        </div>
      </header>

      {/* Action items — first because boards need to act on them */}
      <ActionItemsSection meetingId={meeting.id} items={actionItems} />

      {/* Full meeting summary — no clamp */}
      <section className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Meeting summary
        </p>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-5 pb-2">
            <FileText className="h-4 w-4 text-muted" aria-hidden />
            <CardTitle className="text-base">Approved minutes</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            {meeting.ai_summary ? (
              <div className="prose prose-sm max-w-none text-foreground prose-headings:font-semibold prose-headings:text-foreground prose-p:leading-relaxed prose-li:leading-relaxed">
                {meeting.ai_summary.split('\n\n').map((para, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No summary recorded. Edit this meeting to add one.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Motions — only if present */}
      {meeting.motions && meeting.motions.length > 0 ? (
        <section className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Motions &amp; votes
          </p>
          <Card>
            <ul className="divide-y divide-border">
              {meeting.motions.map((m, i) => (
                <li key={m.id ?? i} className="px-5 py-4">
                  <p className="text-sm font-medium text-foreground">
                    {m.text ?? m.motion ?? `Motion ${i + 1}`}
                  </p>
                  {(m.yea != null || m.nay != null || m.abstain != null) ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {m.yea != null ? <span>Yea: <strong className="text-foreground tabular-nums">{m.yea}</strong></span> : null}
                      {m.nay != null ? <span>Nay: <strong className="text-foreground tabular-nums">{m.nay}</strong></span> : null}
                      {m.abstain != null ? <span>Abstain: <strong className="text-foreground tabular-nums">{m.abstain}</strong></span> : null}
                      {m.result ? <span className="uppercase tracking-wide">{m.result}</span> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* Attendees — only if present */}
      {meeting.attendees && meeting.attendees.length > 0 ? (
        <section className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Attendees
          </p>
          <Card>
            <CardContent className="p-5">
              <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                {meeting.attendees.map((a) => (
                  <li
                    key={a}
                    className="flex items-center gap-2 text-foreground"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/30 text-[10px] font-medium text-muted">
                      {a
                        .split(' ')
                        .map((p) => p[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Raw transcript — collapsed by default, audit trail */}
      {meeting.raw_transcript ? (
        <section className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Audit
          </p>
          <details className="group rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
                <span className="text-base font-medium text-foreground">
                  Raw transcript
                </span>
                <span className="text-xs text-muted">
                  ({meeting.raw_transcript.length.toLocaleString()} chars)
                </span>
              </span>
              <span className="text-xs uppercase tracking-wide text-muted group-open:text-foreground">
                <span className="group-open:hidden">Show</span>
                <span className="hidden group-open:inline">Hide</span>
              </span>
            </summary>
            <div className="border-t border-border p-5">
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">
                {meeting.raw_transcript}
              </pre>
            </div>
          </details>
        </section>
      ) : null}
    </div>
  )
}
