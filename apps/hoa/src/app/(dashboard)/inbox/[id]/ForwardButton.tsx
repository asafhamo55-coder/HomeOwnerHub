'use client'

import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createForwardDraft } from '@/lib/inbox/draft/actions'

/**
 * Forward lives in the THREAD HEADER, not in DraftPanel.
 *
 * It shipped inside DraftPanel, rendered only in the "no draft" and
 * "cancelled" branches. `getLatestDraft` returns the newest draft whatever
 * its status, and the `sent`, `queued`/`sending` and `failed` branches all
 * return before reaching a Forward button — so the single most common forward
 * case was impossible: a resident reports a broken fence, the board replies,
 * and now wants the landscaper to see it. The latest draft is `sent`,
 * DraftPanel renders "Reply sent" with no controls, and there was no path to
 * a forward on that thread, ever.
 *
 * In the header it is reachable in every state, and there is exactly one of
 * it. A new forward draft becomes the latest draft, so the composer below
 * opens on it — including over a `sent` reply, which is the whole point.
 */
export function ForwardButton({ threadId }: { threadId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleForward() {
    setError(null)
    startTransition(async () => {
      const result = await createForwardDraft(threadId)
      // Never silent: the action's own message is shown as-is. It carries no
      // address, subject, or body — see createForwardDraft.
      if ('error' in result) setError(result.error)
    })
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" loading={pending} onClick={handleForward}>
        Forward
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
