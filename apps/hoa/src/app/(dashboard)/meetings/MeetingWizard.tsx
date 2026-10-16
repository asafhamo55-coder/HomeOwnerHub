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
  Field,
  Input,
  KeyValue,
  KeyValueList,
  Select,
  Textarea,
  WizardStepper,
  useConfirm,
  useToast,
  type WizardStep as StepperStep,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { responseErrorMessage } from '@/lib/api/client'
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
  const confirm = useConfirm()
  const toast = useToast()
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
        setSuggestionsError(await responseErrorMessage(res, 'Could not generate suggestions.'))
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
      <div className="flex min-h-6 items-center justify-between text-xs text-muted" aria-live="polite">
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
              const ok = await confirm({
                title: 'Discard meeting draft?',
                description:
                  'Your unsaved changes will be lost. This cannot be undone.',
                confirmLabel: 'Discard',
                destructive: true,
              })
              if (!ok) return
              try {
                await discardDraft(draftId)
                toast({ tone: 'success', message: 'Draft discarded.' })
                router.push('/meetings')
              } catch (err) {
                toast({
                  tone: 'error',
                  message:
                    err instanceof Error ? err.message : 'Could not discard draft.',
                })
              }
            }}
            className="rounded-md px-1.5 py-0.5 font-medium text-danger hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Field label="Meeting date" required error={meetingDate ? undefined : 'Pick the date of the meeting.'}>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </Field>
          <Field
            label="Meeting type"
            labelAside={
              aiAppliedFields.has('meeting_type') ? (
                <AiChip
                  title={reasoningFor('meeting_type') ?? 'AI-suggested value'}
                  onClear={() => {
                    const next = new Set(aiAppliedFields)
                    next.delete('meeting_type')
                    setAIAppliedFields(next)
                  }}
                />
              ) : null
            }
          >
            <Select
              value={meetingType}
              onValueChange={(v) => {
                setMeetingType(v as MeetingType)
                if (aiAppliedFields.has('meeting_type')) {
                  const next = new Set(aiAppliedFields)
                  next.delete('meeting_type')
                  setAIAppliedFields(next)
                }
              }}
            >
              <option value="regular">Regular (board) meeting</option>
              <option value="annual">Annual meeting</option>
              <option value="special">Special meeting</option>
              <option value="emergency">Emergency meeting</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Attendees"
          optional
          hint="One per line, or separated by commas."
          labelAside={
            aiAppliedFields.has('attendees') ? (
              <AiChip
                title={reasoningFor('attendees') ?? 'AI-extracted from transcript'}
                onClear={() => {
                  const next = new Set(aiAppliedFields)
                  next.delete('attendees')
                  setAIAppliedFields(next)
                }}
              />
            ) : null
          }
        >
          <Textarea
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
        </Field>

        <Field
          label="Transcript"
          required
          hint={`${transcript.length.toLocaleString()} characters · at least 50 needed to draft minutes.`}
          labelAside={
            <AiRewriteButton
              value={transcript}
              onChange={setTranscript}
              context="HOA meeting transcript or notes — the AI will later turn this into formal minutes"
            />
          }
        >
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            placeholder="Paste the raw transcript or your notes from the meeting. The AI will turn it into formal minutes you can edit and approve via BarBGate."
            className="font-mono text-sm sm:text-xs"
          />
        </Field>

        <div className="rounded-lg border border-accent/30 bg-accent-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles className="size-4 text-accent-fg" aria-hidden /> AI suggestions
              </p>
              <p className="text-xs text-foreground-secondary">
                Pull meeting type + attendee names from the transcript so you don&apos;t retype them.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSuggest}
              loading={suggesting}
              disabled={transcript.trim().length < 50}
            >
              Suggest values
            </Button>
          </div>
          {suggestionsError ? (
            <p className="mt-2 text-xs font-medium text-warning" role="status">{suggestionsError}</p>
          ) : null}
        </div>

        {aiError ? (
          <Alert variant="warning" title="AI summary unavailable">
            {aiError}
          </Alert>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={async () => {
              await persistDraft(step)
              toast({
                tone: 'success',
                message: 'Draft saved — pick up later from the dashboard.',
              })
              router.push('/meetings')
            }}
          >
            Save draft & exit
          </Button>
          <Button
            onClick={handleSummarize}
            disabled={!canSummarize || !meetingDate}
            loading={aiPending}
            icon={<Sparkles aria-hidden />}
          >
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
        <div className="py-12 text-center text-sm text-muted">Summarizing…</div>
      </div>
    )
  }

  if (step === 'review' && aiSummary !== null) {
    return (
      <div className="space-y-5">
        {stepperHeader}
        <Card variant="subtle">
          <CardContent className="pt-5">
            <KeyValueList className="sm:grid-cols-3">
              <KeyValue label="Date" value={meetingDate} />
              <KeyValue label="Type" value={TYPE_LABELS[meetingType]} />
              <KeyValue
                label="Attendees"
                value={`${attendees.split(/[\n,]/).filter((s) => s.trim()).length} listed`}
              />
            </KeyValueList>
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
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-subtle text-success">
            <CheckCircle2 className="size-7" aria-hidden />
          </div>
          <div className="mt-4 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Minutes filed</h2>
            <p className="text-sm text-muted">
              The approved minutes are now on file for {meetingDate}.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Record another
            </Button>
            <Button onClick={() => router.push(createdId ? `/meetings/${createdId}` : '/meetings')}>
              {createdId ? 'Open the minutes' : 'View all meetings'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

const TYPE_LABELS: Record<MeetingType, string> = {
  regular: 'Regular board meeting',
  special: 'Special meeting',
  annual: 'Annual meeting',
  emergency: 'Emergency meeting',
}

/** "Filled by AI" marker on a field label; clicking it drops the AI tag. */
function AiChip({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-subtle px-2 py-0.5 text-2xs font-medium text-accent-fg hover:bg-accent-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sparkles className="size-3" aria-hidden /> Filled by AI · clear
    </button>
  )
}
