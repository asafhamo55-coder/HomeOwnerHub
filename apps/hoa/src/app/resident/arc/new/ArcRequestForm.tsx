'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
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

export function ArcRequestForm({ units }: { units: ResidentUnit[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const unitId = String(formData.get('unit_id') ?? '')
    const category = String(formData.get('category') ?? '') as ArcCategory
    const summary = String(formData.get('summary') ?? '').trim()
    const scopeDescription = String(formData.get('scope_description') ?? '').trim()
    const proposedStart = String(formData.get('proposed_start') ?? '').trim() || null
    const proposedCompletion = String(formData.get('proposed_completion') ?? '').trim() || null
    const contractorName = String(formData.get('contractor_name') ?? '').trim() || null
    const contractorLicense = String(formData.get('contractor_license') ?? '').trim() || null

    startTransition(async () => {
      const result = await createArcRequest({
        unitId,
        category,
        summary,
        scopeDescription,
        proposedStart,
        proposedCompletion,
        contractorName,
        contractorLicense,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/resident/arc')
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Unit" required>
        <select
          name="unit_id"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {units.length === 0 ? (
            <option value="">(no units linked)</option>
          ) : (
            units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {u.unit_number ?? '(no number)'} — {u.address ?? 'address unknown'}
              </option>
            ))
          )}
        </select>
      </Field>

      <Field label="Type of change" required>
        <select
          name="category"
          required
          defaultValue=""
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choose one…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="One-line summary" required>
        <Input
          name="summary"
          required
          maxLength={200}
          placeholder="Replace 6-foot wood privacy fence in back yard"
        />
      </Field>

      <Field label="Detailed description" required>
        <Textarea
          name="scope_description"
          rows={6}
          required
          minLength={20}
          maxLength={4000}
          placeholder="Materials, dimensions, colors, contractor, anything else the ARC will want to know."
        />
        <Helper>
          Be specific. Materials, dimensions, colors, location. Plans or
          photos can be emailed to the board separately if needed.
        </Helper>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proposed start">
          <Input name="proposed_start" type="date" />
        </Field>
        <Field label="Proposed completion">
          <Input name="proposed_completion" type="date" />
        </Field>
      </div>

      <Field label="Contractor (if known)">
        <Input name="contractor_name" maxLength={200} placeholder="ACME Fencing LLC" />
      </Field>

      <Field label="Contractor license #">
        <Input name="contractor_license" maxLength={100} />
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || units.length === 0}>
          <Send className="h-4 w-4" />
          {isPending ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
