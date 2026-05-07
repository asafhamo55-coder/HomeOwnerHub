'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
} from 'lucide-react'
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
} from '@homeownerhub/ui'
import { humanizeNoticeType } from '@homeownerhub/ai'
import { ComplianceBlock } from '@/components/cases/ComplianceBlock'
import {
  checkHarrisCountyCompliance,
  type ComplianceCheckResult,
} from '@/lib/compliance/harris-tx'
import { createApprovedCase } from '@/lib/cases'
import {
  saveDraft,
  markDraftCompleted,
  discardDraft,
  type WizardDraft,
} from '@/lib/drafts'

type Step = 'intake' | 'compliance' | 'review' | 'done'
type ServiceMethod = 'personal' | 'posting' | 'certified_mail'

interface WizardProps {
  workspaceName: string
  initial?: {
    propertyAddress?: string
    tenantName?: string
    monthlyRent?: number
    daysUnpaid?: number
  }
  initialDraft?: WizardDraft | null
}

interface AIResponse {
  noticeDraft: string
  aiFlags: { additionalFlags: string[]; recommendation: string; confidence: string } | null
  warnings: string[]
}

interface DraftPayload {
  propertyAddress?: string
  tenantName?: string
  tenantEmail?: string
  monthlyRent?: number
  daysUnpaid?: number
  tenantSituation?: string
  serviceMethod?: ServiceMethod
  aiResponse?: AIResponse | null
}

const STEPPER_STEPS: StepperStep[] = [
  { id: 'intake', label: 'Property & tenant', description: 'Address, tenant, rent, days unpaid' },
  { id: 'compliance', label: 'Compliance check', description: 'Statutory rule engine' },
  { id: 'review', label: 'Review & serve', description: 'Approve notice via BarBGate' },
  { id: 'done', label: 'Case opened', description: 'Notice on file' },
]

function stepIndex(step: Step): number {
  if (step === 'intake') return 0
  if (step === 'compliance') return 1
  if (step === 'review') return 2
  return 3
}

