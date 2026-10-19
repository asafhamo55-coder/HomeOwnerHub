'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature } from 'lucide-react'
import { Button, ChoiceGroup, Dialog, DialogContent, DialogTrigger, Fieldset, Radio, useToast } from '@homeowner-portal/ui'
import { recordMemberEmailConsent, type BoardConsentMethod } from '@/lib/email-consent-actions'

/**
 * BL-020: the board records consent to official notices by email that a
 * member gave outside the portal — a signed form or an email from them
 * (CA Civ. Code §4040(b)) — or their withdrawal of it. Appends one
 * evidence row; nothing is ever edited. Board/admin only: the action
 * gates, and callers render this only for the board.
 */
export function RecordConsentDialog({
  userId,
  memberName,
  currentlyGranted,
  revalidate,
  size = 'sm',
}: {
  userId: string
  /** Shown in the dialog only; never logged. */
  memberName: string
  currentlyGranted: boolean
  revalidate?: string
  size?: 'xs' | 'sm'
}) {
  const router = useRouter()
  const toast = useToast()
  const formId = `consent-${useId().replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const [granted, setGranted] = useState(!currentlyGranted)
  const [method, setMethod] = useState<BoardConsentMethod>('written')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await recordMemberEmailConsent({ userId, granted, method, revalidate })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast({ tone: 'success', message: granted ? 'Consent recorded.' : 'Withdrawal recorded.' })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (next) {
          setGranted(!currentlyGranted)
          setMethod('written')
        }
        setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size={size} icon={<FileSignature aria-hidden />}>
          Record written consent
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Record written consent"
        description={`For ${memberName}. California law (Civ. Code §4040) lets the association email official notices only to members who agreed to it. Record what they gave you on paper or by email; it is kept as evidence and can’t be edited.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Save consent
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="space-y-5">
          <Fieldset legend="The member">
            <ChoiceGroup>
              <Radio name={`${formId}-g`} checked={granted} onChange={() => setGranted(true)} disabled={pending} label="Agreed to official notices by email" />
              <Radio name={`${formId}-g`} checked={!granted} onChange={() => setGranted(false)} disabled={pending} label="Withdrew their agreement" description="Official notices go to them by mail again." />
            </ChoiceGroup>
          </Fieldset>
          <Fieldset legend="How they told you">
            <ChoiceGroup>
              <Radio name={`${formId}-m`} checked={method === 'written'} onChange={() => setMethod('written')} disabled={pending} label="Signed form" />
              <Radio name={`${formId}-m`} checked={method === 'email'} onChange={() => setMethod('email')} disabled={pending} label="Email from the member" />
            </ChoiceGroup>
          </Fieldset>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}
