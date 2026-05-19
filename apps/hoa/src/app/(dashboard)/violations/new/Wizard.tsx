'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Alert,
  Badge,
  BarBGate,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  Textarea,
  WizardStepper,
  useConfirm,
  useToast,
  type WizardStep as StepperStep,
} from '@homeowner-portal/ui'
import { createApprovedViolation } from '@/lib/violations'
import {
  saveDraft,
  markDraftCompleted,
  discardDraft,
  type WizardDraft,
} from '@/lib/drafts'

interface WizardProperty {
  id: string
  address: string
  unit_number: string | null
}

interface AnalysisResult {
  description: string
  violationType: string
  ccrSection: string | null
  severity: 'low' | 'medium' | 'high' | null
  confidence: 'high' | 'medium' | 'low' | null
  letterDraft: string
  warnings: string[]
}

interface FieldSuggestion {
  field: string
  value: string
  reasoning: string
}

type WizardStepId = 'capture' | 'analyzing' | 'review' | 'done'

interface WizardProps {
  properties: WizardProperty[]
  hasParsedCCR: boolean
  /** When set, the wizard hydrates its state from this draft and resumes. */
  initialDraft?: WizardDraft | null
}

const STEPPER_STEPS: StepperStep[] = [
  { id: 'capture', label: 'Report', description: 'Photo, notes, property' },
  { id: 'review', label: 'Review & approve', description: 'Edit AI letter, send via BarBGate' },
  { id: 'done', label: 'Recorded', description: 'Notice marked sent' },
]

function stepIndex(step: WizardStepId): number {
  if (step === 'capture' || step === 'analyzing') return 0
  if (step === 'review') return 1
  return 2
}

interface DraftPayload {
  propertyId?: string
  notes?: string
  curePeriod?: number
  fineAmount?: number
  photoStoragePath?: string | null
  photoSignedUrl?: string | null
  analysis?: AnalysisResult | null
}

