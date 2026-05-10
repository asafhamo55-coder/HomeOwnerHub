'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react'
import {
  Alert,
  BarBGate,
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
  WizardStepper,
  type WizardStep as StepperStep,
} from '@homeowner-portal/ui'
import { approveMeetingMinutes } from '@/lib/meetings'
import {
  saveDraft,
  markDraftCompleted,
  discardDraft,
  type WizardDraft,
} from '@/lib/drafts'

type Step = 'capture' | 'summarizing' | 'review' | 'done'
// Schema-aligned slugs (hoa_meeting_minutes_meeting_type_check).
type MeetingType = 'regular' | 'special' | 'annual' | 'emergency'

interface FieldSuggestion {
  field: string
  value: string
  reasoning: string
}

interface MeetingWizardProps {
  initialDraft?: WizardDraft | null
}

interface DraftPayload {
  meetingDate?: string
  meetingType?: MeetingType
  transcript?: string
  attendees?: string
  aiSummary?: string | null
}

const STEPPER_STEPS: StepperStep[] = [
  { id: 'capture', label: 'Transcript', description: 'Paste the meeting transcript' },
  { id: 'review', label: 'Review & approve', description: 'Edit AI minutes via BarBGate' },
  { id: 'done', label: 'Filed', description: 'Minutes on the record' },
]

function stepIndex(step: Step): number {
  if (step === 'capture' || step === 'summarizing') return 0
  if (step === 'review') return 1
  return 2
}

