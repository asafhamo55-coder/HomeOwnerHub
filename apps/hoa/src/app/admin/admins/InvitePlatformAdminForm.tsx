'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import { Button, Input } from '@homeowner-portal/ui'
import { inviteOrPromotePlatformAdmin } from '@/lib/platform-admin'

export function InvitePlatformAdminForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    const email = String(formData.get('email') ?? '').trim()
    const note = String(formData.get('note') ?? '').trim() || null

    startTransition(async () => {
      const result = await inviteOrPromotePlatformAdmin(email, note)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(
        result.data.alreadyExisted
          ? `${email} was promoted to platform admin.`
          : `Invitation sent to ${email}.`,
      )
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email <span className="text-destructive">*</span></span>
          <Input name="email" type="email" required placeholder="staff@homeownerhub.com" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Note (audit log)</span>
          <Input name="note" maxLength={200} placeholder="Engineering hire" />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Shield className="h-4 w-4" />
          {isPending ? 'Granting…' : 'Grant platform admin'}
        </Button>
      </div>
    </form>
  )
}
