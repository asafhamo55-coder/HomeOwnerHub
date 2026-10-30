import { format } from 'date-fns'
import { CalendarClock, CheckCircle2, Clock, Flag, Gavel, Mail, XCircle } from 'lucide-react'
import { KeyValue, KeyValueList, LoadFailed, Timeline, type TimelineItem } from '@homeowner-portal/ui'
import type { SubmissionAttachment } from '@/lib/submission-attachments'
import type { MyViolationThread } from '@/lib/violation-response-load'
import type { ResidentViolationView } from '@/lib/violation-response'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { PhotoViewer } from '@/components/PhotoViewer'
import { Panel, ScreenHeader, Section } from '@/components/resident/screen'
import { ResidentStatus } from '@/components/resident/status'
import { Conversation, ThreadClosed } from '@/components/resident/Conversation'
import { RespondToBoardForm } from './RespondToBoardForm'
import { RequestHearingForm } from './RequestHearingForm'
import type { ResidentHearingLoad } from '@/lib/violation-hearings/queries'
import { HEARING_OUTCOME_LABEL, type ResidentHearingView } from '@/lib/violation-hearings/rules'

// BL-129: a violation on the resident's own home — the notice, the cure-by
// date, the board's photos, the history, and the resident's response.

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

const timeEl = (iso: string, pattern = 'PP') => <time dateTime={iso}>{format(new Date(iso), pattern)}</time>

export function HomeViolationView({
  violation: v,
  thread,
  threadFailed,
  canRespond,
  attachments,
  hearing = { kind: 'off' },
}: {
  violation: ResidentViolationView
  thread: MyViolationThread | null
  threadFailed: boolean
  canRespond: boolean
  attachments: SubmissionAttachment[]
  /** BL-133 (M4_APPLIED). `off` renders nothing. */
  hearing?: ResidentHearingLoad
}) {
  const overdue = v.cureBy ? new Date(v.cureBy) < new Date() && !v.closed : false

  const history: TimelineItem[] = []
  if (v.createdAt) history.push({ id: 'opened', title: 'Opened by the board', time: timeEl(v.createdAt), icon: <Flag />, tone: 'neutral' })
  if (v.noticeSentAt) {
    history.push({
      id: 'sent',
      title: 'Notice sent',
      meta: v.curePeriodDays ? `${v.curePeriodDays} days to fix it` : undefined,
      time: timeEl(v.noticeSentAt),
      icon: <Mail />,
      tone: 'info',
    })
  }
  if (v.cureBy && !v.closed) {
    history.push({
      id: 'cure',
      title: overdue ? 'Fix-by date passed' : 'Fix by',
      time: timeEl(v.cureBy),
      icon: overdue ? <Clock /> : <CalendarClock />,
      tone: overdue ? 'danger' : 'warning',
    })
  }
  if (v.finesStartedOn) {
    history.push({
      id: 'fines',
      title: 'Fines started',
      meta: v.dailyFine != null ? `$${v.dailyFine} a day` : undefined,
      time: timeEl(v.finesStartedOn),
      icon: <Gavel />,
      tone: 'danger',
    })
  }
  if (v.closed && v.resolvedAt) {
    const dropped = v.status === 'dismissed' || v.status === 'waived'
    history.push({
      id: 'closed',
      title: v.status === 'dismissed' ? 'Dismissed' : v.status === 'waived' ? 'Waived' : 'Resolved',
      time: timeEl(v.resolvedAt),
      icon: dropped ? <XCircle /> : <CheckCircle2 />,
      tone: dropped ? 'neutral' : 'success',
    })
  }

  return (
    <div className="space-y-8">
      <ScreenHeader
        back={{ href: '/resident', label: 'My home' }}
        title={humanize(v.violationType)}
        meta={<ResidentStatus kind="violation" status={v.status} />}
      />

      <Section label="The notice">
        <Panel className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{v.description}</p>
          <KeyValueList className="border-t border-border pt-4">
            <KeyValue label="Rule cited" value={v.ruleCited} />
            <KeyValue label="Notice sent" value={v.noticeSentAt ? format(new Date(v.noticeSentAt), 'PP') : 'Not yet'} />
            <KeyValue
              label="Fix by"
              value={
                v.cureBy ? (
                  <span className={overdue ? 'font-medium text-danger' : undefined}>
                    {format(new Date(v.cureBy), 'PP')}
                    {overdue ? ' (passed)' : ''}
                  </span>
                ) : null
              }
            />
          </KeyValueList>
          {v.letter ? (
            <details className="border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-medium text-primary">Read the letter the board sent</summary>
              <div className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-subtle p-3 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {v.letter}
              </div>
            </details>
          ) : !v.noticeSentAt ? (
            <p className="border-t border-border pt-4 text-sm text-muted">
              The board hasn’t sent a formal notice yet. You can still respond below.
            </p>
          ) : null}
        </Panel>
      </Section>

      {v.photos.length > 0 ? (
        <Section label="Photos from the board">
          <Panel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <PhotoViewer
                photos={v.photos.map((url, i) => ({ src: url, alt: `Photo ${i + 1} of the violation` }))}
              />
            </div>
          </Panel>
        </Section>
      ) : null}

      <Section label="History">
        <Panel>
          {history.length > 0 ? <Timeline items={history} label="Violation history" /> : <p className="text-sm text-muted">Nothing recorded yet.</p>}
        </Panel>
      </Section>

      {hearing.kind !== 'off' ? (
        <Section label="Hearing">
          <Panel className="space-y-4">
            {hearing.kind === 'failed' ? (
              <LoadFailed what="your hearing" />
            ) : (
              <HearingStatusBlock hearing={hearing.hearing} />
            )}
            {hearing.kind === 'ok' &&
            canRespond &&
            // 0068 (SEC-N5) accepts a request only once the notice went out.
            (Boolean(v.noticeSentAt) || v.status === 'notice_sent' || v.status === 'fined') &&
            !hearing.hearing?.requestedAt &&
            hearing.hearing?.status !== 'held' &&
            hearing.hearing?.status !== 'cancelled' ? (
              <div className="border-t border-border pt-4">
                <RequestHearingForm violationId={v.id} />
              </div>
            ) : null}
          </Panel>
        </Section>
      ) : null}

      <Section label="Respond to the board">
        <Panel className="space-y-4">
          {threadFailed ? (
            <LoadFailed what="your response" />
          ) : (
            <Conversation
              messages={thread?.messages ?? []}
              emptyText="Fixed it, or think the notice is wrong? Tell the board here. Your response goes on the record for this violation."
            />
          )}
          {canRespond ? (
            <div className="border-t border-border pt-4">
              <RespondToBoardForm violationId={v.id} hasThread={Boolean(thread)} />
            </div>
          ) : v.closed ? (
            <ThreadClosed>This violation is closed, so it no longer takes responses.</ThreadClosed>
          ) : null}
        </Panel>
      </Section>

      {thread ? (
        <Section label="Your photos & documents">
          <Panel>
            <SubmissionAttachments threadType="ticket" parentId={thread.ticketId} attachments={attachments} />
          </Panel>
        </Section>
      ) : null}
    </div>
  )
}

