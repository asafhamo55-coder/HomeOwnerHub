'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Alert, Button, cn } from '@homeowner-portal/ui'
import { SAVED_REPLIES } from '@/lib/inbox/saved-replies'
import { resolveSavedReply } from '@/lib/inbox/saved-replies-actions'
import { INSERT_MESSAGE, dispatchInsertIntoReply } from '@/lib/inbox/reply-insert'

/**
 * BL-101 A5 — "Saved replies" in the reply composer. Picking one fills its
 * merge fields on the server (the balance only behind the A2 disclosure
 * gate) and puts the paragraph into the draft at the cursor, through the
 * same insert path as the acknowledgement lines. Nothing is saved or sent:
 * any `[[BLANK]]` it carries keeps Approve blocked until filled in.
 */
export function SavedReplyPicker({ threadId, disabled }: { threadId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const listId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)

  // The list unmounts on pick or Escape; without this, focus falls to <body>.
  function closeList() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  function pick(replyId: string) {
    setNote(null)
    startTransition(async () => {
      const r = await resolveSavedReply({ threadId, replyId })
      if (!r.ok) {
        setNote({ tone: 'error', text: r.error })
        return
      }
      const result = dispatchInsertIntoReply(r.text)
      closeList()
      if (result !== 'inserted') {
        setNote({ tone: 'warn', text: INSERT_MESSAGE[result] })
        return
      }
      setNote(
        r.balanceWithheld
          ? { tone: 'warn', text: 'Added. The balance is left blank: the sender isn’t verified for this home, or the ledger couldn’t be read in full.' }
          : { tone: 'ok', text: 'Added. Fill in any highlighted blanks before you approve.' },
      )
    })
  }

  return (
    <div className="space-y-2">
      <Button
        ref={toggleRef}
        type="button"
        size="sm"
        variant="secondary"
        icon={<MessageSquareText aria-hidden />}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        loading={pending}
        onClick={() => setOpen((v) => !v)}
      >
        Saved replies
      </Button>
      {open ? (
        <ul
          id={listId}
          className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1.5"
          aria-label="Saved replies"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              closeList()
            }
          }}
        >
          {SAVED_REPLIES.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(r.id)}
                className="w-full rounded-md px-2.5 py-2 text-left transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="block text-sm font-medium text-foreground">{r.title}</span>
                <span className="block text-xs text-muted">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note?.tone === 'error' ? <Alert variant="error">{note.text}</Alert> : null}
      {/* Always mounted: a live region inserted together with its text is
          often not announced, so "Added…" would go unheard. */}
      <p className={cn('text-xs', note?.tone === 'ok' ? 'text-success' : 'text-warning')} aria-live="polite">
        {note && note.tone !== 'error' ? note.text : null}
      </p>
    </div>
  )
}
