'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Eye } from 'lucide-react'
import { Badge, Button, Textarea } from '@homeowner-portal/ui'
import { respondToArcRequest, type ArcStatus } from '@/lib/board-review'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'

const DECISION_DONE: Record<'in_review' | 'approved' | 'denied', string> = {
  in_review: 'Marked in review.',
  approved: 'Application approved.',
  denied: 'Application denied.',
}

const STATUS_LABEL: Record<ArcStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  approved: 'Approved',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
}

const STATUS_VARIANT: Record<ArcStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  in_review: 'default',
  approved: 'success',
  denied: 'destructive',
  withdrawn: 'outline',
}

export function ArcDecisionForm({
  arcId,
  currentResponse,
  currentStatus,
}: {
  arcId: string
  currentResponse: string | null
  currentStatus: ArcStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [response, setResponse] = useState(currentResponse ?? '')

  function submit(decision: 'in_review' | 'approved' | 'denied') {
    setError(null)
    setSuccess(null)
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
      setSuccess(DECISION_DONE[decision])
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Current status</span>
        <Badge variant={STATUS_VARIANT[currentStatus]} size="sm">
          {STATUS_LABEL[currentStatus]}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Board response (optional)</span>
          <AiRewriteButton
            value={response}
            onChange={setResponse}
            context="ARC application board response — the resident sees this verbatim"
            disabled={isPending}
          />
        </div>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Required conditions, color samples, or reason for denial. The resident sees this verbatim."
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {success}
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
          {isPending ? 'Saving…' : 'Mark in review'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('denied')}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Deny'}
        </Button>
        <Button size="sm" onClick={() => submit('approved')} disabled={isPending}>
          <Check className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Approve'}
        </Button>
      </div>
    </div>
  )
}