export function Wizard({ properties, hasParsedCCR, initialDraft }: WizardProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const initialPayload = (initialDraft?.payload ?? {}) as DraftPayload

  const [step, setStep] = useState<WizardStepId>(() => {
    const cs = (initialDraft?.current_step ?? 'capture') as WizardStepId
    if (cs === 'review' && initialPayload.analysis) return 'review'
    return 'capture'
  })

  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null)
  const [propertyId, setPropertyId] = useState(
    initialPayload.propertyId ?? properties[0]?.id ?? '',
  )
  const [notes, setNotes] = useState(initialPayload.notes ?? '')
  const [curePeriod, setCurePeriod] = useState(initialPayload.curePeriod ?? 14)
  const [fineAmount, setFineAmount] = useState(initialPayload.fineAmount ?? 25)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(
    initialPayload.photoStoragePath ?? null,
  )
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(
    initialPayload.photoSignedUrl ?? null,
  )
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(
    initialPayload.analysis ?? null,
  )
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmitting] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([])
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [suggesting, startSuggesting] = useTransition()
  const [aiAppliedFields, setAIAppliedFields] = useState<Set<string>>(new Set())

  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(
    initialDraft?.updated_at ? new Date(initialDraft.updated_at) : null,
  )

  const selectedProperty = properties.find((p) => p.id === propertyId)

  // Autosave on key state transitions. We don't save on every keystroke —
  // we save when there's a checkpoint worth resuming to.
  const lastSavedRef = useRef<string>('')
  async function persistDraft(currentStep: WizardStepId) {
    const payload: DraftPayload = {
      propertyId,
      notes,
      curePeriod,
      fineAmount,
      photoStoragePath,
      photoSignedUrl,
      analysis,
    }
    const serialized = JSON.stringify({ payload, currentStep })
    if (serialized === lastSavedRef.current) return
    lastSavedRef.current = serialized

    setDraftSaving(true)
    try {
      const result = await saveDraft({
        draftId: draftId ?? undefined,
        kind: 'violation',
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

  // Save when the step changes — covers capture -> review and into done.
  useEffect(() => {
    void persistDraft(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoStoragePath(null)
    setPhotoSignedUrl(null)
    setPhotoError(null)
    setPhotoUploading(true)

    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/violations/photo', { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) {
        setPhotoError(body?.message ?? 'Photo upload failed.')
        return
      }
      setPhotoStoragePath(body.storagePath)
      setPhotoSignedUrl(body.signedUrl)
      // Save draft once the photo is uploaded — that's a meaningful checkpoint.
      void persistDraft('capture')
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Photo upload failed.')
    } finally {
      setPhotoUploading(false)
    }
  }

  function clearPhoto() {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    setPhotoStoragePath(null)
    setPhotoSignedUrl(null)
    setPhotoError(null)
  }

  function handleSuggest() {
    setSuggestionsError(null)
    setSuggestions([])
    startSuggesting(async () => {
      const res = await fetch('/api/ai/suggest-fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'violation',
          partialState: {
            notes,
            propertyAddress: selectedProperty?.address ?? '',
            unitNumber: selectedProperty?.unit_number ?? null,
            hasPhoto: Boolean(photoStoragePath),
          },
          fields: ['cure_period_days', 'fine_amount', 'severity', 'violation_type'],
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
        if (s.field === 'cure_period_days') {
          const n = parseInt(s.value, 10)
          if (!Number.isNaN(n) && n >= 1 && n <= 180) {
            setCurePeriod(n)
            next.add('cure_period_days')
          }
        } else if (s.field === 'fine_amount') {
          const n = parseFloat(s.value)
          if (!Number.isNaN(n) && n >= 0 && n <= 1000) {
            setFineAmount(n)
            next.add('fine_amount')
          }
        }
      }
      setAIAppliedFields(next)
    })
  }

  async function handleAnalyze() {
    if (!propertyId || !photoSignedUrl) return
    setStep('analyzing')
    setAnalyzeError(null)

    const res = await fetch('/api/ai/analyze-violation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        photoSignedUrl,
        manualDescription: notes.trim() || undefined,
        curePeriodDays: curePeriod,
        fineAmount,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setAnalyzeError(body?.message ?? 'Analysis failed. Try again or write the letter manually.')
      setStep('capture')
      return
    }

    const body = (await res.json()) as AnalysisResult
    setAnalysis(body)
    setStep('review')
  }

  function handleApprove(approvedLetter: string) {
    if (!analysis || !propertyId) return
    setSubmitError(null)
    startSubmitting(async () => {
      const result = await createApprovedViolation({
        propertyId,
        description: analysis.description,
        violationType: analysis.violationType || 'general',
        ccrSection: analysis.ccrSection,
        severity: analysis.severity,
        curePeriodDays: curePeriod,
        fineAmount,
        aiDraftLetter: analysis.letterDraft,
        approvedLetter,
        photoStoragePaths: photoStoragePath ? [photoStoragePath] : [],
      })
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      setCreatedId(result.violationId)
      // Mark the draft completed so it falls off the dashboard's
      // "unfinished workflows" widget.
      if (draftId) await markDraftCompleted(draftId)
      setStep('done')
    })
  }

  function reasoningFor(field: string): string | null {
    return suggestions.find((s) => s.field === field)?.reasoning ?? null
  }

  // Stepper rendered above every step.
  const stepperHeader = (
    <div className="space-y-3 border-b border-border pb-4">
      <WizardStepper
        steps={STEPPER_STEPS}
        currentIndex={stepIndex(step)}
        vertical={false}
      />
      <div className="flex items-center justify-between text-xs text-muted">
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
                title: 'Discard violation draft?',
                description:
                  'Your unsaved changes will be lost. This cannot be undone.',
                confirmLabel: 'Discard',
                destructive: true,
              })
              if (!ok) return
              try {
                await discardDraft(draftId)
                toast({ tone: 'success', message: 'Draft discarded.' })
                router.push('/violations')
              } catch (err) {
                toast({
                  tone: 'error',
                  message:
                    err instanceof Error ? err.message : 'Could not discard draft.',
                })
              }
            }}
            className="text-muted hover:text-destructive"
          >
            Discard draft
          </button>
        ) : null}
      </div>
    </div>
  )

  // ── Step 1: Capture ────────────────────────────────────────────────
  if (step === 'capture') {
    const canAnalyze = Boolean(propertyId && photoSignedUrl && !photoUploading)
    return (
      <div className="space-y-5">
        {stepperHeader}

        <div className="space-y-1.5">
          <label htmlFor="property" className="text-sm font-medium text-foreground">
            Property <span className="text-destructive">*</span>
          </label>
          {properties.length === 0 ? (
            <Alert variant="warning" title="No properties">
              Add a property first before reporting a violation.
            </Alert>
          ) : (
            <Select
              id="property"
              value={propertyId}
              onValueChange={setPropertyId}
              placeholder="Select property"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.unit_number ? ` · ${p.unit_number}` : ''}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Photo <span className="text-destructive">*</span>
          </label>
          {photoPreview || photoStoragePath ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-3">
                <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-background">
                  {photoPreview ? (
                    <Image
                      src={photoPreview}
                      alt="Violation photo preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                      Photo on file
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium text-foreground">
                    {photoFile?.name ?? 'Restored from draft'}
                  </p>
                  {photoUploading ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                    </p>
                  ) : photoError ? (
                    <p className="mt-1 text-xs text-destructive">{photoError}</p>
                  ) : photoSignedUrl ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Uploaded
                    </p>
                  ) : null}
                </div>
                <Button variant="ghost" size="icon" onClick={clearPhoto} aria-label="Remove photo">
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <label
              htmlFor="photo"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-6 py-8 text-center hover:border-primary"
            >
              <ImagePlus className="h-6 w-6 text-muted" aria-hidden />
              <span className="text-sm font-medium text-foreground">Click to add a photo</span>
              <span className="text-xs text-muted">JPG, PNG, WebP, or HEIC · up to 25 MB</span>
            </label>
          )}
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onChange={handlePhotoChange}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-foreground">
            Additional notes <span className="text-muted">(optional)</span>
          </label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the photo doesn't show. E.g., this is a recurring issue / discussed at last meeting / safety concern."
          />
        </div>

        {/* AI suggestions block */}
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI suggestions
              </p>
              <p className="text-xs text-muted">
                Pick sensible defaults for cure period and fine from the notes + photo.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              loading={suggesting}
              disabled={!propertyId}
            >
              Suggest values
            </Button>
          </div>
          {suggestionsError ? (
            <p className="mt-2 text-xs text-amber-700">{suggestionsError}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWithSuggestion
            label="Cure period (days)"
            htmlFor="cure"
            isAI={aiAppliedFields.has('cure_period_days')}
            reasoning={reasoningFor('cure_period_days')}
            onClearAI={() => {
              const next = new Set(aiAppliedFields)
              next.delete('cure_period_days')
              setAIAppliedFields(next)
            }}
          >
            <Input
              id="cure"
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={curePeriod}
              onChange={(e) => {
                setCurePeriod(Number(e.target.value) || 14)
                if (aiAppliedFields.has('cure_period_days')) {
                  const next = new Set(aiAppliedFields)
                  next.delete('cure_period_days')
                  setAIAppliedFields(next)
                }
              }}
            />
          </FieldWithSuggestion>
          <FieldWithSuggestion
            label="Daily fine if uncured ($)"
            htmlFor="fine"
            isAI={aiAppliedFields.has('fine_amount')}
            reasoning={reasoningFor('fine_amount')}
            onClearAI={() => {
              const next = new Set(aiAppliedFields)
              next.delete('fine_amount')
              setAIAppliedFields(next)
            }}
          >
            <Input
              id="fine"
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={5}
              value={fineAmount}
              onChange={(e) => {
                setFineAmount(Number(e.target.value) || 0)
                if (aiAppliedFields.has('fine_amount')) {
                  const next = new Set(aiAppliedFields)
                  next.delete('fine_amount')
                  setAIAppliedFields(next)
                }
              }}
            />
          </FieldWithSuggestion>
        </div>

        {!hasParsedCCR ? (
          <Alert variant="warning" title="No parsed CC&Rs">
            You haven&apos;t pasted CC&amp;R text yet. The AI can still draft a letter, but it
            won&apos;t know which section to cite. Add your CC&amp;Rs under{' '}
            <a className="font-medium underline underline-offset-2" href="/documents">
              Documents
            </a>
            {' '}for better drafts.
          </Alert>
        ) : null}

        {analyzeError ? (
          <Alert variant="error" title="Analysis failed">
            {analyzeError}
          </Alert>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={async () => {
              await persistDraft(step)
              toast({
                tone: 'success',
                message: 'Draft saved — pick up later from the dashboard.',
              })
              router.push('/violations')
            }}
          >
            Save draft & exit
          </Button>
          <Button onClick={handleAnalyze} disabled={!canAnalyze}>
            <Sparkles className="h-4 w-4" />
            Analyze with Covenant Brain
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: Analyzing ─────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <div className="space-y-6">
        {stepperHeader}
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div className="mt-4 space-y-1">
            <p className="font-medium text-foreground">Running Covenant Brain</p>
            <p className="text-sm text-muted">
              Reading your photo, matching the right CC&amp;R section, and drafting a letter.
              Usually 5–10 seconds.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 3: Review (BarBGate) ──────────────────────────────────────
  if (step === 'review' && analysis) {
    return (
      <div className="space-y-5">
        {stepperHeader}

        {analysis.warnings.length > 0 ? (
          <div className="space-y-2">
            {analysis.warnings.map((w, i) => (
              <Alert key={i} variant="warning" hideIcon>
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{w}</span>
                </span>
              </Alert>
            ))}
          </div>
        ) : null}

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <Detail label="Property">{selectedProperty?.address ?? '—'}</Detail>
            <Detail label="Violation type">{analysis.violationType}</Detail>
            <Detail label="CC&R section">
              {analysis.ccrSection ?? <span className="text-muted">Not matched</span>}
            </Detail>
            <Detail label="Severity">
              {analysis.severity ? (
                <Badge variant={severityVariant(analysis.severity)} size="sm">
                  {analysis.severity}
                </Badge>
              ) : (
                <span className="text-muted">—</span>
              )}
              {analysis.confidence ? (
                <span className="ml-2 text-xs text-muted">{analysis.confidence} confidence</span>
              ) : null}
            </Detail>
          </CardContent>
        </Card>

        {submitError ? (
          <Alert variant="error" title="Couldn't save">
            {submitError}
          </Alert>
        ) : null}

        <BarBGate
          content={analysis.letterDraft}
          title="Approve before sending"
          description="The board is responsible for the wording. Read carefully, edit anything that's wrong, then approve."
          approveLabel="Approve & mark notice sent"
          rejectLabel="Back to edit"
          onApprove={handleApprove}
          onReject={() => setStep('capture')}
          isLoading={submitting}
        />
      </div>
    )
  }

  // ── Step 4: Done ──────────────────────────────────────────────────
  if (step === 'done' && createdId) {
    return (
      <div className="space-y-5">
        {stepperHeader}
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="mt-4 space-y-1">
            <h2 className="text-xl font-bold text-foreground">Violation recorded</h2>
            <p className="text-sm text-muted">
              Notice marked as sent. The cure clock is now running.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/violations/${createdId}`)}>
              View violation
            </Button>
            <Button onClick={() => router.refresh()}>Create another</Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

function FieldWithSuggestion({
  label,
  htmlFor,
  isAI,
  reasoning,
  onClearAI,
  children,
}: {
  label: string
  htmlFor: string
  isAI?: boolean
  reasoning?: string | null
  onClearAI?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {isAI ? (
          <button
            type="button"
            onClick={onClearAI}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:bg-primary/20"
            title={reasoning ?? 'AI-suggested value'}
          >
            <Sparkles className="h-2.5 w-2.5" /> AI · clear
          </button>
        ) : null}
      </div>
      {children}
      {isAI && reasoning ? (
        <p className="text-[11px] text-muted">{reasoning}</p>
      ) : null}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  )
}

function severityVariant(s: 'low' | 'medium' | 'high'): 'success' | 'warning' | 'destructive' {
  if (s === 'high') return 'destructive'
  if (s === 'medium') return 'warning'
  return 'success'
}
