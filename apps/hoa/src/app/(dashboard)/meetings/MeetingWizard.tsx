'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Sparkles } from 'lucide-react'
import {
  Alert,
  BarBGate,
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
} from '@homeownerhub/ui'
import { approveMeetingMinutes } from '@/lib/meetings'

type Step = 'capture' | 'summarizing' | 'review' | 'done'

export function MeetingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [meetingType, setMeetingType] =
    useState<'board' | 'annual' | 'special' | 'committee'>('board')
  const [transcript, setTranscript] = useState('')
  const [attendees, setAttendees] = useState('')

  const [aiSummary, setAISummary] = useState<string | null>(null)
  const [aiError, setAIError] = useState<string | null>(null)
  const [aiPending, startAI] = useTransition()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)

  function handleSummarize() {
    setAIError(null)
    setAISummary(null)
    startAI(async () => {
      const res = await fetch('/api/ai/meeting-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingDate, transcript }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // AI offline: fall through to BarBGate with a placeholder so the
        // user can still write the minutes by hand.
        setAIError(body?.message ?? 'AI is offline.')
        setAISummary(
          `[AI summary unavailable.]\n\nMeeting: ${meetingDate} (${meetingType})\nAttendees: ${attendees || '—'}\n\nWrite the minutes here. Cover: topics discussed, decisions made (with vote counts), action items (owner — task — due date), next meeting.`,
        )
        setStep('review')
        return
      }
      const body = (await res.json()) as { summary: string }
      setAISummary(body.summary)
      setStep('review')
    })
  }

  function handleApprove(approved: string) {
    if (!aiSummary) return
    setSubmitError(null)
    startSubmit(async () => {
      const result = await approveMeetingMinutes({
        meetingDate,
        meetingType,
        rawTranscript: transcript,
        aiSummary,
        approvedSummary: approved,
        attendees: attendees
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      })
      if (!result.ok) {
        setSubmitError(result.error ?? 'Could not save the minutes.')
        return
      }
      setCreatedId(result.meetingId ?? null)
      setStep('done')
    })
  }

  if (step === 'capture') {
    const canSummarize = transcript.trim().length >= 50 && !aiPending
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="meeting-date" className="text-sm font-medium text-muted">
              Meeting date
            </label>
            <Input
              id="meeting-date"
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="meeting-type" className="text-sm font-medium text-muted">
              Meeting type
            </label>
            <select
              id="meeting-type"
              value={meetingType}
              onChange={(e) =>
                setMeetingType(e.target.value as typeof meetingType)
              }
              className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="board">Board meeting</option>
              <option value="annual">Annual meeting</option>
              <option value="special">Special meeting</option>
              <option value="committee">Committee meeting</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="attendees" className="text-sm font-medium text-muted">
            Attendees <span className="text-muted-fg">(optional, one per line or comma-separated)</span>
          </label>
          <Textarea
            id="attendees"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            rows={2}
            placeholder="Linda Williams (President)\nJohn Smith (Treasurer)\n..."
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="transcript" className="text-sm font-medium text-muted">
            Transcript <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            placeholder="Paste the raw transcript or your notes from the meeting. The AI will turn it into formal minutes you can edit and approve via BarBGate."
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-fg">
            {transcript.length.toLocaleString()} characters · need at least 50.
          </p>
        </div>

        {aiError ? (
          <Alert variant="warning" title="AI summary unavailable">
            {aiError}
          </Alert>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            Cancel
          </Button>
          <Button onClick={handleSummarize} disabled={!canSummarize} loading={aiPending}>
            <Sparkles className="h-4 w-4" />
            Generate minutes
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'summarizing') {
    return (
      <div className="py-12 text-center text-sm text-muted-fg">Summarizing…</div>
    )
  }

  if (step === 'review' && aiSummary !== null) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <Detail label="Date">{meetingDate}</Detail>
            <Detail label="Type">{meetingType}</Detail>
            <Detail label="Attendees">
              {attendees.split(/[\n,]/).filter((s) => s.trim()).length} listed
            </Detail>
          </CardContent>
        </Card>

        {submitError ? (
          <Alert variant="error" title="Couldn't save">
            {submitError}
          </Alert>
        ) : null}

        <BarBGate
          content={aiSummary}
          title="Approve before circulating"
          description="The board owns the wording of the minutes. Read carefully, edit anything that's wrong, then approve."
          approveLabel="Approve & file minutes"
          rejectLabel="Back to transcript"
          onApprove={handleApprove}
          onReject={() => setStep('capture')}
          isLoading={submitting}
        />
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="space-y-5 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-muted">Minutes filed</h2>
          <p className="text-sm text-muted-fg">
            The approved minutes are now on file for {meetingDate}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push('/meetings')}>
            View all meetings
          </Button>
          <Button onClick={() => window.location.reload()}>Record another</Button>
        </div>
      </div>
    )
  }

  return null
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-fg">{label}</p>
      <p className="mt-0.5 text-sm text-muted">{children}</p>
    </div>
  )
}
