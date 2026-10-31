'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, ThumbsUp, X } from 'lucide-react'
import { Alert, Button, Field, Textarea, useConfirm, useToast } from '@homeowner-portal/ui'
import { respondToArcRequest, type ArcStatus } from '@/lib/board-review'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { trackEvent } from '@/lib/analytics/track'

type Decision = 'in_review' | 'approved' | 'denied'

/** What the board member is told before a decision reaches the resident. */
export const DECISION_CONFIRM: Record<Decision, { title: string; description: string; confirmLabel: string }> = {
  approved: {
    title: 'Approve this request?',
    description: 'The homeowner will be told right away and will see your note.',
    confirmLabel: 'Approve',
  },
  denied: {
    title: 'Deny this request?',
    description: 'The homeowner will be told right away and will see your note, so say why.',
    confirmLabel: 'Deny',
  },
  in_review: {
    title: 'Mark this request as in review?',
    description: 'The homeowner will be told it is being looked at and will see your note.',
    confirmLabel: 'Mark in review',
  },
}

const DECISION_DONE: Record<Decision, string> = {
  in_review: 'Marked in review.',
  approved: 'Application approved.',
  denied: 'Application denied.',
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
  const toast = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState(currentResponse ?? '')

  async function ask(decision: Decision) {
    if (await confirm(DECISION_CONFIRM[decision])) submit(decision)
  }

  function submit(decision: Decision) {
    setError(null)
    setPendingDecision(decision)
    startTransition(async () => {
      const result = await respondToArcRequest({
        arcId,
        decision,
        boardResponse: response.trim() || null,
      })
      setPendingDecision(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      trackEvent('arc.decided', { decision })
      toast({ tone: 'success', message: DECISION_DONE[decision] })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Field
        label="Board response"
        hint="Optional. Conditions, color samples, or the reason for a denial. The resident sees this verbatim."
        labelAside={
          <AiRewriteButton
            value={response}
            onChange={setResponse}
            context="ARC application board response — the resident sees this verbatim"
            disabled={isPending}
          />
        }
      >
        <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={4000} />
      </Field>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void ask('approved')}
          loading={pendingDecision === 'approved'}
          disabled={isPending}
          icon={<ThumbsUp aria-hidden />}
        >
          {currentStatus === 'approved' ? 'Save approval' : 'Approve'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => void ask('denied')}
            loading={pendingDecision === 'denied'}
            disabled={isPending}
            icon={<X aria-hidden />}
          >
            {currentStatus === 'denied' ? 'Save denial' : 'Deny'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void ask('in_review')}
            loading={pendingDecision === 'in_review'}
            disabled={isPending || currentStatus === 'in_review'}
            icon={<Eye aria-hidden />}
          >
            {currentStatus === 'in_review' ? 'In review' : 'Mark in review'}
          </Button>
        </div>
      </div>
    </div>
  )
}
