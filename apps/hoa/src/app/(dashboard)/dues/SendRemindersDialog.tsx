'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, Mail } from 'lucide-react'
import { Alert, Button, Textarea } from '@homeowner-portal/ui'
import {
  previewDuesReminders,
  sendDuesReminders,
  type PacketSummary,
} from '@/lib/dues-reminders/actions'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

interface PreviewState {
  packets: PacketSummary[]
  skipped: { ownerName: string; unitLabel: string }[]
  totalOutstanding: number
  recentlyRemindedCount: number
  emailConfigured: boolean
  previewHtml: string
}

export function SendRemindersDialog({
  emails,
  label,
  variant = 'row',
}: {
  emails: string[] | null
  label: string
  variant?: 'primary' | 'row'
}) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // Not state: bumping it must not itself cause a render, and load() needs
  // to read the *current* value at the moment its awaited call resolves,
  // not the value captured in its own closure.
  const loadGeneration = useRef(0)

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => {
    setOpen(false)
    setPreview(null)
    setError(null)
    setDone(null)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      // A send in flight must not be abandoned mid-request: closing here
      // while sendDuesReminders() is still pending would let its eventual
      // setDone/setError land after the dialog reopens, showing a stale
      // result instead of a fresh preview.
      if (e.key === 'Escape' && !sending) close()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close, sending])

  async function load() {
    // Escape/backdrop are deliberately allowed to close the dialog while
    // this fetch is outstanding (unlike send() — see the guard below), so
    // a close-then-reopen can start a second load() before the first one's
    // previewDuesReminders() has resolved. Without this generation check,
    // whichever call lands second in wall-clock time — not necessarily the
    // most recent one — would win and could paint a stale preview/error
    // over the newer request's state.
    const generation = ++loadGeneration.current
    setOpen(true)
    setLoading(true)
    setError(null)
    // Clear any result from a prior open (stale preview, or a "done"
    // message left behind by a send that finished after the dialog was
    // closed) so this fetch can't render alongside leftover state.
    setDone(null)
    setPreview(null)
    const result = await previewDuesReminders(emails ? { emails } : undefined)
    if (generation !== loadGeneration.current) return
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPreview(result)
  }

  async function send() {
    if (!preview) return
    setSending(true)
    setError(null)
    const result = await sendDuesReminders({
      emails: preview.packets.map((p) => p.email),
      note: note.trim() || undefined,
    })
    setSending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDone(
      result.failedCount > 0
        ? `Sent ${result.sentCount}, ${result.failedCount} failed.`
        : `Sent ${result.sentCount} reminder${result.sentCount === 1 ? '' : 's'}.`,
    )
    // Clear the preview so a re-render after a successful send can't offer
    // "Send N reminders" again against packets that were already mailed.
    setPreview(null)
  }

  const count = preview?.packets.length ?? 0
  const canSend = Boolean(preview && count > 0 && preview.emailConfigured && !sending)

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send dues reminders"
      // z-[100] keeps the dialog above every other fixed overlay in the
      // app (sticky header z-20, sidebar z-40, dev role-switcher z-50) so
      // nothing can sit over its close controls.
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (sending) return
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Send dues reminders</h2>

        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out who owes what&hellip;
          </p>
        ) : null}

        {error ? (
          <div className="mt-4 space-y-4">
            <Alert variant="error">{error}</Alert>
            {/* A load failure leaves preview null, so the send-form footer
                below never renders — without this the dialog would have no
                close control besides Escape/backdrop. */}
            {!preview ? (
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="mt-4 space-y-4">
            <Alert variant="success">{done}</Alert>
            <Button onClick={close}>Close</Button>
          </div>
        ) : null}

        {preview && !done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-foreground">
              <strong>{count}</strong> {count === 1 ? 'owner' : 'owners'} &middot;{' '}
              {usd.format(preview.totalOutstanding)} outstanding
            </p>

            {!preview.emailConfigured ? (
              <Alert variant="error">
                Email delivery isn&rsquo;t configured, so nothing would actually be sent. Set
                RESEND_API_KEY and EMAIL_FROM first.
              </Alert>
            ) : null}

            {preview.skipped.length > 0 ? (
              <Alert variant="warning">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {preview.skipped.length}{' '}
                    {preview.skipped.length === 1 ? 'owner' : 'owners'} skipped &mdash; no email on
                    file: {preview.skipped.map((s) => s.ownerName).join(', ')}
                  </span>
                </span>
              </Alert>
            ) : null}

            {preview.recentlyRemindedCount > 0 ? (
              <Alert variant="warning">
                {preview.recentlyRemindedCount} of these {count === 1 ? 'was' : 'were'} reminded in
                the last 7 days.
              </Alert>
            ) : null}

            <div>
              <label htmlFor="reminder-note" className="text-sm font-medium text-foreground">
                Add a note (optional)
              </label>
              <Textarea
                id="reminder-note"
                value={note}
                maxLength={500}
                rows={3}
                placeholder="The pool assessment is due with September dues."
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>

            {preview.previewHtml ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Preview &mdash; {preview.packets[0]?.ownerName}
                </p>
                {/* srcdoc isolates the email's inline styles from the app's CSS. */}
                <iframe
                  title="Email preview"
                  srcDoc={preview.previewHtml}
                  className="h-80 w-full rounded-lg border border-border bg-white"
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={send} disabled={!canSend}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send {count} reminder{count === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {variant === 'primary' ? (
        <Button onClick={load}>
          <Mail className="h-4 w-4" />
          {label}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={load}>
          {label}
        </Button>
      )}
      {mounted && open ? createPortal(dialog, document.body) : null}
    </>
  )
}
