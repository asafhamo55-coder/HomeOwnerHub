'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
import { updateRfp } from '@/lib/rfps'

interface Props {
  rfpId: string
  initialTitle: string
  initialScope: string
  initialBudgetMin: number | null
  initialBudgetMax: number | null
  initialSubmissionDeadline: string
}

export function RfpEditForm({
  rfpId,
  initialTitle,
  initialScope,
  initialBudgetMin,
  initialBudgetMax,
  initialSubmissionDeadline,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Convert ISO to datetime-local-friendly "YYYY-MM-DDTHH:mm"
  const initialDeadlineLocal = (() => {
    const d = new Date(initialSubmissionDeadline)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)

    const title = String(formData.get('title') ?? '').trim()
    const scope = String(formData.get('scope') ?? '').trim()
    const budgetMinRaw = String(formData.get('budgetMin') ?? '').trim()
    const budgetMaxRaw = String(formData.get('budgetMax') ?? '').trim()
    const deadlineRaw = String(formData.get('submissionDeadline') ?? '').trim()

    const budgetMin = budgetMinRaw
      ? Number(budgetMinRaw.replace(/[^0-9.]/g, ''))
      : null
    const budgetMax = budgetMaxRaw
      ? Number(budgetMaxRaw.replace(/[^0-9.]/g, ''))
      : null

    let submissionDeadline: string | undefined = undefined
    if (deadlineRaw && deadlineRaw !== initialDeadlineLocal) {
      submissionDeadline = new Date(deadlineRaw).toISOString()
    }

    startTransition(async () => {
      const result = await updateRfp({
        rfpId,
        title,
        scope,
        budgetMin,
        budgetMax,
        submissionDeadline,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">Title</span>
        <Input name="title" defaultValue={initialTitle} required />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">Scope</span>
        <Textarea name="scope" rows={8} defaultValue={initialScope} required />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Budget min ($)</span>
          <Input
            name="budgetMin"
            inputMode="numeric"
            defaultValue={initialBudgetMin ?? ''}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Budget max ($)</span>
          <Input
            name="budgetMax"
            inputMode="numeric"
            defaultValue={initialBudgetMax ?? ''}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">Submission deadline</span>
        <Input
          name="submissionDeadline"
          type="datetime-local"
          defaultValue={initialDeadlineLocal}
        />
      </label>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Changes saved.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
