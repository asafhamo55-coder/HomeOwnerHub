'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
import { createRfpDraft } from '@/lib/rfps'

export function NewRfpForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const freeTextNeed = String(formData.get('freeTextNeed') ?? '').trim()
    const budgetMinRaw = String(formData.get('budgetMin') ?? '').trim()
    const budgetMaxRaw = String(formData.get('budgetMax') ?? '').trim()
    const deadlineRaw = String(formData.get('submissionDeadline') ?? '').trim()

    const budgetMin = budgetMinRaw
      ? Number(budgetMinRaw.replace(/[^0-9.]/g, ''))
      : null
    const budgetMax = budgetMaxRaw
      ? Number(budgetMaxRaw.replace(/[^0-9.]/g, ''))
      : null

    if (!deadlineRaw) {
      setError('Submission deadline is required.')
      return
    }
    // Datetime-local input gives us a value like "2026-08-01T17:00";
    // convert to ISO with the local timezone.
    const submissionDeadline = new Date(deadlineRaw).toISOString()

    startTransition(async () => {
      const result = await createRfpDraft({
        freeTextNeed,
        budgetMin,
        budgetMax,
        submissionDeadline,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/rfps/${result.data.rfpId}`)
    })
  }

  // Default deadline = 21 days out, 5pm local
  const defaultDeadline = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 21)
    d.setHours(17, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })()

  return (
    <form action={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">
          What does the association need? <span className="text-destructive">*</span>
        </span>
        <Textarea
          name="freeTextNeed"
          rows={6}
          required
          minLength={10}
          maxLength={4000}
          placeholder="We need a landscaper for our 4-acre common area: bi-weekly mowing April–October, quarterly fertilization, and seasonal leaf removal in fall. Existing vendor's contract expires Sep 30."
        />
        <p className="text-xs text-muted-fg">
          Describe it in your own words. The Composer turns this into a
          structured scope, line items, and evaluation criteria.
        </p>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Budget — minimum ($)</span>
          <Input name="budgetMin" inputMode="numeric" placeholder="20000" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Budget — maximum ($)</span>
          <Input name="budgetMax" inputMode="numeric" placeholder="35000" />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">
          Submission deadline <span className="text-destructive">*</span>
        </span>
        <Input
          name="submissionDeadline"
          type="datetime-local"
          required
          defaultValue={defaultDeadline}
        />
        <p className="text-xs text-muted-fg">
          Vendors must submit their bid by this date/time.
        </p>
      </label>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Sparkles className="h-4 w-4" />
          {isPending ? 'Drafting…' : 'Draft RFP'}
        </Button>
      </div>

      <p className="text-xs text-muted-fg">
        The draft lands in <span className="font-mono">/rfps</span> as
        status `draft` for your review. Nothing is sent to vendors until
        you publish.
      </p>
    </form>
  )
}
