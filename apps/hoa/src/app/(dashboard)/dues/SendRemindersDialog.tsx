'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, Field, Textarea } from '@homeowner-portal/ui'
import { usd } from '@/lib/money/format'
import { sendSummary } from '@/lib/dues-reminders/send-summary'
import {
  previewDuesReminders,
  sendDuesReminders,
  type PacketSummary,
} from '@/lib/dues-reminders/actions'


interface PreviewState {
  packets: PacketSummary[]
  skipped: { ownerName: string; unitLabel: string }[]
  totalOutstanding: number
  recentlyRemindedCount: number
  emailConfigured: boolean
  previewHtml: string
  reminderHistoryUnavailable: boolean
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
  // Also not state: `sending` only becomes true on the render that follows
  // setSending, so two clicks dispatched before that render would both see
  // the old value. React 18 flushes discrete events synchronously, which
  // makes that unreachable in practice — but "we email residents twice
  // about money" should not rest on a scheduling guarantee. A ref is
  // written and read synchronously, so the second click always loses.
  const sendInFlight = useRef(false)

  const close = useCallback(() => {
    setOpen(false)
    setPreview(null)
    setError(null)
    setDone(null)
  }, [])

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
    try {
      // The note goes with the request so the iframe shows the manager's
      // own words in place — it is the one hand-written part of the email,
      // and previewing the shell without it previews the wrong message.
      const result = await previewDuesReminders({
        ...(emails ? { emails } : {}),
        note: note.trim() || undefined,
      })
      if (generation !== loadGeneration.current) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPreview(result)
    } catch {
      // A rejected server action (a network drop, a redeploy mid-request)
      // never returns a result object, so without this the dialog would
      // sit on its spinner forever. The message stays generic: the
      // rejection value can carry server detail we don't want on screen.
      if (generation !== loadGeneration.current) return
      setError("Couldn't work out who owes what. Close this and try again.")
    } finally {
      // Guarded like the branches above: a superseded load must not clear
      // the spinner belonging to the load that replaced it.
      if (generation === loadGeneration.current) setLoading(false)
    }
  }

  async function send() {
    if (!preview) return
    if (sendInFlight.current) return
    sendInFlight.current = true
    setSending(true)
    setError(null)
    try {
      const result = await sendDuesReminders({
        emails: preview.packets.map((p) => p.email),
        note: note.trim() || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone(sendSummary(result))
      // Clear the preview so a re-render after a successful send can't offer
      // "Send N reminders" again against packets that were already mailed.
      setPreview(null)
    } catch {
      // Every exit from this dialog is gated on `sending`, so leaving it
      // set would trap the manager behind a spinner. The wording refuses
      // to guess: a rejection can land either side of the actual send.
      setError(
        "Something went wrong sending the reminders, and we can't tell how far it got. " +
          'Check Communications before sending again.',
      )
    } finally {
      sendInFlight.current = false
      setSending(false)
    }
  }

  const count = preview?.packets.length ?? 0
  const canSend = Boolean(preview && count > 0 && preview.emailConfigured && !sending)

  // Kit Dialog (Radix): focus trap, Esc, focus return, scroll lock, and a
  // bottom sheet on phones. Closing is refused while a send is in flight —
  // see the comments on `sending` above.
  const footer =
    preview && !done ? (
      <>
        <Button variant="ghost" onClick={close} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={send} disabled={!canSend} loading={sending} icon={<Mail aria-hidden />}>
          Send {count} reminder{count === 1 ? '' : 's'}
        </Button>
      </>
    ) : done || (error && !preview) ? (
      <Button variant={done ? 'default' : 'ghost'} onClick={close}>
        Close
      </Button>
    ) : undefined

  const dialog = (
    <DialogContent
      title="Send dues reminders"
      description="Each owner gets one email listing every open charge on their properties."
      size="lg"
      footer={footer}
      onEscapeKeyDown={(e) => {
        if (sending) e.preventDefault()
      }}
      onInteractOutside={(e) => {
        if (sending) e.preventDefault()
      }}
    >
      <div className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Working out who owes what&hellip;
          </p>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {done ? <Alert variant="success">{done}</Alert> : null}

        {preview && !done ? (
          <>
            <p className="text-sm text-foreground">
              <strong>{count}</strong> {count === 1 ? 'owner' : 'owners'} &middot;{' '}
              <span className="num">{usd(preview.totalOutstanding)}</span> outstanding
            </p>

            {!preview.emailConfigured ? (
              <Alert variant="error">
                Email delivery isn&rsquo;t configured, so nothing would actually be sent. Set
                RESEND_API_KEY and EMAIL_FROM first.
              </Alert>
            ) : null}

            {preview.skipped.length > 0 ? (
              <Alert variant="warning">
                {preview.skipped.length} {preview.skipped.length === 1 ? 'owner' : 'owners'} skipped &mdash; no email on
                file: {preview.skipped.map((s) => s.ownerName).join(', ')}
              </Alert>
            ) : null}

            {preview.reminderHistoryUnavailable ? (
              <Alert variant="warning">
                Couldn&rsquo;t check reminder history &mdash; some of these owners may have already
                been reminded recently.
              </Alert>
            ) : preview.recentlyRemindedCount > 0 ? (
              <Alert variant="warning">
                {preview.recentlyRemindedCount} of these {count === 1 ? 'was' : 'were'} reminded in
                the last 7 days.
              </Alert>
            ) : null}

            <Field
              label="Add a note"
              optional
              hint="Appears above the charges in every email."
              labelAside={
                // An explicit refresh rather than re-rendering as the manager
                // types: the preview costs a server round-trip that reads
                // every open assessment.
                <Button variant="link" size="sm" onClick={load} disabled={sending || loading}>
                  Update preview
                </Button>
              }
            >
              <Textarea
                value={note}
                maxLength={500}
                rows={3}
                placeholder="The pool assessment is due with September dues."
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {preview.previewHtml ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Preview &mdash; {preview.packets[0]?.ownerName}</p>
                {/* srcdoc isolates the email's inline styles from the app's
                    CSS. The email is designed on white, so the frame keeps a
                    light colour scheme even in dark mode. */}
                <iframe
                  title="Email preview"
                  srcDoc={preview.previewHtml}
                  className="h-80 w-full rounded-lg border border-border [color-scheme:light]"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DialogContent>
  )

  return (
    <>
      {variant === 'primary' ? (
        <Button onClick={load} icon={<Mail aria-hidden />}>
          {label}
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={load}>
          {label}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !sending) close()
        }}
      >
        {dialog}
      </Dialog>
    </>
  )
}
