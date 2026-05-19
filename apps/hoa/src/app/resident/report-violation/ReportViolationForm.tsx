'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import {
  createViolationReport,
  type ViolationCategory,
} from '@/lib/resident-submissions'

const CATEGORIES: Array<{ value: ViolationCategory; label: string }> = [
  { value: 'parking', label: 'Parking / vehicles' },
  { value: 'pet', label: 'Pet (off-leash, waste, etc.)' },
  { value: 'noise', label: 'Noise / quiet hours' },
  { value: 'lawn_landscape', label: 'Lawn / landscaping' },
  { value: 'trash', label: 'Trash / debris' },
  { value: 'architectural', label: 'Unapproved architectural change' },
  { value: 'rental', label: 'Short-term rental / leasing' },
  { value: 'nuisance', label: 'General nuisance' },
  { value: 'other', label: 'Other' },
]

export function ReportViolationForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)

    const category = String(formData.get('category') ?? '') as ViolationCategory
    const description = String(formData.get('description') ?? '').trim()
    const aboutAddress = String(formData.get('about_address') ?? '').trim()
    const occurredAt = String(formData.get('occurred_at') ?? '').trim() || null

    startTransition(async () => {
      const result = await createViolationReport({
        category,
        description,
        aboutAddress,
        occurredAt,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/resident'), 1500)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="What kind of issue?" required>
        <Select name="category" required placeholder="Choose one…">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Address or location" required>
        <Input
          name="about_address"
          required
          maxLength={300}
          placeholder="123 Madison Park Drive (or 'common area near pool')"
        />
        <Helper>
          The street address, unit number, or location where you observed
          the issue. If you only know roughly where, describe it.
        </Helper>
      </Field>

      <Field label="When did it happen?">
        <Input name="occurred_at" type="datetime-local" />
        <Helper>Approximate is fine.</Helper>
      </Field>

      <Field label="What did you observe?" required>
        <div className="space-y-1.5">
          <div className="flex justify-end">
            <AiRewriteButton
              textareaRef={descriptionRef}
              context="Resident-submitted violation report — preserve facts, dates, and times exactly; avoid speculation or accusations"
              disabled={isPending}
            />
          </div>
          <Textarea
            ref={descriptionRef}
            name="description"
            rows={6}
            required
            minLength={20}
            maxLength={4000}
            placeholder="Just the facts — what, when, how often. The board will follow up if more info is needed."
          />
        </div>
        <Helper>
          Stick to what you observed. Avoid speculation or accusations.
          Photos can be emailed to the board separately.
        </Helper>
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Report submitted. Redirecting…
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Send className="h-4 w-4" />
          {isPending ? 'Submitting…' : 'Submit report'}
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
