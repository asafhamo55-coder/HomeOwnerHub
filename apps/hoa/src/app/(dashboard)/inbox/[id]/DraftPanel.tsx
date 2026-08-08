'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createDraft, approveDraft, cancelDraft } from '@/lib/inbox/draft/actions'
import { UNDO_WINDOW_SECONDS } from '@/lib/inbox/draft/blanks'
import type { DraftAttachment, ThreadDraft } from '@/lib/inbox/queries'
import { Composer, type ApproveInput } from './Composer'
import { AMBER_BOX } from './draft-ui'

/**
 * All three kinds, named for what they are. This used to be a two-way
 * `kind === 'forward' ? 'Forward sent' : 'Reply sent'`, which told someone who
 * had just composed a brand-new message that a *reply* had been sent — there
 * was no reply. Keyed off `ThreadDraft['kind']` so a fourth kind is a type
 * error here rather than silently falling back to the wrong word.
 */
const SENT_HEADLINE: Record<ThreadDraft['kind'], string> = {
  reply: 'Reply sent',
  forward: 'Forward sent',
  new: 'Message sent',
}

interface Props {
  threadId: string | null
  draft: ThreadDraft | null
  attachments: DraftAttachment[]
  threadFiles: Array<{ id: string; fileName: string; sizeBytes: number }>
  libraryFiles: Array<{ id: string; name: string; type: string; sizeBytes: number }>
}

