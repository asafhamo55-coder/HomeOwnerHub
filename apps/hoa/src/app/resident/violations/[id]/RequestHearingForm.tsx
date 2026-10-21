'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gavel } from 'lucide-react'
import { Button, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { requestViolationHearing } from '@/lib/violation-hearings/actions'
import { MAX_STATEMENT } from '@/lib/violation-hearings/rules'

// BL-133: "Request a hearing" on a violation on the resident's own home.
// Records the request (and an optional written statement) for the board,
// which schedules the hearing and sends the notice. Nothing is sent to the
// resident from here.

export function RequestHearingForm({ violationId }: { violationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [statement, setStatement] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await requestViolationHearing(violationId, statement.trim() || null)
      if (!result.ok) {
        setError(result.fieldErrors?.statement ?? result.error)
        return
      }
      setStatement('')
      toast({ tone: 'success', message: 'Hearing requested. The board will schedule it and send you a notice.' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Your statement"
        optional
        hint="What you want the hearing to consider. The board sees it with your request."
        error={error}
      >
        <Textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={4}
          maxLength={MAX_STATEMENT}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" loading={isPending} icon={<Gavel aria-hidden />}>
        Request a hearing
      </Button>
    </form>
  )
}
