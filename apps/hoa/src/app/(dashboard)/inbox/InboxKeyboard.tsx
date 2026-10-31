'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Keyboard } from 'lucide-react'
import { Button, Dialog, DialogContent, useToast } from '@homeowner-portal/ui'
import { setThreadStatus } from '@/lib/inbox/actions'
import {
  INBOX_APPROVE_CLOSE_EVENT,
  INBOX_EDIT_EVENT,
  INBOX_SHORTCUTS,
  type InboxKeyAction,
} from '@/lib/inbox/keys'
import { useInboxKeys } from './useInboxKeys'

/**
 * The inbox keyboard layer (BL-101 A3): j/k move, a approves and closes,
 * e edits, c closes, ? shows the list. Approve and edit are forwarded to
 * the composer as window events, so this component never touches draft
 * state and the composer's own gates (blanks, recipients) still decide.
 */
export function InboxKeyboard({
  prevHref,
  nextHref,
  threadId = null,
  afterCloseHref = null,
  showButton = false,
}: {
  prevHref: string | null
  nextHref: string | null
  /** Set on the thread page; "c" does nothing on the list. */
  threadId?: string | null
  /** Where "c" goes once the thread is closed. */
  afterCloseHref?: string | null
  /** Render a visible "Shortcuts" button as well as the ? key. */
  showButton?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [helpOpen, setHelpOpen] = useState(false)
  const [, startTransition] = useTransition()

  useInboxKeys((action: InboxKeyAction) => {
    switch (action) {
      case 'next':
        if (nextHref) router.push(nextHref)
        return
      case 'prev':
        if (prevHref) router.push(prevHref)
        return
      case 'approve_close':
        window.dispatchEvent(new Event(INBOX_APPROVE_CLOSE_EVENT))
        return
      case 'edit':
        window.dispatchEvent(new Event(INBOX_EDIT_EVENT))
        return
      case 'close':
        if (!threadId) return
        startTransition(async () => {
          const form = new FormData()
          form.set('threadId', threadId)
          form.set('status', 'closed')
          const result = await setThreadStatus({}, form)
          if (result.error) {
            toast({ tone: 'error', title: "Couldn't close it", message: result.error })
            return
          }
          if (afterCloseHref) router.push(afterCloseHref)
          else router.refresh()
        })
        return
      case 'help':
        setHelpOpen((open) => !open)
        return
    }
  })

  return (
    <>
      {showButton ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={<Keyboard aria-hidden />}
          onClick={() => setHelpOpen(true)}
        >
          Shortcuts
        </Button>
      ) : null}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent title="Keyboard shortcuts" description="They work anywhere in the Inbox except while you type.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {INBOX_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="contents">
                <dt>
                  <kbd className="rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-xs">
                    {shortcut.key}
                  </kbd>
                </dt>
                <dd className="text-foreground-secondary">{shortcut.label}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  )
}
