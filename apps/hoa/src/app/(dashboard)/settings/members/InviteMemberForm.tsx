'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input } from '@homeowner-portal/ui'
import { inviteMember, type MemberRole } from '@/lib/members'

const ROLES: Array<{ value: MemberRole; label: string; help: string }> = [
  { value: 'admin', label: 'Admin', help: 'Full control — can manage members + everything Board can do.' },
  { value: 'board', label: 'Board', help: 'Can manage vendors, RFPs, violations, dues. Cannot manage members.' },
  { value: 'resident', label: 'Resident', help: 'Homeowner portal — view dues, submit ARC/violation reports.' },
]

export function InviteMemberForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)

    const email = String(formData.get('email') ?? '').trim()
    const role = String(formData.get('role') ?? 'resident') as MemberRole
    const fullName = String(formData.get('full_name') ?? '').trim() || null

    startTransition(async () => {
      const result = await inviteMember({ email, role, fullName })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(
        result.data.alreadyExisted
          ? `${email} was already in the system; added to this HOA as ${role}.`
          : `Invitation sent to ${email}. They'll get a magic link to sign in.`,
      )
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email <span className="text-destructive">*</span></span>
          <Input name="email" type="email" required placeholder="name@example.com" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Name (optional)</span>
          <Input name="full_name" placeholder="Jane Smith" />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Role <span className="text-destructive">*</span></span>
        <select
          name="role"
          required
          defaultValue="resident"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          {ROLES.find((r) => r.value === 'resident')?.help} (Default — pick another above.)
        </p>
      </label>

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
          <Send className="h-4 w-4" />
          {isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  )
}
