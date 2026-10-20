'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MailPlus, Send } from 'lucide-react'
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Input, Textarea, useToast } from '@homeowner-portal/ui'
import { sendCoiRequest } from '@/lib/vendor-coi-request/actions'
import { COI_REQUEST_BODY_MAX, COI_REQUEST_SUBJECT_MAX } from '@/lib/vendor-coi-request/limits'

/**
 * "Request updated certificate" (BL-083). Opens the drafted email for the
 * board to review and edit; nothing is sent until Send is clicked. The
 * recipient is the vendor's address on file — shown here, not editable,
 * and re-read on the server at send time.
 */
export function RequestCertificateButton({
  vendorId,
  to,
  initialSubject,
  initialBody,
  variant = 'secondary',
  size = 'md',
}: {
  vendorId: string
  /** Null when the vendor has no email on file: the button explains instead of opening. */
  to: string | null
  initialSubject: string
  initialBody: string
  variant?: 'default' | 'secondary'
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [pending, startTransition] = useTransition()

  if (!to) {
    return (
      <Button
        variant={variant}
        size={size}
        icon={<MailPlus aria-hidden />}
        onClick={() =>
          toast({
            tone: 'error',
            title: 'No email on file',
            message: 'Add the vendor’s email under More vendor actions → Edit details, then request the certificate.',
          })
        }
      >
        Request updated certificate
      </Button>
    )
  }

  function onSend() {
    startTransition(async () => {
      const res = await sendCoiRequest({ vendorId, subject, body })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Request not sent', message: res.error })
        return
      }
      toast({ tone: 'success', message: 'Sent to the vendor. Their reply comes back to the association’s email.' })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSubject(initialSubject)
          setBody(initialBody)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} icon={<MailPlus aria-hidden />}>
          Request updated certificate
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Request an updated certificate"
        description="Review the email before it goes out. It is sent only to this vendor’s address on file, never to residents."
        hideClose
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              icon={<Send aria-hidden />}
              loading={pending}
              disabled={!subject.trim() || !body.trim()}
              onClick={onSend}
            >
              Send to vendor
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm">
            <span className="text-muted">To: </span>
            <span className="break-all font-medium text-foreground">{to}</span>
          </p>
          <Field label="Subject">
            <Input value={subject} maxLength={COI_REQUEST_SUBJECT_MAX} onChange={(e) => setSubject(e.currentTarget.value)} />
          </Field>
          <Field label="Message" hint="Plain text. The vendor replies to this email with the certificate attached.">
            <Textarea
              value={body}
              rows={12}
              maxLength={COI_REQUEST_BODY_MAX}
              onChange={(e) => setBody(e.currentTarget.value)}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