function dayText(day: string): string {
  return format(new Date(`${day}T12:00:00Z`), 'PP')
}

// BL-133: what the resident can see of the hearing. The day and place only
// once the board has sent the notice (residentHearingView).
function HearingStatusBlock({ hearing }: { hearing: ResidentHearingView | null }) {
  if (!hearing) {
    return (
      <p className="text-sm text-foreground-secondary">
        If you disagree with this notice or a proposed fine, you can ask for a hearing. The board schedules it and sends you
        a written notice with the date and place.
      </p>
    )
  }
  return (
    <KeyValueList>
      {hearing.requestedAt ? <KeyValue label="You asked for a hearing" value={format(new Date(hearing.requestedAt), 'PP')} /> : null}
      <KeyValue
        label="Hearing"
        value={
          hearing.status === 'cancelled'
            ? 'Cancelled by the board'
            : hearing.hearingOn
              ? `${dayText(hearing.hearingOn)}${hearing.hearingTime ? ` at ${hearing.hearingTime}` : ''}`
              : 'The board will send you a notice with the date'
        }
      />
      {hearing.location && hearing.status !== 'cancelled' ? <KeyValue label="Where" value={hearing.location} /> : null}
      {hearing.outcome ? <KeyValue label="Decision" value={HEARING_OUTCOME_LABEL[hearing.outcome]} /> : null}
      {hearing.paymentDueOn ? <KeyValue label="Fine due by" value={dayText(hearing.paymentDueOn)} /> : null}
    </KeyValueList>
  )
}
