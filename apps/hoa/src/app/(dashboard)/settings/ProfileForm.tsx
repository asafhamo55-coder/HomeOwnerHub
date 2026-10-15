'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { Button, Field, Input, useToast } from '@homeowner-portal/ui'
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={error}>
          <Input
            value={fullName}
            onChange={(e) => {
              setFullName(e.currentTarget.value)
              if (error) setError(null)
            }}
            placeholder="Jane Smith"
            maxLength={200}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Email" hint="Your sign-in address. It can’t be changed here.">
          <Input value={profile.email ?? ''} readOnly disabled />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" loading={pending} disabled={!dirty} icon={<Save aria-hidden />}>
          Save name
        </Button>
      </div>
    </form>
  )
}
