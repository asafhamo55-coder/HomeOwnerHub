'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createArcRequest, type ArcCategory } from '@/lib/resident-submissions'
import type { ResidentUnit } from '@/lib/resident'

const CATEGORIES: Array<{ value: ArcCategory; label: string }> = [
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
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Application submitted to the board.' })
      router.push(`/resident/arc/${result.data.requestId}`)
    })
  }

  const singleUnit = units.length === 1 ? units[0] : null

  return (
    <form action={handleSubmit} className="space-y-5" noValidate>
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
        <Select name="category" placeholder="Choose one…">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

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
