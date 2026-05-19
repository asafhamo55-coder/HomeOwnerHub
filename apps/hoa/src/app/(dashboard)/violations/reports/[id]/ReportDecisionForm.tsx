'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Eye, X } from 'lucide-react'
import { Button, Textarea } from '@homeowner-portal/ui'
import { respondToViolationReport } from '@/lib/board-review'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'

export function ReportDecisionForm({
  reportId,
  currentNote,
}: {
  reportId: string
  currentNote: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(currentNote ?? '')

  function submit(
    decision:
      | 'under_review'
      | 'opened_as_violation'
      | 'closed_no_action'
      | 'dismissed',
  ) {
    setError(null)
    startTransition(async () => {
      const result = await respondToViolationReport({
        reportId,
        decision,
        boardNote: note.trim() || null,
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
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Internal note (board only)</span>
          <AiRewriteButton
            value={note}
            onChange={setNote}
            context="Internal board note on a violation report — not visible to the reporter"
            disabled={isPending}
          />
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Notes for other board members. Not visible to the reporter."
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('under_review')}
          disabled={isPending}
        >
          <Eye className="h-4 w-4" />
          Mark under review
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('dismissed')}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
          Dismiss
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit('closed_no_action')}
          disabled={isPending}
        >
          Close — no action
        </Button>
        <Button
          size="sm"
          onClick={() => submit('opened_as_violation')}
          disabled={isPending}
        >
          <AlertTriangle className="h-4 w-4" />
          Open as formal violation
        </Button>
      </div>
    </div>
  )
}
