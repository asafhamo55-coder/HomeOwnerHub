'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Send } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createArcRequest, type ArcCategory } from '@/lib/resident-submissions'
import type { ResidentUnit } from '@/lib/resident'
import { trackEvent } from '@/lib/analytics/track'
import { responseErrorMessage } from '@/lib/api/client'
import { ATTACH_LATER_NOTE, whatToInclude } from '@/lib/arc-review/what-to-include'
import { ArcPrecheckResult, type ArcPrecheckResponse } from './ArcPrecheckResult'

export const CATEGORIES: Array<{ value: ArcCategory; label: string }> = [
  { value: 'paint', label: 'Exterior paint / stain' },
  { value: 'fence', label: 'Fence or wall' },
  { value: 'deck_patio', label: 'Deck / patio / screened enclosure' },
  { value: 'roof', label: 'Roof / gutters' },
  { value: 'landscaping', label: 'Landscaping (substantial)' },
  { value: 'addition', label: 'Addition / structural change' },
  { value: 'pool', label: 'Pool / spa' },
  { value: 'solar', label: 'Solar panels' },
  { value: 'other', label: 'Other' },
]

export function ArcRequestForm({
  units,
  defaultSummary,
  defaultScope,
}: {
  units: ResidentUnit[]
  defaultSummary?: string
  defaultScope?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const scopeRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [category, setCategory] = useState('')
  // BL-024: the optional rules check. Advisory; submitting never depends on it.
  const [checking, setChecking] = useState(false)
  const [precheck, setPrecheck] = useState<ArcPrecheckResponse | null>(null)
  const [precheckError, setPrecheckError] = useState<string | null>(null)

  async function checkRules() {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const text = (k: string) => String(fd.get(k) ?? '').trim()
    const body = {
      unitId: text('unit_id') || null,
      category: text('category'),
      summary: text('summary'),
      scopeDescription: text('scope_description'),
      proposedStart: text('proposed_start') || null,
      proposedCompletion: text('proposed_completion') || null,
      contractorName: text('contractor_name') || null,
      contractorLicense: text('contractor_license') || null,
    }
    setPrecheckError(null)
    if (!body.category || body.summary.length < 3 || body.scopeDescription.length < 10) {
      setPrecheckError('Pick the type of change and describe it first, then check it against the rules.')
      return
    }
    setChecking(true)
    try {
      const res = await fetch('/api/ai/arc-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setPrecheckError(await responseErrorMessage(res, 'The rules check isn’t available right now. You can still submit your application.'))
        return
      }
      setPrecheck((await res.json()) as ArcPrecheckResponse)
    } catch {
      setPrecheckError('We couldn’t reach the server. You can still submit your application.')
    } finally {
      setChecking(false)
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    const text = (k: string) => String(formData.get(k) ?? '').trim()

    startTransition(async () => {
      const result = await createArcRequest({
        unitId: text('unit_id'),
        category: text('category') as ArcCategory,
        summary: text('summary'),
        scopeDescription: text('scope_description'),
        proposedStart: text('proposed_start') || null,
        proposedCompletion: text('proposed_completion') || null,
        contractorName: text('contractor_name') || null,
        contractorLicense: text('contractor_license') || null,
        precheckRunId: precheck?.runId ?? null,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }
      trackEvent('resident.request_submitted', { type: 'arc' })
      toast({ tone: 'success', message: 'Application submitted to the board.' })
      router.push(`/resident/arc/${result.data.requestId}`)
    })
  }

  const singleUnit = units.length === 1 ? units[0] : null

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert variant="error" title="Couldn’t submit your application">{error}</Alert> : null}

      {singleUnit ? (
        <input type="hidden" name="unit_id" value={singleUnit.unit_id} />
      ) : (
        <Field label="Home" required error={fieldErrors.unit_id}>
          <Select name="unit_id" placeholder="Choose a home">
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {[u.unit_number, u.address].filter(Boolean).join(' — ') || 'Your unit'}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Type of change" required error={fieldErrors.category}>
        <Select name="category" placeholder="Choose one…" onValueChange={setCategory}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <ArcWhatToInclude category={category} />

      <Field
        label="One-line summary"
        required
        error={fieldErrors.summary}
        hint="e.g. “Replace 6-foot wood privacy fence in back yard”."
      >
        <Input name="summary" maxLength={200} defaultValue={defaultSummary} />
      </Field>

      <Field
        label="Detailed description"
        required
        error={fieldErrors.scope_description}
        hint="Materials, dimensions, colors and location. At least 20 characters."
        labelAside={
          <AiRewriteButton
            textareaRef={scopeRef}
            context="Resident ARC application — preserve materials, dimensions, colors, contractor names, and dates exactly"
            disabled={isPending}
          />
        }
      >
        <Textarea ref={scopeRef} name="scope_description" rows={6} maxLength={4000} defaultValue={defaultScope} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Proposed start" optional error={fieldErrors.proposed_start}>
          <Input name="proposed_start" type="date" />
        </Field>
        <Field label="Proposed completion" optional error={fieldErrors.proposed_completion}>
          <Input name="proposed_completion" type="date" />
        </Field>
        <Field label="Contractor" optional error={fieldErrors.contractor_name}>
          <Input name="contractor_name" maxLength={200} />
        </Field>
        <Field label="Contractor license #" optional error={fieldErrors.contractor_license}>
          <Input name="contractor_license" maxLength={100} />
        </Field>
      </div>

      <ArcPrecheckStep checking={checking} disabled={isPending} onCheck={checkRules} result={precheck} error={precheckError} />

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending} disabled={units.length === 0} icon={<Send aria-hidden />}>
          Submit application
        </Button>
      </div>
    </form>
  )
}

/**
 * BL-024: the optional "Check my request against the rules" step. Exported
 * for the rendered-HTML tests and previews.
 */
export function ArcPrecheckStep({
  checking,
  disabled,
  onCheck,
  result,
  error,
}: {
  checking: boolean
  disabled?: boolean
  onCheck: () => void
  result: ArcPrecheckResponse | null
  error: string | null
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-subtle p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Optional: check before you submit</p>
        <p className="text-xs text-foreground-secondary">
          See which of your community’s rules likely apply and what the board will probably ask. Only the board decides.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        icon={<ListChecks aria-hidden />}
        loading={checking}
        disabled={disabled}
        onClick={onCheck}
        // The label is long: full width on phones and allowed to wrap, so it
        // never spills out of its card at 375 (caught by CI ui:overflow).
        className="h-auto min-h-10 w-full whitespace-normal py-2 text-center sm:w-auto"
      >
        {result ? 'Check again' : 'Check my request against the rules'}
      </Button>
      {error ? <Alert variant="warning">{error}</Alert> : null}
      {result ? <ArcPrecheckResult result={result} /> : null}
    </div>
  )
}

/** A short checklist of what to have ready, keyed to the chosen category. */
export function ArcWhatToInclude({ category }: { category: string }) {
  const items = whatToInclude(category)
  if (items.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl border border-border bg-subtle p-4" aria-live="polite">
      <p className="text-sm font-medium text-foreground">What to include</p>
      <p className="text-xs text-foreground-secondary">{ATTACH_LATER_NOTE}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