export function Wizard({ workspaceName, initial, initialDraft }: WizardProps) {
  const router = useRouter()
  const initialPayload = (initialDraft?.payload ?? {}) as DraftPayload

  const [step, setStep] = useState<Step>(() => {
    if (initialPayload.aiResponse) return 'review'
    if (initialDraft?.current_step === 'compliance') return 'compliance'
    return 'intake'
  })
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null)

  const [propertyAddress, setPropertyAddress] = useState(
    initialPayload.propertyAddress ?? initial?.propertyAddress ?? '',
  )
  const [tenantName, setTenantName] = useState(
    initialPayload.tenantName ?? initial?.tenantName ?? '',
  )
  const [tenantEmail, setTenantEmail] = useState(initialPayload.tenantEmail ?? '')
  const [monthlyRent, setMonthlyRent] = useState(
    initialPayload.monthlyRent ?? initial?.monthlyRent ?? 1500,
  )
  const [daysUnpaid, setDaysUnpaid] = useState(
    initialPayload.daysUnpaid ?? initial?.daysUnpaid ?? 7,
  )
  const [tenantSituation, setTenantSituation] = useState(initialPayload.tenantSituation ?? '')
  const [serviceMethod, setServiceMethod] = useState<ServiceMethod>(
    initialPayload.serviceMethod ?? 'personal',
  )

  // The schema's eviction_cases_county_check constraint allows slugs only
  // (harris_tx / san_bernardino_ca / king_wa). countyLabel is the human-
  // readable form for AI prompts and UI; countyDb is what we save.
  const countyDb = 'harris_tx'
  const countyLabel = 'Harris County'
  const state = 'TX'

  const compliance: ComplianceCheckResult = checkHarrisCountyCompliance({
    isCommercial: false,
    daysUnpaid,
    monthlyRent,
  })

  const [aiResponse, setAIResponse] = useState<AIResponse | null>(
    initialPayload.aiResponse ?? null,
  )
  const [aiError, setAIError] = useState<string | null>(null)
  const [aiLoading, startAILoading] = useTransition()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmitting] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)

  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(
    initialDraft?.updated_at ? new Date(initialDraft.updated_at) : null,
  )

  const lastSavedRef = useRef<string>('')
  async function persistDraft(currentStep: Step) {
    const payload: DraftPayload = {
      propertyAddress,
      tenantName,
      tenantEmail,
      monthlyRent,
      daysUnpaid,
      tenantSituation,
      serviceMethod,
      aiResponse,
    }
    const serialized = JSON.stringify({ payload, currentStep })
    if (serialized === lastSavedRef.current) return
    lastSavedRef.current = serialized

    setDraftSaving(true)
    try {
      const result = await saveDraft({
        draftId: draftId ?? undefined,
        kind: 'eviction_case',
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

  function goToCompliance() {
    if (!propertyAddress.trim() || !tenantName.trim()) return
    setStep('compliance')
  }

  function goToReview() {
    setAIError(null)
    setAIResponse(null)
    startAILoading(async () => {
      const res = await fetch('/api/ai/draft-notice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyAddress,
          tenantName,
          monthlyRent,
          daysUnpaid,
          // AI prompt uses the human-readable label; the slug
          // (countyDb) is what we save below.
          county: countyLabel,
          state,
          noticeType: compliance.requiredNoticeType,
          landlordName: workspaceName,
          tenantSituation: tenantSituation || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAIError(body?.message ?? 'Could not generate the notice. Try again or write it yourself.')
        return
      }
      const body = (await res.json()) as AIResponse
      setAIResponse(body)
      setStep('review')
    })
  }

  function handleApprove(approvedNotice: string) {
    if (!aiResponse) return
    setSubmitError(null)
    startSubmitting(async () => {
      const result = await createApprovedCase({
        propertyAddress,
        tenantName,
        tenantEmail,
        monthlyRent,
        daysUnpaid,
        county: countyDb,
        state,
        noticeType: compliance.requiredNoticeType,
        noticeDraft: aiResponse.noticeDraft,
        approvedNotice,
        filingEligibleDate: compliance.filingEligibleDate.toISOString().slice(0, 10),
        noticeServedMethod: serviceMethod,
        caseNotes: tenantSituation || undefined,
        complianceFlags: aiResponse.aiFlags
          ? {
              flags: aiResponse.aiFlags.additionalFlags,
              recommendation: aiResponse.aiFlags.recommendation,
            }
          : null,
      })
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      setCreatedId(result.caseId)
      if (draftId) await markDraftCompleted(draftId)
      setStep('done')
    })
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
              if (!confirm('Discard this in-progress case? This cannot be undone.')) return
              await discardDraft(draftId)
              router.push('/')
            }}
            className="text-muted-fg hover:text-destructive"
          >
            Discard draft
          </button>
        ) : null}
      </div>
    </div>
  )

  // ── Step 1: intake form ─────────────────────────────────────────────
  if (step === 'intake') {
    const canProceed = propertyAddress.trim().length > 0 && tenantName.trim().length > 0
    return (
      <div className="space-y-5">
        {stepperHeader}

        <Field label="Property address" htmlFor="address" required>
          <Input
            id="address"
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="1234 Main St, Houston, TX 77002"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="County" htmlFor="county" hint="Phase 1 supports Harris County TX only.">
            <Input id="county" value={`${countyLabel}, ${state}`} disabled />
          </Field>
          <Field label="Monthly rent" htmlFor="rent" required>
            <Input
              id="rent"
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(Number(e.target.value) || 0)}
              prefix={<span className="text-xs">$</span>}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tenant name" htmlFor="tenant" required>
            <Input
              id="tenant"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Tenant email" htmlFor="tenant-email" hint="Optional">
            <Input
              id="tenant-email"
              type="email"
              value={tenantEmail}
              onChange={(e) => setTenantEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>
        </div>

        <Field label="Days since rent was due" htmlFor="days-unpaid" required>
          <Input
            id="days-unpaid"
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            value={daysUnpaid}
            onChange={(e) => setDaysUnpaid(Number(e.target.value) || 0)}
          />
        </Field>

        <Field
          label="Special circumstances"
          htmlFor="situation"
          hint="Optional. Anything unusual — military service, Section 8 housing, accessibility accommodations, domestic-violence protections, or other facts the AI should weigh."
        >
          <Textarea
            id="situation"
            rows={3}
            value={tenantSituation}
            onChange={(e) => setTenantSituation(e.target.value)}
            placeholder="Tenant is on active military deployment. (We will check SCRA implications.)"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            Save & exit
          </Button>
          <Button onClick={goToCompliance} disabled={!canProceed}>
            Run compliance check
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: compliance check (the keystone) ─────────────────────────
  if (step === 'compliance') {
    return (
      <div className="space-y-5">
        {stepperHeader}

        <ComplianceBlock result={compliance} />

        {/* Quality rule #4: this block has no dismiss / acknowledge button.
            The only forward path is to generate the notice. The filing
            date is fixed by statute. */}

        {aiError ? (
          <Alert variant="error" title="Couldn't generate the notice">
            {aiError}
          </Alert>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => setStep('intake')} disabled={aiLoading}>
            Back
          </Button>
          <Button
            onClick={goToReview}
            loading={aiLoading}
            disabled={!compliance.canServeNoticeNow}
          >
            Generate {compliance.requiredNoticeType === 'unknown'
              ? 'notice'
              : humanizeNoticeType(compliance.requiredNoticeType)}
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 3: notice review (BarBGate) ────────────────────────────────
  if (step === 'review' && aiResponse) {
    return (
      <div className="space-y-5">
        {stepperHeader}

        {aiResponse.warnings.length > 0 ? (
          <div className="space-y-2">
            {aiResponse.warnings.map((w, i) => (
              <Alert key={i} variant="warning" hideIcon>
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{w}</span>
                </span>
              </Alert>
            ))}
          </div>
        ) : null}

        {aiResponse.aiFlags && aiResponse.aiFlags.additionalFlags.length > 0 ? (
          <Alert variant="warning" title="AI flagged edge cases">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {aiResponse.aiFlags.additionalFlags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
            {aiResponse.aiFlags.recommendation ? (
              <p className="mt-2 text-sm">{aiResponse.aiFlags.recommendation}</p>
            ) : null}
            <p className="mt-2 text-xs text-amber-700">
              Confidence: {aiResponse.aiFlags.confidence}. Verify with counsel before filing.
            </p>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <Detail label="Property">{propertyAddress}</Detail>
            <Detail label="Tenant">{tenantName}</Detail>
            <Detail label="Notice type">
              {compliance.requiredNoticeType === 'unknown'
                ? 'Unknown'
                : humanizeNoticeType(compliance.requiredNoticeType)}
            </Detail>
            <Detail label="Earliest filing">
              {compliance.filingEligibleDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Detail>
          </CardContent>
        </Card>

        <Field label="Service method" htmlFor="service-method">
          <select
            id="service-method"
            value={serviceMethod}
            onChange={(e) => setServiceMethod(e.target.value as ServiceMethod)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="personal">Personal delivery</option>
            <option value="posting">Posting on inside of main entry door</option>
            <option value="certified_mail">Certified mail (return receipt requested)</option>
          </select>
        </Field>

        {submitError ? (
          <Alert variant="error" title="Couldn't save the case">
            {submitError}
          </Alert>
        ) : null}

        <BarBGate
          content={aiResponse.noticeDraft}
          title="Approve before serving"
          description="Read the notice carefully. The wording you approve is the wording that gets recorded in the case file. Edit anything that is wrong."
          approveLabel="Approve & record service"
          rejectLabel="Back to compliance"
          onApprove={handleApprove}
          onReject={() => setStep('compliance')}
          isLoading={submitting}
        />
      </div>
    )
  }

  // ── Step 4: done ────────────────────────────────────────────────────
  if (step === 'done' && createdId) {
    return (
      <div className="space-y-5">
        {stepperHeader}
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="mt-4 space-y-1">
            <h2 className="text-xl font-bold text-muted">Case opened</h2>
            <p className="text-sm text-muted-fg">
              Notice recorded. Earliest filing date:{' '}
              {compliance.filingEligibleDate.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              .
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/cases/${createdId}`)}>
              View case
            </Button>
            <Button onClick={() => router.refresh()}>Open another</Button>
          </div>
        </div>
      </div>
    )
  }

  // Defensive default
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-fg">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading...
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-fg">{hint}</p> : null}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-fg">{label}</p>
      <p className="mt-0.5 text-sm text-muted">{children}</p>
    </div>
  )
}
