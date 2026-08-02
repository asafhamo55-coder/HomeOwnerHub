'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createDraft, approveDraft, cancelDraft } from '@/lib/inbox/draft/actions'
import { hasUnfilledBlanks, UNDO_WINDOW_SECONDS } from '@/lib/inbox/draft/blanks'
import type { ThreadDraft } from '@/lib/inbox/queries'

interface Props {
  threadId: string
  draft: ThreadDraft | null
}

// `blank.kind` is one of money/enforcement/legal/other_resident (the four
// categories the model is forbidden from writing itself). This only labels
// the callout — `blank.prompt` is what actually tells the human what to
// decide, and is rendered verbatim below.
const BLANK_KIND_LABELS: Record<string, string> = {
  money: 'Money',
  enforcement: 'Enforcement outcome',
  legal: 'Legal interpretation',
  other_resident: "Another resident's details",
}

// No `text-warning`/`border-warning` token exists in the shared Tailwind
// config (packages/ui/tailwind.config.ts) — this is the same literal amber
// + dark: pair already used for this exact "needs a human decision" tone in
// PropertyRail.tsx and MessageThread.tsx.
const AMBER_BOX =
  'rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'

export function DraftPanel({ threadId, draft }: Props) {
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [body, setBody] = useState(draft?.bodyText ?? '')

  // A new draft row (a fresh `createDraft`, or the same thread's draft
  // moving to a different id after "Try again") must not keep stale edits
  // from whatever was in these inputs before. Keyed on the fields
  // themselves, not just `draft.id`, so a server-side edit that lands
  // under the same row (there isn't one today, but nothing here assumes
  // otherwise) still reflects in the inputs.
  useEffect(() => {
    setSubject(draft?.subject ?? '')
    setBody(draft?.bodyText ?? '')
    setActionError(null)
  }, [draft?.id, draft?.subject, draft?.bodyText])

  function handleCreate() {
    setActionError(null)
    startTransition(async () => {
      const result = await createDraft(threadId)
      if ('error' in result) setActionError(result.error)
    })
  }

  function handleApprove() {
    if (!draft) return
    setActionError(null)
    startTransition(async () => {
      const result = await approveDraft(draft.id, subject, body)
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
        <Button size="sm" loading={pending} onClick={handleCreate}>
          Draft a reply
        </Button>
      </section>
    )
  }

  // ── 5. Sent — confirmation, no controls ──
  if (draft.status === 'sent') {
    return (
      <section className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="font-semibold text-foreground">Reply sent</p>
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
        <Button size="sm" loading={pending} onClick={handleCreate}>
          Write a new draft
        </Button>
        <p className="text-xs text-muted">
          This starts a fresh draft for you to review and approve. It does not
          resend the reply above.
        </p>
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
        <Button size="sm" loading={pending} onClick={handleCreate}>
          Draft a reply
        </Button>
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
        <p className="whitespace-pre-wrap text-xs text-foreground">{draft.bodyText}</p>
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

  // ── 2 + 3. draft — editable subject/body, citations, blanks, and the
  // ungrounded banner when nothing relevant was retrieved. ──
  // Computed from the LIVE edited body, not the stored `blanks` array —
  // this is what makes filling a blank enable Approve immediately, and
  // deleting the text back re-disable it. `approveDraft` re-checks the
  // same predicate server-side; this is the affordance, not the guarantee.
  // Subject as well as body — `approveDraft` checks both server-side, and an
  // affordance that stayed enabled while the subject held a blank would just
  // hand the reviewer a rejection at the moment they press Approve.
  const blocked = hasUnfilledBlanks(subject) || hasUnfilledBlanks(body)

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border p-3">
      {draft.grounded === false ? (
        <p className={AMBER_BOX}>
          {draft.groundingNote ??
            'No governing document or property record matched this question — this draft contains no facts.'}
        </p>
      ) : null}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Reply
        </label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      {draft.blanks.length > 0 ? (
        <ul className="space-y-1">
          {draft.blanks.map((blank, index) => (
            <li key={`${blank.kind}-${index}`} className={AMBER_BOX}>
              <span className="font-semibold">
                {BLANK_KIND_LABELS[blank.kind] ?? blank.kind}:{' '}
              </span>
              {blank.prompt}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Label + quote together, always — a quote shown without the source
          it came from is what a board member is supposed to check, and
          showing one without the other invites trust it hasn't earned. */}
      {draft.citations.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {draft.citations.map((citation) => (
            <li key={citation.refId}>
              <span className="font-semibold text-foreground">{citation.label}</span>
              <span className="text-muted">{` — "${citation.quote}"`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      <div>
        <Button type="button" size="sm" disabled={blocked} loading={pending} onClick={handleApprove}>
          Approve and send
        </Button>
        {blocked ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Fill in or remove every highlighted blank before sending.
          </p>
        ) : null}
      </div>
    </section>
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
