'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
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
  Textarea,
  cn,
} from '@homeownerhub/ui'
import { createApprovedViolation } from '@/lib/violations'

interface WizardProperty {
  id: string
  address: string
  unit_number: string | null
}

interface WizardProps {
  properties: WizardProperty[]
  hasParsedCCR: boolean
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

type WizardStep = 'capture' | 'analyzing' | 'review' | 'done'

export function Wizard({ properties, hasParsedCCR }: WizardProps) {
  const router = useRouter()

  const [step, setStep] = useState<WizardStep>('capture')
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const [notes, setNotes] = useState('')
  const [curePeriod, setCurePeriod] = useState(14)
  const [fineAmount, setFineAmount] = useState(25)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(null)
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmitting] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)

  const selectedProperty = properties.find((p) => p.id === propertyId)

  // Eagerly upload the photo on file pick — saves time during analysis later.
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
      setStep('done')
    })
  }

  // ── Step 1: Capture ────────────────────────────────────────────────
  if (step === 'capture') {
    const canAnalyze = Boolean(propertyId && photoSignedUrl && !photoUploading)
    return (
      <div className="space-y-5">
        <StepIndicator step={1} total={3} title="Report" />

        <div className="space-y-1.5">
          <label htmlFor="property" className="text-sm font-medium text-muted">
            Property <span className="text-destructive">*</span>
          </label>
          {properties.length === 0 ? (
            <Alert variant="warning" title="No properties">
              Add a property first before reporting a violation.
            </Alert>
          ) : (
            <select
              id="property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.unit_number ? ` · ${p.unit_number}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted">
            Photo <span className="text-destructive">*</span>
          </label>
          {photoPreview ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-3">
                <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-background">
                  <Image
                    src={photoPreview}
                    alt="Violation photo preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium text-muted">{photoFile?.name}</p>
                  {photoUploading ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-fg">
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
              <ImagePlus className="h-6 w-6 text-muted-fg" aria-hidden />
              <span className="text-sm font-medium text-muted">Click to add a photo</span>
              <span className="text-xs text-muted-fg">JPG, PNG, WebP, or HEIC · up to 25 MB</span>
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
          <label htmlFor="notes" className="text-sm font-medium text-muted">
            Additional notes <span className="text-muted-fg">(optional)</span>
          </label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the photo doesn't show. E.g., this is a recurring issue / discussed at last meeting / safety concern."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="cure" className="text-sm font-medium text-muted">
              Cure period (days)
            </label>
            <Input
              id="cure"
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={curePeriod}
              onChange={(e) => setCurePeriod(Number(e.target.value) || 14)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fine" className="text-sm font-medium text-muted">
              Daily fine if uncured ($)
            </label>
            <Input
              id="fine"
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={5}
              value={fineAmount}
              onChange={(e) => setFineAmount(Number(e.target.value) || 0)}
            />
          </div>
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
          <Button variant="outline" onClick={() => router.push('/violations')}>
            Cancel
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
      <div className="space-y-6 py-8 text-center">
        <StepIndicator step={2} total={3} title="Analyzing" />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-muted">Running Covenant Brain</p>
          <p className="text-sm text-muted-fg">
            Reading your photo, matching the right CC&amp;R section, and drafting a letter. Usually
            5–10 seconds.
          </p>
        </div>
      </div>
    )
  }

  // ── Step 3: Review (BarBGate) ──────────────────────────────────────
  if (step === 'review' && analysis) {
    return (
      <div className="space-y-5">
        <StepIndicator step={3} total={3} title="Review &amp; approve" />

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
              {analysis.ccrSection ?? <span className="text-muted-fg">Not matched</span>}
            </Detail>
            <Detail label="Severity">
              {analysis.severity ? (
                <Badge variant={severityVariant(analysis.severity)} size="sm">
                  {analysis.severity}
                </Badge>
              ) : (
                <span className="text-muted-fg">—</span>
              )}
              {analysis.confidence ? (
                <span className="ml-2 text-xs text-muted-fg">{analysis.confidence} confidence</span>
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
      <div className="space-y-5 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-muted">Violation recorded</h2>
          <p className="text-sm text-muted-fg">
            Notice marked as sent. The cure clock is now running.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push(`/violations/${createdId}`)}>
            View violation
          </Button>
          <Button onClick={() => router.refresh()}>Create another</Button>
        </div>
      </div>
    )
  }

  return null
}

function StepIndicator({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{title}</p>
        <p className="text-xs text-muted-fg">
          Step {step} of {total}
        </p>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i < step ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-fg">{label}</p>
      <div className="mt-0.5 text-sm text-muted">{children}</div>
    </div>
  )
}

function severityVariant(s: 'low' | 'medium' | 'high'): 'success' | 'warning' | 'destructive' {
  if (s === 'high') return 'destructive'
  if (s === 'medium') return 'warning'
  return 'success'
}
