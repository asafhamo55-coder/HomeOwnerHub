import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, StatusPill, type StatusTone } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { NOT_LEGAL_ADVICE } from '@/lib/budget-adoption/law'
import { countdownPhrase, type AdoptionMeeting, type AdoptionStep, type StepState } from '@/lib/budget-adoption/model'
import type { LoadedKit } from '@/lib/budget-adoption/load'
import { DateRecorder, MeetingPicker, SpecialAssessmentToggle, type MeetingOption } from './AdoptionControls'

const STATE_PILL: Record<StepState, { tone: StatusTone; label: string }> = {
  done: { tone: 'success', label: 'Done' },
  todo: { tone: 'info', label: 'To do' },
  warn: { tone: 'warning', label: 'Check' },
  waiting: { tone: 'neutral', label: 'Waiting' },
  next: { tone: 'brand', label: 'Next' },
}

const MEETING_TYPE: Record<string, string> = {
  regular: 'Board meeting',
  special: 'Special meeting',
  annual: 'Annual meeting',
  emergency: 'Emergency meeting',
}

function meetingOption(m: AdoptionMeeting): MeetingOption {
  return { id: m.id, label: `${MEETING_TYPE[m.type ?? ''] ?? 'Meeting'} · ${formatDay(m.date)}` }
}

/**
 * BL-138: the budget adoption kit on a draft or approved budget — the
 * steps to adopt it lawfully and the one date to watch. Board-only (the
 * page's caller checks); nothing here sends anything.
 */
export function AdoptionKit({
  budgetId,
  loaded,
  upcoming,
  today,
}: {
  budgetId: string
  loaded: LoadedKit | null
  upcoming: AdoptionMeeting[] | null
  today: string
}) {
  if (!loaded) {
    return <LoadFailed what="the budget adoption checklist" hint="The budget itself is unaffected." />
  }
  const { kit, record, meeting, read } = loaded
  const options = (upcoming ?? []).map(meetingOption)
  if (meeting && !options.some((o) => o.id === meeting.id)) options.unshift(meetingOption(meeting))

  const controls = (step: AdoptionStep) => {
    switch (step.id) {
      case 'meeting':
        return <MeetingPicker budgetId={budgetId} current={meeting ? record.meetingId : null} options={options} />
      case 'notice':
        return kit.jurisdiction === 'FL' && meeting ? <SpecialAssessmentToggle budgetId={budgetId} special={record.special} /> : null
      case 'record':
        return step.state === 'waiting' ? null : (
          <DateRecorder
            budgetId={budgetId}
            kind="adopted"
            current={record.adoptedOn}
            today={today}
            label="Date adopted"
            saveLabel="Record adoption"
            done="Adoption recorded."
          />
        )
      case 'owner_notice':
        return step.state === 'waiting' ? null : (
          <DateRecorder
            budgetId={budgetId}
            kind="owner_notice"
            current={record.ownerNoticeOn}
            today={today}
            label="Date sent to owners"
            saveLabel="Mark as sent"
            done="Owner notice recorded."
          />
        )
      default:
        return null
    }
  }

  return (
    <Card id="adoption-kit">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted" aria-hidden />
          Adopt this budget
        </CardTitle>
        <CardDescription>
          The steps to adopt next year’s budget, with your state’s deadlines. Nothing here is sent to anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {read.state === 'unverified' ? (
          <Alert variant="warning" title="Saved progress couldn’t be verified">
            The adoption record on file wasn’t saved by a board member’s checklist, so it’s ignored. Save each step again.
          </Alert>
        ) : null}
        {kit.countdown ? (
          <Alert
            variant={kit.countdown.tone === 'danger' ? 'error' : kit.countdown.tone === 'warning' ? 'warning' : 'info'}
            title={`${kit.countdown.label}: ${formatDay(kit.countdown.date)}`}
          >
            {countdownPhrase(kit.countdown.daysLeft).replace(/^./, (c) => c.toUpperCase())}.
          </Alert>
        ) : kit.complete ? (
          <Alert variant="success" title="Adopted and sent to owners">
            Next, bill next year’s dues at the new amount.
          </Alert>
        ) : null}
        <ol className="space-y-4">
          {kit.steps.map((step, i) => {
            const pill = STATE_PILL[step.state]
            const control = controls(step)
            return (
              <li key={step.id} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {i + 1}. {step.title}
                  </h3>
                  <StatusPill tone={pill.tone} label={pill.label} />
                </div>
                {step.detail.map((d) => (
                  <p key={d} className="text-sm text-foreground-secondary">
                    {d}
                  </p>
                ))}
                {control}
                {step.href && step.hrefLabel ? (
                  <Button asChild size="sm" variant={step.state === 'todo' ? 'primary' : 'secondary'}>
                    <Link href={step.href}>{step.hrefLabel}</Link>
                  </Button>
                ) : null}
                {step.citations.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-muted">What the statute says</summary>
                    <ul className="mt-1 space-y-1.5 text-xs text-foreground-secondary">
                      {step.citations.map((c) => (
                        <li key={`${c.cite}|${c.quote.slice(0, 24)}`}>
                          <span className="font-semibold">{c.cite}:</span> “{c.quote}”
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted">{NOT_LEGAL_ADVICE} Check your governing documents and ask your association’s attorney.</p>
      </CardContent>
    </Card>
  )
}
