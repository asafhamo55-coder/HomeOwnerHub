'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createTicket, type TicketCategory } from '@/lib/resident-tickets'
import type { ResidentUnit } from '@/lib/resident'

const CATEGORIES: Array<{ value: TicketCategory; label: string }> = [
  { value: 'maintenance', label: 'Maintenance request' },
  { value: 'noise', label: 'Noise complaint' },
  { value: 'parking', label: 'Parking issue' },
  { value: 'common_area', label: 'Common area' },
  { value: 'billing', label: 'Billing / dues question' },
  { value: 'access', label: 'Access / key / gate' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'general', label: 'General question' },
  { value: 'other', label: 'Other' },
]

export function CreateTicketForm({
  units,
  defaultSubject,
  defaultDescription,
}: {
  units: ResidentUnit[]
  defaultSubject?: string
  defaultDescription?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const descRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})

    const unitId = String(formData.get('unit_id') ?? '')
    const category = String(formData.get('category') ?? '') as TicketCategory
    const subject = String(formData.get('subject') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()

    startTransition(async () => {
      const result = await createTicket({ unitId, category, subject, description })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors)
        } else {
          setError(result.error)
        }
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
        <Field label="Home" required error={fieldErrors.unit_id}>
          <Select name="unit_id" placeholder="Choose a home" disabled={units.length === 0}>
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {[u.unit_number, u.address].filter(Boolean).join(' — ') || 'Your unit'}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Category" required error={fieldErrors.category}>
        <Select name="category" placeholder="Choose one…">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" required error={fieldErrors.subject} hint="A short summary, e.g. “Pool gate latch is sticking”.">
        <Input name="subject" maxLength={200} defaultValue={defaultSubject} />
      </Field>

      <Field
        label="Description"
        required
        error={fieldErrors.description}
        hint="Include dates, locations and anything the board needs to act. At least 20 characters."
        labelAside={
          <AiRewriteButton
            textareaRef={descRef}
            context="Resident support ticket — preserve specific details, dates, locations, and any reference numbers"
            disabled={isPending}
          />
        }
      >
        <Textarea ref={descRef} name="description" rows={6} maxLength={4000} defaultValue={defaultDescription} />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending} disabled={units.length === 0} icon={<Send aria-hidden />}>
          Send request
        </Button>
      </div>
    </form>
  )
}
