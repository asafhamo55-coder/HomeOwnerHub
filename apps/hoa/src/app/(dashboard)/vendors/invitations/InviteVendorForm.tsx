'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Send } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { createInvitation } from '@/lib/vendor-invitations'

export function InviteVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    link: string
    emailSent: boolean
    emailError?: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setEmailError(null)
    setSuccess(null)
    setCopied(false)

    const inviteeEmail = String(formData.get('email') ?? '').trim()
    const inviteeName = String(formData.get('name') ?? '').trim() || null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
      setEmailError(inviteeEmail ? 'Enter a valid email address.' : 'Enter the vendor’s email address.')
      return
    }

    startTransition(async () => {
      const result = await createInvitation({ inviteeEmail, inviteeName })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess({
        link: result.data.link,
        emailSent: result.data.emailSent,
        emailError: result.data.emailError,
      })
      router.refresh()
    })
  }

  async function handleCopy() {
    if (!success) return
    try {
      await navigator.clipboard.writeText(success.link)
      setCopied(true)
    } catch {
      // ignore — user can select manually
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendor email" required error={emailError}>
          <Input name="email" type="email" required placeholder="ops@acme.com" />
        </Field>
        <Field label="Business name" optional>
          <Input name="name" placeholder="ACME Landscaping LLC" />
        </Field>
      </div>

      {error ? (
        <Alert variant="error" title="Couldn’t create the invitation">
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert
          variant={success.emailSent ? 'success' : 'warning'}
          title={success.emailSent ? 'Invitation sent' : 'Invitation created, but the email was not sent'}
        >
          <p>
            {success.emailSent
              ? 'We emailed the vendor. The link below also works if they need a copy.'
              : `Email delivery failed${success.emailError ? ` (${success.emailError})` : ''}. Copy the link and send it to the vendor yourself.`}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground">
              {success.link}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Send invitation
        </Button>
      </div>
    </form>
  )
}
