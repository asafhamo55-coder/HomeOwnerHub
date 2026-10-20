'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX, RotateCw, Trash2 } from 'lucide-react'
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Input,
  useToast,
} from '@homeowner-portal/ui'
import { cancelScheduledCommunication, deleteCommunication } from '@/lib/communications/actions'
import {
  getResendPreflight,
  resendFailedRecipients,
  type ResendPreflightField,
} from '@/lib/communications/send'
import { resendSummary } from '@/lib/communications/resend-summary'

export function CommunicationActions({
  commId,
  subject,
  failedEmailCount,
  status,
}: {
  commId: string
  subject: string
  /** The communication's status. 'scheduled' offers Cancel (BL-102 A1). */
  status?: string
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
      tone: result.failedCount > 0 || result.heldCount > 0 ? 'info' : 'success',
      message: resendSummary(result),
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

  const formId = `resend-${commId}`

  return (
    <>
      {status === 'scheduled' ? (
        <ConfirmDialog
          destructive
          title="Cancel this scheduled message?"
          description={<>“{subject}” won’t be sent. Nobody has received it yet.</>}
          confirmLabel="Cancel message"
          onConfirm={async () => {
            const result = await cancelScheduledCommunication(commId)
            if (!result.ok) {
              toast({ tone: 'error', message: result.error })
              throw new Error(result.error)
            }
            toast({ tone: 'success', message: 'Scheduled message cancelled. Nothing was sent.' })
            router.refresh()
          }}
          trigger={
            <Button variant="secondary" icon={<CalendarX aria-hidden />}>
              Cancel scheduled message
            </Button>
          }
        />
      ) : null}
      <ConfirmDialog
        destructive
        title="Delete this message?"
        description={
          <>
            “{subject}” and its delivery history are removed from Communications. Residents
            who already received it keep their copy.
          </>
        }
        confirmLabel="Delete message"
        onConfirm={async () => {
          const result = await deleteCommunication(commId)
          if (!result.ok) {
            toast({ tone: 'error', message: result.error })
            throw new Error(result.error)
          }
          toast({ tone: 'success', message: 'Communication deleted.' })
          router.push('/communications')
        }}
        trigger={
          <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
            Delete
          </Button>
        }
      />
      {failedEmailCount > 0 ? (
        <Button
          onClick={handleResend}
          loading={isPending && !fields}
          icon={<RotateCw aria-hidden />}
          title="Send again to the email recipients that failed. Recipients who already received it are untouched."
        >
          Resend to {failedEmailCount} failed
        </Button>
      ) : null}

      <Dialog
        open={fields !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) close()
        }}
      >
        {fields ? (
          <DialogContent
            title={fields.length === 1 ? 'We need one detail again' : `We need ${fields.length} details again`}
            description={
              <>
                To resend, fill in{' '}
                {fields.map((f) => humanizeField(f.name)).join(', ')}, so the {failedEmailCount} retries read
                exactly like the copies that already went out.
              </>
            }
            footer={
              <>
                <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} loading={isPending}>
                  Resend to {failedEmailCount}
                </Button>
              </>
            }
          >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4">
              {fields.map((field, i) => (
                <Field
                  key={field.name}
                  label={humanizeField(field.name)}
                  // Worth flagging: a recovered value was read back out of a
                  // delivered subject line, not typed by anyone, so it is
                  // the one field on the form nobody has checked.
                  hint={field.value ? 'Recovered from a delivered copy — check it.' : undefined}
                >
                  <Input
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    autoComplete="off"
                    autoFocus={i === 0}
                  />
                </Field>
              ))}
              {formError ? <Alert variant="error">{formError}</Alert> : null}
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

/** deadline_date → "Deadline date". The placeholder name is the only label
 *  we have; nothing records a human one. */
function humanizeField(name: string): string {
  const spaced = name.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
