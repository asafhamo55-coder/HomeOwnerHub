'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { cancelDraft } from '@/lib/inbox/draft/actions'
import { UNDO_WINDOW_SECONDS } from '@/lib/inbox/draft/blanks'

/**
 * "Approve and send" closes the thread and opens the next one (BL-101 A3),
 * which would otherwise take the 30-second Undo off screen with the thread
 * it belongs to. This carries it over: the next thread page shows the
 * reply that is still queued, with the same Undo (cancelDraft, which also
 * puts the closed thread back in the queue).
 */
export function UndoSendBanner({
  draftId,
  sendAfter,
  subject,
  threadHref,
}: {
  draftId: string
  sendAfter: string
  subject: string
  threadHref: string | null
}) {
  const target = new Date(sendAfter).getTime()
  const [remaining, setRemaining] = useState(() => clamp(target))
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<'queued' | 'cancelled' | { error: string }>('queued')

  useEffect(() => {
    setRemaining(clamp(target))
    const interval = setInterval(() => setRemaining(clamp(target)), 1000)
    return () => clearInterval(interval)
  }, [target])

  if (state === 'cancelled') {
    return (
      <Alert variant="info">
        Reply cancelled. Nothing was sent, and the conversation is back in Needs review.{' '}
        {threadHref ? <Link href={threadHref}>Open it</Link> : null}
      </Alert>
    )
  }
  if (remaining <= 0 && state === 'queued') return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-subtle/60 px-4 py-3 text-sm"
    >
      <p className="min-w-0 text-foreground">
        <span className="font-medium">Reply queued</span>
        <span className="text-foreground-secondary">{` · ${subject}`}</span>
        <span className="num ml-2 text-xs text-muted">Sending in {remaining}s</span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        icon={<Undo2 aria-hidden />}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelDraft(draftId)
            setState('error' in result ? { error: result.error } : 'cancelled')
          })
        }
      >
        Undo
      </Button>
      {typeof state === 'object' ? (
        <Alert variant="error" className="w-full">
          {state.error}
        </Alert>
      ) : null}
    </div>
  )
}

function clamp(target: number): number {
  return Math.min(UNDO_WINDOW_SECONDS, Math.max(0, Math.round((target - Date.now()) / 1000)))
}