export function DraftPanel({ threadId, draft, attachments, threadFiles, libraryFiles }: Props) {
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  function handleCreate() {
    if (!threadId) return
    setActionError(null)
    startTransition(async () => {
      const result = await createDraft(threadId)
      if ('error' in result) setActionError(result.error)
    })
  }

  // No Forward handler here, deliberately. Forward lives in the thread
  // header (ForwardButton.tsx) so it is reachable in EVERY draft state —
  // this panel returns early on 'sent', 'queued'/'sending' and 'failed', so a
  // button in here could never be reached on a thread that had already been
  // replied to, which is the commonest reason to forward one.
  function handleApprove(input: ApproveInput) {
    if (!draft) return
    setActionError(null)
    startTransition(async () => {
      const result = await approveDraft(draft.id, input)
      if ('error' in result) setActionError(result.error)
    })
  }

  function handleCancel() {
    if (!draft) return
    setActionError(null)
    startTransition(async () => {
      const result = await cancelDraft(draft.id)
      if ('error' in result) setActionError(result.error)
    })
  }

  // ── 1. No draft yet ──
  if (!draft) {
    return (
      <section className="mt-4 space-y-2 rounded-md border border-border p-3">
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        {threadId ? (
          <Button size="sm" loading={pending} onClick={handleCreate}>
            Draft a reply
          </Button>
        ) : null}
      </section>
    )
  }

  // ── 5. Sent — confirmation, no controls ──
  if (draft.status === 'sent') {
    return (
      <section className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="font-semibold text-foreground">{SENT_HEADLINE[draft.kind]}</p>
        <p className="mt-1 text-xs text-muted">{draft.subject}</p>
      </section>
    )
  }

  // ── 6. Failed — the error, and an explicit new draft. Never automatic. ──
  //
  // `status='failed'` is written by exactly one place: mailbox-send.ts's
  // `fail()` (and the watchdog in mailbox-sync.ts, for a send stuck in
  // 'sending'). `createDraft` never writes it. So 'failed' ALWAYS means the
  // SEND failed — never that drafting failed.
  //
  // This panel used to headline "Drafting failed" with a "Try again" button
  // that called `createDraft`. Both were wrong in the same direction, and
  // together they made this the only path in the feature that can put the
  // same reply in front of a resident twice: `sendReply` deliberately has no
  // retry, precisely because an ambiguous failure (a timeout where Gmail may
  // already have accepted the message) must be a human's decision — and then
  // the UI told that human their DRAFT failed, from which the only
  // reasonable conclusion is that nothing was sent.
  //
  // So: name the send, say plainly that delivery is unknown, and label the
  // button for what it actually does. It writes a NEW draft; it does not
  // retry the send, and there is no way to retry the send.
  if (draft.status === 'failed') {
    return (
      <section className="mt-4 space-y-2 rounded-md border border-destructive/40 p-3">
        <p className="text-sm font-semibold text-foreground">Sending this reply failed</p>
        <p className="text-xs text-muted">{draft.error ?? 'Something went wrong.'}</p>
        <p className={AMBER_BOX}>
          This reply may still have reached the resident — a send can fail
          after the message was already accepted for delivery. Check the
          thread, or the mailbox&apos;s Sent folder, before writing another
          one, or they may receive it twice.
        </p>
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        {/* Guarded on threadId like the no-draft and cancelled branches:
            `handleCreate` early-returns when it is null, so on the compose
            page (which has no thread) an unguarded button would render and
            then silently do nothing when pressed. */}
        {threadId ? (
          <>
            <Button size="sm" loading={pending} onClick={handleCreate}>
              Write a new draft
            </Button>
            <p className="text-xs text-muted">
              This starts a fresh draft for you to review and approve. It does
              not resend the reply above.
            </p>
          </>
        ) : null}
      </section>
    )
  }

  // A cancelled draft is not one of the six states in the spec, but it's a
  // reachable status (cancelDraft) and must not be mistaken for "still
  // queued" or silently render nothing — offer the same fresh start as
  // "no draft".
  if (draft.status === 'cancelled') {
    return (
      <section className="mt-4 space-y-2 rounded-md border border-border p-3">
        <p className="text-xs text-muted">This reply was cancelled before it sent.</p>
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        {threadId ? (
          <Button size="sm" loading={pending} onClick={handleCreate}>
            Draft a reply
          </Button>
        ) : null}
      </section>
    )
  }

  // ── 4. Queued — countdown + Undo. `sending` is the brief window between
  // the undo deadline passing and the send job's own status update; treated
  // as "no more undo" rather than invented as a 7th top-level state. ──
  if (draft.status === 'queued' || draft.status === 'sending') {
    return (
      <section className="mt-4 space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="font-semibold text-foreground">{draft.subject}</p>
        <p className="text-xs text-muted">
          To: {draft.toEmails.join(', ')}
          {draft.ccEmails.length > 0 ? ` · Cc: ${draft.ccEmails.join(', ')}` : ''}
        </p>
        <p className="whitespace-pre-wrap text-xs text-foreground">{draft.bodyText}</p>
        {draft.status === 'queued' && attachments.length > 0 ? (
          <p className="text-xs text-muted">
            {attachments.map((file) => file.fileName).join(', ')}
          </p>
        ) : null}
        {draft.status === 'queued' && draft.sendAfter ? (
          <Countdown sendAfter={draft.sendAfter} />
        ) : (
          <p className="text-xs text-muted">Sending…</p>
        )}
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        {draft.status === 'queued' ? (
          <Button size="sm" variant="outline" loading={pending} onClick={handleCancel}>
            Undo
          </Button>
        ) : null}
      </section>
    )
  }

  // ── 2 + 3. draft — the shared composer. ──
  return (
    <Composer
      draft={draft}
      pending={pending}
      actionError={actionError}
      onApprove={handleApprove}
      attachments={attachments}
      threadFiles={threadFiles}
      libraryFiles={libraryFiles}
    />
  )
}

function clampRemaining(target: number): number {
  // Clamped to UNDO_WINDOW_SECONDS so client/server clock skew can never
  // display a countdown longer than the window actually is.
  return Math.min(UNDO_WINDOW_SECONDS, Math.max(0, Math.round((target - Date.now()) / 1000)))
}

function Countdown({ sendAfter }: { sendAfter: string }) {
  const target = new Date(sendAfter).getTime()
  const [remaining, setRemaining] = useState(() => clampRemaining(target))

  useEffect(() => {
    setRemaining(clampRemaining(target))
    const interval = setInterval(() => setRemaining(clampRemaining(target)), 1000)
    return () => clearInterval(interval)
  }, [target])

  return (
    <p className="text-xs text-muted">
      {remaining > 0 ? `Sending in ${remaining}s — Undo to cancel` : 'Sending…'}
    </p>
  )
}
