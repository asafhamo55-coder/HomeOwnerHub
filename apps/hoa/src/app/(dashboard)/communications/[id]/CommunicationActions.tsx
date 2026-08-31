'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { RotateCw, X } from 'lucide-react'
import { Alert, Button, Input, useToast } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteCommunication } from '@/lib/communications/actions'
import {
  getResendPreflight,
  resendFailedRecipients,
  type ResendPreflightField,
} from '@/lib/communications/send'

export function CommunicationActions({
  commId,
  failedEmailCount,
}: {
  commId: string
  /** Email recipients in `delivery_status = 'failed'`. Zero hides the
   *  resend button entirely — there is nothing to retry, and an always-on
   *  button next to Delete invites a pointless re-send. */
  failedEmailCount: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  // Non-null means the preflight found fields the resend cannot render and
  // the form is open. An empty array never lands here — that case resends
  // straight away, so the common message keeps its single click.
  const [fields, setFields] = useState<ResendPreflightField[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  // Errors while the form is open belong beside the inputs, not in a toast:
  // the server's rejection names the fields still blank, which is only
  // actionable next to the boxes to fill in.
  const [formError, setFormError] = useState<string | null>(null)
  // Portal target only exists on the client; gate on mount so SSR doesn't
  // reach for document.body.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // While the form is open: Escape closes it and background scroll locks,
  // matching AiRewriteButton. A resend in flight is not abandoned — the
  // request would still land, and closing would drop the result on the
  // floor while the rows changed underneath.
  useEffect(() => {
    if (!fields) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fields, isPending])

  function close() {
    setFields(null)
    setFormError(null)
  }

  async function send(supplied: Record<string, string>, fromForm: boolean) {
    const result = await resendFailedRecipients(commId, supplied)
    if (!result.ok) {
      if (fromForm) setFormError(result.error)
      else toast({ tone: 'error', message: result.error })
      return
    }
    close()
    toast({
      tone: result.failedCount > 0 ? 'info' : 'success',
      message:
        result.failedCount > 0
          ? `Resent to ${result.sentCount}; ${result.failedCount} still failing.`
          : `Resent to ${result.sentCount} recipient${result.sentCount === 1 ? '' : 's'}.`,
    })
    router.refresh()
  }

  // No confirm step: unlike Delete, a resend only touches rows that already
  // failed, so the worst case is a second failure rather than lost data.
  // The preflight is not a confirmation either — it runs because the wizard
  // answers behind {{deadline_date}} and friends were never persisted, and
  // without them every retry dies at "missing merge fields".
  function handleResend() {
    startTransition(async () => {
      const preflight = await getResendPreflight(commId)
      if (!preflight.ok) {
        toast({ tone: 'error', message: preflight.error })
        return
      }
      if (preflight.fields.length === 0) {
        await send({}, false)
        return
      }
      setValues(Object.fromEntries(preflight.fields.map((f) => [f.name, f.value])))
      setFormError(null)
      setFields(preflight.fields)
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    startTransition(async () => {
      await send(values, true)
    })
  }

  const form = fields ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fill in the missing merge fields"
      // z-[100] for the same reason as AiRewriteButton: above the sticky
      // header, sidebar and dev role-switcher, so nothing covers Cancel.
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) close()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">
              {fields.length === 1 ? 'One value is missing' : `${fields.length} values are missing`}
            </h2>
            <p className="mt-1 text-xs text-muted">
              This message was written with values typed into the send wizard, and those are
              not stored on the message itself. Retype them so the {failedEmailCount} retries
              read exactly like the copies that already went out.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={isPending}
            className="rounded p-1 text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {fields.map((field, i) => (
            <label key={field.name} className="block">
              <span className="block text-[10px] uppercase tracking-wide text-muted">
                {humanizeField(field.name)}
                {field.value ? (
                  // Worth flagging: a recovered value was read back out of a
                  // delivered subject line, not typed by anyone, so it is
                  // the one field on the form nobody has checked.
                  <span className="ml-1 normal-case tracking-normal">
                    · recovered from a delivered copy
                  </span>
                ) : null}
              </span>
              <Input
                value={values[field.name] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                autoComplete="off"
                autoFocus={i === 0}
                className="text-sm"
              />
            </label>
          ))}

          {formError ? <Alert variant="error">{formError}</Alert> : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isPending}>
            Resend to {failedEmailCount}
          </Button>
        </footer>
      </form>
    </div>
  ) : null

  return (
    <div className="inline-flex items-center gap-2">
      {failedEmailCount > 0 ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={isPending}
          title="Send again to the email recipients that failed. Recipients who already received it are untouched."
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>{isPending ? 'Resending…' : `Resend to ${failedEmailCount} failed`}</span>
        </Button>
      ) : null}
      <TwoClickDelete
        onDelete={() => deleteCommunication(commId)}
        successMessage="Communication deleted."
        onAfterDelete={() => router.push('/communications')}
        label="Delete"
      />
      {/* Portal to <body>: this component renders inside the page's
          baseline-aligned title row, which is no place for a dialog. */}
      {mounted && form ? createPortal(form, document.body) : null}
    </div>
  )
}

/** deadline_date → "Deadline date". The placeholder name is the only label
 *  we have; nothing records a human one. */
function humanizeField(name: string): string {
  const spaced = name.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
