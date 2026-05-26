'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { Button, Input, useToast } from '@homeowner-portal/ui'
import { updateMyProfile, type MyProfile } from '@/lib/profile'

// Personal-name editor on /settings. Empty name on first load if the
// user hasn't set one — they still get the email shown for context so
// they know which account they're editing.

export function ProfileForm({ profile }: { profile: MyProfile }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fullName, setFullName] = useState(profile.full_name ?? '')

  const dirty = fullName.trim() !== (profile.full_name ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length === 0) {
      setError('Name is required.')
      return
    }
    startTransition(async () => {
      const result = await updateMyProfile({ fullName: fullName.trim() })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Name updated.' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Full name</span>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            placeholder="Jane Smith"
            maxLength={200}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Email</span>
          <Input value={profile.email ?? ''} readOnly disabled />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="sm" disabled={pending || !dirty}>
          <Save className="h-3.5 w-3.5" />
          {pending ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </form>
  )
}
