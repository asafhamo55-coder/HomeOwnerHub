'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Sparkles, Undo2, XCircle } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createDraft, approveDraft, cancelDraft } from '@/lib/inbox/draft/actions'
import { autoDraftOnOpen } from '@/lib/inbox/autodraft-actions'
import { UNDO_WINDOW_SECONDS } from '@/lib/inbox/draft/blanks'
import type { DraftAttachment, ThreadDraft } from '@/lib/inbox/queries'
import { Composer, type ApproveInput, type ApproveOptions } from './Composer'
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
  /**
   * BL-101 A3. Set when the page decided this thread should draft itself on
   * open (lib/inbox/autodraft.ts): the newest inbound message id, i.e. the
   * thread version being answered. Null on the compose page and whenever a
   * draft for this version already exists.
   */
  autoDraftVersion?: string | null
  /**
   * Where "Approve and send" goes once the thread is closed: the next
   * thread that needs a reply, else the list. The page appends the undo
   * parameters so the 30-second Undo stays reachable there.
   */
  nextHref?: string | null
}

/**
 * Per-version guard for draft-on-open. sessionStorage survives a reopen in
 * the same tab; the in-memory set covers a browser that refuses storage
 * and React's double-mounted effects in development.
 */
const autoDraftStarted = new Set<string>()
function claimAutoDraft(key: string): boolean {
  if (autoDraftStarted.has(key)) return false
  autoDraftStarted.add(key)
  try {
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Storage blocked (private mode): the in-memory set still guards.
  }
  return true
}

export function DraftPanel({
  threadId,
  draft,
  attachments,
  threadFiles,
  libraryFiles,
  autoDraftVersion = null,
  nextHref = null,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [autoDrafting, setAutoDrafting] = useState(false)

  // Draft-on-open. The server re-checks eligibility and the AI rate limit
  // (autoDraftOnOpen), then calls the same createDraft as the button. Its
  // revalidatePath re-renders the page with the new draft in place.
  useEffect(() => {
    if (!threadId || !autoDraftVersion) return
    if (!claimAutoDraft(`inbox-autodraft:${threadId}:${autoDraftVersion}`)) return
    let live = true
    setAutoDrafting(true)
    setActionError(null)
    autoDraftOnOpen(threadId)
      .then((result) => {
        if (live && 'error' in result) setActionError(result.error)
      })
      .catch(() => {
        if (live) setActionError('Could not draft a reply right now.')
      })
      .finally(() => {
        if (live) setAutoDrafting(false)
      })
    return () => {
      live = false
    }
  }, [threadId, autoDraftVersion])

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
  function handleApprove(input: ApproveInput, options: ApproveOptions) {
    if (!draft) return
    setActionError(null)
    startTransition(async () => {
      const result = await approveDraft(draft.id, input, { closeThread: options.closeThread })
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      // "Next": the reply is queued and the thread closed, so move on.
      // The undo parameters keep this reply's Undo on the next page.
      if (result.threadClosed && nextHref && threadId) {
        const separator = nextHref.includes('?') ? '&' : '?'
        router.push(`${nextHref}${separator}undo=${draft.id}&from=${threadId}`)
      }
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

  // ── 0. Drafting on open — a skeleton where the draft will appear ──
  if (autoDrafting && (!draft || draft.status === 'sent' || draft.status === 'cancelled')) {
    return (
      <section
        aria-label="Reply"
        aria-busy="true"
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="size-4 animate-pulse text-primary" aria-hidden />
          Drafting…
        </p>
        <div className="space-y-2" aria-hidden>
          <div className="h-3 w-3/4 animate-pulse rounded bg-subtle" />
          <div className="h-3 w-full animate-pulse rounded bg-subtle" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-subtle" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-subtle" />
        </div>
        <p className="text-xs text-muted">
          AI is drafting a reply from your documents and this home&apos;s record. Nothing sends until you approve it.
        </p>
      </section>
    )
  }

  // ── 1. No draft yet ──
  if (!draft) {
    return (
      <section
        aria-label="Reply"
        className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Reply to this conversation</p>
            <p className="text-xs text-muted">
              AI drafts a reply grounded in your documents and this property&apos;s record. You review
              and approve it before anything is sent.
            </p>
          </div>
          {threadId ? (
            <Button loading={pending} onClick={handleCreate} icon={<Sparkles aria-hidden />}>
              Draft a reply
            </Button>
          ) : null}
        </div>
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      </section>
    )
  }

  // ── 5. Sent — confirmation, no controls ──
  if (draft.status === 'sent') {
    return (
      <section
        aria-label="Reply"
        className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-subtle p-4 text-sm"
      >
        <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-success" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-semibold text-foreground">{SENT_HEADLINE[draft.kind]}</p>
            <p className="mt-0.5 truncate text-xs text-foreground-secondary">{draft.subject}</p>
          </div>
          {/* The resident wrote again after this was sent (a new thread
              version). Normally that drafts itself; if it could not, the
              board still needs a way to answer. */}
          {threadId && autoDraftVersion ? (
            <>
              {actionError ? <Alert variant="error">{actionError}</Alert> : null}
              <Button size="sm" loading={pending} onClick={handleCreate} icon={<Sparkles aria-hidden />}>
                Draft a reply
              </Button>
            </>
          ) : null}
        </div>
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
      <section aria-label="Reply" className="space-y-3 rounded-xl border border-danger/25 bg-surface p-4">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 size-[18px] shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Sending this reply failed</p>
            <p className="text-xs text-muted">{draft.error ?? 'Something went wrong.'}</p>
          </div>
        </div>
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
      <section
        aria-label="Reply"
        className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">This reply was cancelled before it sent.</p>
          {threadId ? (
            <Button loading={pending} onClick={handleCreate} icon={<Sparkles aria-hidden />}>
              Draft a reply
            </Button>
          ) : null}
        </div>
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      </section>
    )
  }

  // ── 4. Queued — countdown + Undo. `sending` is the brief window between
  // the undo deadline passing and the send job's own status update; treated
  // as "no more undo" rather than invented as a 7th top-level state. ──
  if (draft.status === 'queued' || draft.status === 'sending') {
    return (
      <section aria-label="Reply" className="space-y-2 rounded-xl border border-primary/30 bg-primary-subtle/60 p-4 text-sm">
        <p className="font-semibold text-foreground">{draft.subject}</p>
        <p className="text-xs text-muted">
          To: {draft.toEmails.join(', ')}
          {draft.ccEmails.length > 0 ? ` · Cc: ${draft.ccEmails.join(', ')}` : ''}
        </p>
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
          {draft.bodyText}
        </p>
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
          <Button size="sm" variant="secondary" loading={pending} onClick={handleCancel} icon={<Undo2 aria-hidden />}>
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
      canClose={threadId !== null && draft.kind === 'reply'}
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
    <p className="num text-xs font-medium text-foreground-secondary">
      {remaining > 0 ? `Sending in ${remaining}s — Undo to cancel` : 'Sending…'}
    </p>
  )
}
