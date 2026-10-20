'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, MoreHorizontal, PencilLine, Send } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { setThreadStatus } from '@/lib/inbox/actions'
import { INBOX_APPROVE_CLOSE_EVENT, INBOX_EDIT_EVENT } from '@/lib/inbox/keys'

/** Ids the bar scrolls to: the thread header (convert, assign, forward) and the reply. */
export const THREAD_TOP_ANCHOR = 'thread-top'
export const REPLY_ANCHOR = 'thread-reply'

/**
 * BL-101 A7 — the thread's actions within thumb reach on a phone: a bar
 * at the foot of the inbox frame below `lg` (it is the frame's last row,
 * not an overlay, so it never covers the conversation), clear of the
 * home indicator via env(safe-area-inset-bottom).
 *
 * Approve and Edit are the same window events as the a / e shortcuts, so
 * the composer's own gates (blanks, recipients) decide exactly as for the
 * button; approveDraft re-checks on the server regardless. Close is the
 * same setThreadStatus as the c shortcut.
 */
export function MobileActionBar({
  threadId,
  hasDraft,
  status,
  afterCloseHref,
}: {
  threadId: string
  /** An editable reply draft is open (the composer is mounted). */
  hasDraft: boolean
  status: string
  afterCloseHref: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const reveal = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  function approve() {
    // Show the reply first: if a blank or a missing recipient blocks the
    // send, its footer says why.
    reveal(REPLY_ANCHOR)
    window.dispatchEvent(new Event(INBOX_APPROVE_CLOSE_EVENT))
  }

  function close() {
    setError(null)
    startTransition(async () => {
      const form = new FormData()
      form.set('threadId', threadId)
      form.set('status', 'closed')
      const result = await setThreadStatus({}, form)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(afterCloseHref)
    })
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
      {error ? (
        <p className="pb-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        <Button type="button" size="sm" disabled={!hasDraft || pending} onClick={approve} icon={<Send aria-hidden />}>
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!hasDraft}
          onClick={() => window.dispatchEvent(new Event(INBOX_EDIT_EVENT))}
          icon={<PencilLine aria-hidden />}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={status === 'closed'}
          loading={pending}
          onClick={close}
          icon={<Archive aria-hidden />}
        >
          Close
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => reveal(THREAD_TOP_ANCHOR)} icon={<MoreHorizontal aria-hidden />}>
          More
        </Button>
      </div>
    </div>
  )
}