export function MeetingWizard({ initialDraft }: MeetingWizardProps) {
  const router = useRouter()
  const initialPayload = (initialDraft?.payload ?? {}) as DraftPayload

  const [step, setStep] = useState<Step>(() => {
    if (initialPayload.aiSummary) return 'review'
    return 'capture'
  })
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null)

  const [meetingDate, setMeetingDate] = useState(
    initialPayload.meetingDate ?? new Date().toISOString().slice(0, 10),
  )
  const [meetingType, setMeetingType] = useState<MeetingType>(
    initialPayload.meetingType ?? 'regular',
  )
  const [transcript, setTranscript] = useState(initialPayload.transcript ?? '')
  const [attendees, setAttendees] = useState(initialPayload.attendees ?? '')

  const [aiSummary, setAISummary] = useState<string | null>(
    initialPayload.aiSummary ?? null,
  )
  const [aiError, setAIError] = useState<string | null>(null)
  const [aiPending, startAI] = useTransition()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)

  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([])
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [suggesting, startSuggesting] = useTransition()
  const [aiAppliedFields, setAIAppliedFields] = useState<Set<string>>(new Set())

  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(
    initialDraft?.updated_at ? new Date(initialDraft.updated_at) : null,
  )

  const lastSavedRef = useRef<string>('')
  async function persistDraft(currentStep: Step) {
    const payload: DraftPayload = {
      meetingDate,
      meetingType,
      transcript,
      attendees,
      aiSummary,
    }
    const serialized = JSON.stringify({ payload, currentStep })
    if (serialized === lastSavedRef.current) return
    lastSavedRef.current = serialized

    setDraftSaving(true)
    try {
      const result = await saveDraft({
        draftId: draftId ?? undefined,
        kind: 'meeting',
        payload: payload as unknown as Record<string, unknown>,
        currentStep,
        stepIndex: stepIndex(currentStep),
        totalSteps: STEPPER_STEPS.length,
      })
      if (result.ok) {
        setDraftId(result.draftId)
        setDraftSavedAt(new Date())
      }
    } finally {
      setDraftSaving(false)
    }
  }

  useEffect(() => {
    void persistDraft(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function handleSuggest() {
    setSuggestionsError(null)
    setSuggestions([])
    startSuggesting(async () => {
      const res = await fetch('/api/ai/suggest-fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'meeting',
          partialState: { meetingDate, transcript: transcript.slice(0, 4000) },
          fields: ['meeting_type', 'attendees'],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSuggestionsError(body?.message ?? 'Could not generate suggestions.')
        return
      }
      const body = (await res.json()) as { suggestions: FieldSuggestion[] }
      const list = body.suggestions ?? []
      setSuggestions(list)
      const next = new Set(aiAppliedFields)
      for (const s of list) {
        if (s.field === 'meeting_type') {
          const v = s.value.trim().toLowerCase()
          if (v === 'regular' || v === 'special' || v === 'annual' || v === 'emergency') {
            setMeetingType(v)
            next.add('meeting_type')
          }
        } else if (s.field === 'attendees') {
          // Only apply if user hasn't typed any attendees yet, to avoid clobbering.
          if (!attendees.trim()) {
            setAttendees(s.value)
            next.add('attendees')
          }
        }
      }
      setAIAppliedFields(next)
    })
  }

  function handleSummarize() {
    setAIError(null)
    setAISummary(null)
    startAI(async () => {
      const res = await fetch('/api/ai/meeting-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingDate, transcript }),
      })
      let summary: string
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAIError(body?.message ?? 'AI is offline.')
        summary = `[AI summary unavailable — edit the raw transcript below into formal minutes.]

Meeting: ${meetingDate} (${meetingType})
Attendees: ${attendees || '—'}

Sections to cover: topics discussed, decisions made (with vote counts), action items (owner — task — due date), next meeting.

──────────────────────────────────────────────────────────────────────
RAW TRANSCRIPT
──────────────────────────────────────────────────────────────────────
${transcript}`
      } else {
        const body = (await res.json()) as { summary: string }
        summary = body.summary
      }
      setAISummary(summary)
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
      if (draftId) await markDraftCompleted(draftId)
      setStep('done')
    })
  }

  function reasoningFor(field: string): string | null {
    return suggestions.find((s) => s.field === field)?.reasoning ?? null
  }

  const stepperHeader = (
    <div className="space-y-3 border-b border-border pb-4">
      <WizardStepper
        steps={STEPPER_STEPS}
        currentIndex={stepIndex(step)}
        vertical={false}
      />
      <div className="flex items-center justify-between text-xs text-muted-fg">
        <span>
          {draftSaving ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving draft…
            </span>
          ) : draftSavedAt ? (
            <span className="flex items-center gap-1">
              <Save className="h-3 w-3" /> Draft saved
            </span>
          ) : null}
        </span>
        {draftId && step !== 'done' ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Discard this in-progress meeting? This cannot be undone.')) return
              await discardDraft(draftId)
              router.push('/meetings')
            }}
            className="text-muted-fg hover:text-destructive"
          >
            Discard draft
          </button>
        ) : null}
      </div>
    </div>
  )

  if (step === 'capture') {
    const canSummarize = transcript.trim().length >= 50 && !aiPending
    return (
      <div className="space-y-5">
        {stepperHeader}

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
            <div className="flex items-center justify-between">
              <label htmlFor="meeting-type" className="text-sm font-medium text-muted">
                Meeting type
              </label>
              {aiAppliedFields.has('meeting_type') ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(aiAppliedFields)
                    next.delete('meeting_type')
                    setAIAppliedFields(next)
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:bg-primary/20"
                  title={reasoningFor('meeting_type') ?? 'AI-suggested value'}
                >
                  <Sparkles className="h-2.5 w-2.5" /> AI · clear
                </button>
              ) : null}
            </div>
            <select
              id="meeting-type"
              value={meetingType}
              onChange={(e) => {
                setMeetingType(e.target.value as MeetingType)
                if (aiAppliedFields.has('meeting_type')) {
                  const next = new Set(aiAppliedFields)
                  next.delete('meeting_type')
                  setAIAppliedFields(next)
                }
              }}
              className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="regular">Regular (board) meeting</option>
              <option value="annual">Annual meeting</option>
              <option value="special">Special meeting</option>
              <option value="emergency">Emergency meeting</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="attendees" className="text-sm font-medium text-muted">
              Attendees{' '}
              <span className="text-muted-fg">(optional, one per line or comma-separated)</span>
            </label>
            {aiAppliedFields.has('attendees') ? (
              <button
                type="button"
                onClick={() => {
                  const next = new Set(aiAppliedFields)
                  next.delete('attendees')
                  setAIAppliedFields(next)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:bg-primary/20"
                title={reasoningFor('attendees') ?? 'AI-extracted from transcript'}
              >
                <Sparkles className="h-2.5 w-2.5" /> AI · clear
              </button>
            ) : null}
          </div>
          <Textarea
            id="attendees"
            value={attendees}
            onChange={(e) => {
              setAttendees(e.target.value)
              if (aiAppliedFields.has('attendees')) {
                const next = new Set(aiAppliedFields)
                next.delete('attendees')
                setAIAppliedFields(next)
              }
            }}
            rows={2}
            placeholder="Linda Williams (President)&#10;John Smith (Treasurer)&#10;..."
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

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI suggestions
              </p>
              <p className="text-xs text-muted-fg">
                Pull meeting type + attendee names from the transcript so you don&apos;t retype them.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              loading={suggesting}
              disabled={transcript.trim().length < 50}
            >
              Suggest values
            </Button>
          </div>
          {suggestionsError ? (
            <p className="mt-2 text-xs text-amber-700">{suggestionsError}</p>
          ) : null}
        </div>

        {aiError ? (
          <Alert variant="warning" title="AI summary unavailable">
            {aiError}
          </Alert>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push('/meetings')}>
            Save & exit
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
      <div className="space-y-5">
        {stepperHeader}
        <div className="py-12 text-center text-sm text-muted-fg">Summarizing…</div>
      </div>
    )
  }

  if (step === 'review' && aiSummary !== null) {
    return (
      <div className="space-y-5">
        {stepperHeader}
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
      <div className="space-y-5">
        {stepperHeader}
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="mt-4 space-y-1">
            <h2 className="text-xl font-bold text-muted">Minutes filed</h2>
            <p className="text-sm text-muted-fg">
              The approved minutes are now on file for {meetingDate}.
              {createdId ? '' : ''}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.push('/meetings')}>
              View all meetings
            </Button>
            <Button onClick={() => window.location.reload()}>Record another</Button>
          </div>
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
