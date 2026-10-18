'use client'

import { useActionState } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { retryAttachment, type RetryAttachmentState } from '@/lib/inbox/attachment-retry'

const initial: RetryAttachmentState = {}

/**
 * BL-017 — Retry for one failed attachment. The thread page is already
 * board-only, and the action gates again before touching the database.
 * On success the action revalidates the thread, so the chip re-renders as
 * "downloading…" from the server's state rather than a local guess.
 */
export function AttachmentRetryButton({
  attachmentId,
  fileLabel,
}: {
  attachmentId: string
  /** For the accessible name only — never logged. */
  fileLabel: string
}) {
  const [state, action, pending] = useActionState(retryAttachment, initial)
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        icon={<RotateCw aria-hidden />}
        loading={pending}
        aria-label={`Retry downloading ${fileLabel}`}
      >
        Retry
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
