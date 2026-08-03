'use client'

import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createForwardDraft } from '@/lib/inbox/draft/actions'
import type { ThreadDraft } from '@/lib/inbox/queries'

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
 *
 * But the page renders only ONE draft, so a forward started over a LIVE
 * draft would displace it. When that draft is 'queued', the panel it
 * displaces is the countdown — the only call site of `cancelDraft` — so the
 * reply would still send with no way left to press Undo. `createForwardDraft`
 * refuses in that case; the disabled state below is the affordance that
 * explains why before anyone clicks, not the guarantee.
 */
const BLOCKED_REASON: Partial<Record<ThreadDraft['status'], string>> = {
  queued: 'A reply is sending on this thread — wait for it, or press Undo first.',
  sending: 'A reply is sending on this thread — wait for it to finish.',
  draft: 'Send or cancel the draft below before starting a forward.',
}

export function ForwardButton({
  threadId,
  draftStatus,
}: {
  threadId: string
  /** Status of the thread's latest draft, or null when it has none. */
  draftStatus: ThreadDraft['status'] | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const blockedReason = draftStatus ? (BLOCKED_REASON[draftStatus] ?? null) : null

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
    <div className="max-w-56 space-y-1 text-right">
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        disabled={blockedReason !== null}
        onClick={handleForward}
      >
        Forward
      </Button>
      {blockedReason ? <p className="text-xs text-muted">{blockedReason}</p> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
