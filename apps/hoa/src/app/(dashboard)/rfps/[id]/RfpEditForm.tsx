'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
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
  const scopeRef = useRef<HTMLTextAreaElement>(null)
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
      <Field label="Title" required>
        <Input name="title" defaultValue={initialTitle} required />
      </Field>

      <Field
        label="Scope"
        required
        labelAside={
          <AiRewriteButton
            textareaRef={scopeRef}
            context="RFP scope of work — preserve dates, dollar amounts, deadlines, and deliverables"
            disabled={isPending}
          />
        }
      >
        <Textarea ref={scopeRef} name="scope" rows={8} defaultValue={initialScope} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget minimum" optional>
          <Input name="budgetMin" inputMode="numeric" prefix="$" defaultValue={initialBudgetMin ?? ''} />
        </Field>
        <Field label="Budget maximum" optional>
          <Input name="budgetMax" inputMode="numeric" prefix="$" defaultValue={initialBudgetMax ?? ''} />
        </Field>
      </div>

      <Field label="Bids due">
        <Input name="submissionDeadline" type="datetime-local" defaultValue={initialDeadlineLocal} />
      </Field>

      {error ? (
        <Alert variant="error" title="Couldn’t save the draft">
          {error}
        </Alert>
      ) : null}
      {success ? <Alert variant="success">Changes saved.</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={isPending}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
