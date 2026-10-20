'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { createRecordsRequest, type CreateRecordsRequestInput } from '@/lib/records-requests/actions'
import { RECORDS_FORMATS, RECORDS_KINDS, RECORDS_PERIODS } from '@/lib/records-requests/law'
import type { ResidentUnit } from '@/lib/resident'

export function RecordsRequestForm({ units }: { units: ResidentUnit[] }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    const input = {
      unitId: String(formData.get('unit_id') ?? ''),
      kind: String(formData.get('kind') ?? ''),
      period: String(formData.get('period') ?? ''),
      format: String(formData.get('format') ?? ''),
      details: String(formData.get('details') ?? '').trim(),
    } as CreateRecordsRequestInput

    startTransition(async () => {
      const result = await createRecordsRequest(input)
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Request sent. The board will reply here.' })
      router.push(`/resident/tickets/${result.data.ticketId}`)
    })
  }

  const singleUnit = units.length === 1 ? units[0] : null

  return (
    <form action={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert variant="error" title="Couldn’t send your request">{error}</Alert> : null}

      {singleUnit ? (
        <input type="hidden" name="unit_id" value={singleUnit.unit_id} />
      ) : (
        <Field label="Home" required error={fieldErrors.unitId}>
          <Select name="unit_id" placeholder="Choose a home">
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {[u.unit_number, u.address].filter(Boolean).join(' — ') || 'Your unit'}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Which records?" required error={fieldErrors.kind}>
        <Select name="kind" placeholder="Choose one…">
          {RECORDS_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Which years?" required error={fieldErrors.period}>
        <Select name="period" placeholder="Choose one…">
          {RECORDS_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Preferred format" required error={fieldErrors.format}>
        <Select name="format" placeholder="Choose one…">
          {RECORDS_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="What do you need?"
        required
        error={fieldErrors.details}
        hint="For example “The 2025 bank statements and the reserve study”. At least 10 characters."
      >
        <Textarea name="details" rows={5} maxLength={4000} />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Send request
        </Button>
      </div>
    </form>
  )
}
