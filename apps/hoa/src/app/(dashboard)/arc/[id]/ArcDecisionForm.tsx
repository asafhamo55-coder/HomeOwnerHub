'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Eye } from 'lucide-react'
import { Button, Textarea } from '@homeowner-portal/ui'
import { respondToArcRequest } from '@/lib/board-review'

export function ArcDecisionForm({
  arcId,
  currentResponse,
}: {
  arcId: string
  currentResponse: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState(currentResponse ?? '')

  function submit(decision: 'in_review' | 'approved' | 'denied') {
    setError(null)
    startTransition(async () => {
      const result = await respondToArcRequest({
        arcId,
        decision,
        boardResponse: response.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Board response (optional)</span>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Required conditions, color samples, or reason for denial. The resident sees this verbatim."
        />
      </label>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('in_review')}
          disabled={isPending}
        >
          <Eye className="h-4 w-4" />
          Mark in review
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('denied')}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
          Deny
        </Button>
        <Button size="sm" onClick={() => submit('approved')} disabled={isPending}>
          <Check className="h-4 w-4" />
          Approve
        </Button>
      </div>
    </div>
  )
}
