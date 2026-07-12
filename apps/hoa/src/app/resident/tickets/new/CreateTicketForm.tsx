'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@homeowner-portal/ui'
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
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const unitId = String(formData.get('unit_id') ?? '')
    const category = String(formData.get('category') ?? '') as TicketCategory
    const subject = String(formData.get('subject') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()

    startTransition(async () => {
      const result = await createTicket({ unitId, category, subject, description })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/resident/tickets')
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Unit" required>
        <Select name="unit_id" required placeholder="Select unit">
          {units.length === 0 ? (
            <option value="none" disabled>(no units linked)</option>
          ) : (
            units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {[u.unit_number, u.address].filter(Boolean).join(' — ') || 'Your unit'}
              </option>
            ))
          )}
        </Select>
      </Field>

      <Field label="Category" required>
        <Select name="category" required placeholder="Choose one…">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" required>
        <Input
          name="subject"
          required
          maxLength={200}
          defaultValue={defaultSubject}
          placeholder="Brief summary of your issue"
        />
      </Field>

      <Field label="Description" required>
        <div className="space-y-1.5">
          <div className="flex justify-end">
            <AiRewriteButton
              textareaRef={descRef}
              context="Resident support ticket — preserve specific details, dates, locations, and any reference numbers"
              disabled={isPending}
            />
          </div>
          <Textarea
            ref={descRef}
            name="description"
            rows={6}
            required
            minLength={20}
            maxLength={4000}
            defaultValue={defaultDescription}
            placeholder="Describe the issue in detail. Include dates, locations, and any relevant information."
          />
        </div>
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
          {isPending ? 'Submitting…' : 'Submit ticket'}
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
