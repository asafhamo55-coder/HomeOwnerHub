import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { CheckCircle2, Clock, Gavel, ScrollText } from 'lucide-react'
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Page,
  StatusBadge,
  StatusPill,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { currentTimeZone } from '@/lib/association-time-current'
import { loadOrFail } from '@/lib/load-or-fail'
import { loadActionItems } from '@/lib/meeting-action-items'
import { MEETING_STATUS, MEETING_TYPE } from '@/lib/status/community'
import { ActionItemsSection } from './ActionItemsSection'
import { MeetingActions } from './MeetingActions'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { meetingDetailColumns } from './columns'
import { NoticePostedControl } from './NoticePostedControl'
import { QuorumKitCard } from './QuorumKitCard'
import { MeetingNoticeSection } from './MeetingNoticeSection'

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
  /** BL-050 (0064): selected only once M1_APPLIED. */
  notice_posted_at?: string | null
}

function motionTone(result: string | undefined): 'success' | 'danger' | 'neutral' {
  const r = (result ?? '').toLowerCase()
  if (r === 'passed' || r === 'carried' || r === 'approved') return 'success'
  if (r === 'failed' || r === 'defeated' || r === 'rejected') return 'danger'
  return 'neutral'
}

export default async function MeetingDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await getSupabaseServerClient()
  const result = await loadOrFail(
    'meeting',
    supabase
      .from('hoa_meeting_minutes')
      .select(meetingDetailColumns(M1_APPLIED))
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  )

  if (!result.ok) {
    return (
      <Page
        title="Meeting"
        breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: 'Meeting' }]}
        linkAs={Link}
      >
        <LoadFailed what="this meeting" />
      </Page>
    )
  }
  if (!result.data) notFound()
  const meeting = result.data as unknown as MeetingRow
  const actionItems = await loadActionItems(id)

  const dateObj = new Date(`${meeting.meeting_date}T00:00:00`)
  const dateLabel = format(dateObj, 'MMMM d, yyyy')
  const typeLabel = meeting.meeting_type
    ? `${MEETING_TYPE[meeting.meeting_type] ?? meeting.meeting_type} meeting`
    : 'Meeting'
  // The association's today (BL-043); the server clock is UTC.
  const todayIso = todayIn(await currentTimeZone())
  const isUpcoming = meeting.meeting_date >= todayIso && meeting.status !== 'approved'
  const motions = meeting.motions ?? []
  const attendees = meeting.attendees ?? []

  return (
    <Page
      width="wide"
      eyebrow={`${typeLabel} · ${format(dateObj, 'EEEE')}`}
      title={dateLabel}
      meta={
        <StatusBadge
          status={meeting.status ?? 'draft'}
          tones={MEETING_STATUS.tones}
          labels={MEETING_STATUS.labels}
        />
      }
      breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: format(dateObj, 'MMM d, yyyy') }]}
      linkAs={Link}
      actions={<MeetingActions meetingId={meeting.id} />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {/* Minutes / agenda */}
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <ScrollText className="size-4 text-muted" aria-hidden />
                {isUpcoming ? 'Agenda' : 'Minutes'}
              </CardTitle>
              <CardDescription>
                {isUpcoming
                  ? 'Notes for the upcoming meeting. Record minutes once it has happened.'
                  : meeting.status === 'approved'
                    ? 'The approved record of this meeting.'
                    : 'Draft — not yet approved by the board.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {meeting.ai_summary ? (
                <div className="max-w-prose space-y-3 text-base leading-relaxed text-foreground">
                  {meeting.ai_summary.split('\n\n').map((para, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <EmptyState
                  variant="compact"
                  icon={<ScrollText aria-hidden />}
                  title={isUpcoming ? 'No agenda yet' : 'No minutes recorded'}
                  description="Edit this meeting to add them."
                />
              )}
            </CardContent>
          </Card>

          {/* Action items — boards act on these */}
          {actionItems === null ? (
            <LoadFailed
              what="action items"
              hint="The minutes above are correct; only this meeting's action items are missing."
            />
          ) : (
            <ActionItemsSection meetingId={meeting.id} items={actionItems} today={todayIso} />
          )}

          {/* Motions */}
          {motions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="flex items-center gap-2">
                  <Gavel className="size-4 text-muted" aria-hidden />
                  Motions &amp; votes
                </CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border border-t border-border">
                {motions.map((m, i) => (
                  <li key={m.id ?? i} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-medium text-foreground">
                        {m.text ?? m.motion ?? `Motion ${i + 1}`}
                      </p>
                      {m.yea != null || m.nay != null || m.abstain != null ? (
                        <p className="num flex flex-wrap gap-x-4 text-xs text-muted">
                          {m.yea != null ? <span>Yea <strong className="text-foreground">{m.yea}</strong></span> : null}
                          {m.nay != null ? <span>Nay <strong className="text-foreground">{m.nay}</strong></span> : null}
                          {m.abstain != null ? (
                            <span>Abstain <strong className="text-foreground">{m.abstain}</strong></span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    {m.result ? (
                      <StatusPill
                        tone={motionTone(m.result)}
                        label={m.result.charAt(0).toUpperCase() + m.result.slice(1)}
                        className="self-start"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Raw transcript — audit trail, collapsed */}
          {meeting.raw_transcript ? (
            <details className="group rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-foreground">Raw transcript</span>
                  <span className="num text-xs text-muted">
                    Kept for the audit trail · {meeting.raw_transcript.length.toLocaleString()} characters
                  </span>
                </span>
                <span className="text-sm font-medium text-primary">
                  <span className="group-open:hidden">Show</span>
                  <span className="hidden group-open:inline">Hide</span>
                </span>
              </summary>
              <div className="border-t border-border px-5 py-4">
                <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground-secondary">
                  {meeting.raw_transcript}
                </pre>
              </div>
            </details>
          ) : null}
        </div>

        {/* Side rail: facts + attendees */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueList className="sm:grid-cols-2 lg:grid-cols-1">
                <KeyValue label="Date" value={format(dateObj, 'EEEE, MMMM d, yyyy')} />
                <KeyValue label="Type" value={typeLabel} />
                <KeyValue
                  label="Approval"
                  value={
                    meeting.approved_at || meeting.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="size-4 text-success" aria-hidden />
                        Approved
                        {meeting.approved_at ? ` ${format(new Date(meeting.approved_at), 'MMM d, yyyy')}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-foreground-secondary">
                        <Clock className="size-4 text-muted" aria-hidden />
                        {isUpcoming ? 'Not held yet' : 'Awaiting approval'}
                      </span>
                    )
                  }
                />
                {/* BL-050 (M1): when the notice was posted (FL §720.303(2)). */}
                {M1_APPLIED ? (
                  <KeyValue
                    label="Notice posted"
                    value={<NoticePostedControl meetingId={meeting.id} postedAt={meeting.notice_posted_at ?? null} />}
                  />
                ) : null}
                {meeting.created_at ? (
                  <KeyValue label="Created" value={format(new Date(meeting.created_at), 'MMM d, yyyy')} />
                ) : null}
              </KeyValueList>
            </CardContent>
          </Card>

          {/* BL-118: send the meeting notice to owners. */}
          <MeetingNoticeSection
            meeting={{ id: meeting.id, meetingDate: meeting.meeting_date, meetingType: meeting.meeting_type, status: meeting.status }}
          />

          {/* BL-122: annual / members' meeting quorum kit. */}
          <QuorumKitCard meetingId={meeting.id} meetingType={meeting.meeting_type} />

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center justify-between gap-2">
                Attendees
                {attendees.length > 0 ? (
                  <Badge variant="neutral" className="num">
                    {attendees.length}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attendees.length > 0 ? (
                <ul className="space-y-2.5">
                  {attendees.map((a) => (
                    <li key={a} className="flex items-center gap-2.5 text-sm text-foreground">
                      <Avatar name={a} size="sm" />
                      <span className="min-w-0 truncate">{a}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No attendee list recorded.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
