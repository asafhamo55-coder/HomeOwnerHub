'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import {
  Alert,
  BarBGate,
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
  cn,
} from '@homeownerhub/ui'
import { ComplianceBlock } from '@/components/cases/ComplianceBlock'
import {
  checkHarrisCountyCompliance,
  type ComplianceCheckResult,
} from '@/lib/compliance/harris-tx'
import { createApprovedCase } from '@/lib/cases'

type Step = 'intake' | 'compliance' | 'review' | 'done'

interface WizardProps {
  workspaceName: string
}

interface AIResponse {
  noticeDraft: string
  aiFlags: { additionalFlags: string[]; recommendation: string; confidence: string } | null
  warnings: string[]
}

export function Wizard({ workspaceName }: WizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intake')

  // Form state — kept across steps so the user can step back and edit.
  const [propertyAddress, setPropertyAddress] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [tenantEmail, setTenantEmail] = useState('')
  const [monthlyRent, setMonthlyRent] = useState(1500)
  const [daysUnpaid, setDaysUnpaid] = useState(7)
  const [tenantSituation, setTenantSituation] = useState('')

  // Hard-coded for Phase 1 — Harris County TX is the only jurisdiction.
  const county = 'Harris County'
  const state = 'TX'

  // Computed compliance check for the chosen jurisdiction.
  const compliance: ComplianceCheckResult = checkHarrisCountyCompliance({
    isCommercial: false,
    daysUnpaid,
    monthlyRent,
  })

  // Output of POST /api/ai/draft-notice
  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [aiError, setAIError] = useState<string | null>(null)
  const [aiLoading, startAILoading] = useTransition()

  // Output of approval -> server action createApprovedCase.
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmitting] = useTransition()
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [serviceMethod, setServiceMethod] = useState<'personal' | 'posting' | 'certified_mail'>(
    'personal',
  )

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
          county,
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
        county,
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
      setStep('done')
    })
  }

  // ── Step 1: intake form ─────────────────────────────────────────────
  if (step === 'intake') {
    const canProceed = propertyAddress.trim().length > 0 && tenantName.trim().length > 0
    return (
      <div className="space-y-5">
        <StepIndicator step={1} total={3} title="Property &amp; tenant" />

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
          <Field
            label="County"
            htmlFor="county"
            hint="Phase 1 supports Harris County TX only."
          >
            <Input id="county" value={`${county}, ${state}`} disabled />
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
            Cancel
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
        <StepIndicator step={2} total={3} title="Compliance check" />

        <ComplianceBlock result={compliance} />

        {/* Note: The block intentionally has no dismiss / acknowledge button.
            Quality rule #4 in the plan: this block cannot be bypassed. The
            only forward path is to generate the notice. The filing date is
            fixed by statute. */}

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
            Generate {compliance.requiredNoticeType.replace(/_/g, ' ')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 3: notice review (BarBGate) ────────────────────────────────
  if (step === 'review' && aiResponse) {
    return (
      <div className="space-y-5">
        <StepIndicator step={3} total={3} title="Review &amp; serve" />

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
              {compliance.requiredNoticeType.replace(/_/g, ' ')}
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
            onChange={(e) =>
              setServiceMethod(e.target.value as typeof serviceMethod)
            }
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
      <div className="space-y-5 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="space-y-1">
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
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push(`/cases/${createdId}`)}>
            View case
          </Button>
          <Button onClick={() => router.refresh()}>Open another</Button>
        </div>
      </div>
    )
  }

  // Defensive default — shouldn't reach this in practice.
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-fg">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading...
    </div>
  )
}

// ── Reusable helpers ─────────────────────────────────────────────────

function StepIndicator({
  step,
  total,
  title,
}: {
  step: number
  total: number
  title: string
}) {
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
