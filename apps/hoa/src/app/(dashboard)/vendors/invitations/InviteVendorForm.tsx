'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Send } from 'lucide-react'
import { Button, Input } from '@homeowner-portal/ui'
import { createInvitation } from '@/lib/vendor-invitations'

export function InviteVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ link: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    setCopied(false)

    const inviteeEmail = String(formData.get('email') ?? '').trim()
    const inviteeName = String(formData.get('name') ?? '').trim() || null

    startTransition(async () => {
      const result = await createInvitation({ inviteeEmail, inviteeName })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess({ link: result.data.link })
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
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Vendor email</span>
          <Input name="email" type="email" required placeholder="ops@acme.com" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">
            Business name (optional)
          </span>
          <Input name="name" placeholder="ACME Landscaping LLC" />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <p className="font-medium text-emerald-800">Invitation sent.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">
              {success.link}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-xs text-emerald-800">
            We've emailed the vendor. If email isn't configured yet, you can
            copy the link above and send it manually.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Send className="h-4 w-4" />
          {isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  )
}
