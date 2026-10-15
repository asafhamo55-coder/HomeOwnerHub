'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createRfpDraft } from '@/lib/rfps'

export function NewRfpForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const freeTextRef = useRef<HTMLTextAreaElement>(null)

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
    <form action={handleSubmit} className="space-y-5">
      <Field
        label="What does the association need?"
        required
        hint="In your own words. The composer turns it into a scope, line items and evaluation criteria."
        labelAside={
          <AiRewriteButton
            textareaRef={freeTextRef}
            context="RFP scope description — preserve dates, dollar amounts, deadlines, and acreage"
            disabled={isPending}
          />
        }
      >
        <Textarea
          ref={freeTextRef}
          name="freeTextNeed"
          rows={6}
          required
          minLength={10}
          maxLength={4000}
          placeholder="We need a landscaper for our 4-acre common area: bi-weekly mowing April–October, quarterly fertilization, and seasonal leaf removal in fall. Existing vendor's contract expires Sep 30."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget minimum" optional>
          <Input name="budgetMin" inputMode="numeric" prefix="$" placeholder="20,000" />
        </Field>
        <Field label="Budget maximum" optional>
          <Input name="budgetMax" inputMode="numeric" prefix="$" placeholder="35,000" />
        </Field>
      </div>

      <Field label="Bids due" required hint="Vendors must submit their bid by this date and time.">
        <Input name="submissionDeadline" type="datetime-local" required defaultValue={defaultDeadline} />
      </Field>

      {error ? (
        <Alert variant="error" title="Couldn’t draft the RFP">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Saved as a draft. Nothing goes to vendors until you publish.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} icon={<Sparkles aria-hidden />}>
            {isPending ? 'Drafting…' : 'Draft RFP'}
          </Button>
        </div>
      </div>
    </form>
  )
}
