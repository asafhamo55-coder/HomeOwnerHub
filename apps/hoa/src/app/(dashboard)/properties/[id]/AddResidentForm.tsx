'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button, Input, Select, useToast } from '@homeowner-portal/ui'
import {
  addResident,
  type PropertyResidentRole,
} from '@/lib/property-residents'

const ROLE_OPTIONS: Array<{ value: PropertyResidentRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family_member', label: 'Family member' },
  { value: 'other', label: 'Other' },
]

export function AddResidentForm({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<PropertyResidentRole>('tenant')
  const [isPrimary, setIsPrimary] = useState(false)
  const [movedInAt, setMovedInAt] = useState('')

  function reset() {
    setFullName('')
    setEmail('')
    setPhone('')
    setRole('tenant')
    setIsPrimary(false)
    setMovedInAt('')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length === 0) {
      setError('Name is required.')
      return
    }
    startTransition(async () => {
      const result = await addResident({
        propertyId,
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        isPrimary,
        movedInAt: movedInAt || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${fullName} added.` })
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Add resident
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-border bg-background/40 p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Full name
          </label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
            disabled={pending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Role
          </label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as PropertyResidentRole)}
            disabled={pending}
            className="mt-1"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="optional"
            disabled={pending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Phone
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="optional"
            disabled={pending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Moved in
          </label>
          <Input
            type="date"
            value={movedInAt}
            onChange={(e) => setMovedInAt(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              disabled={pending}
              className="rounded border-border"
            />
            Primary contact
          </label>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending} disabled={pending}>
          Add resident
        </Button>
      </div>
    </form>
  )
}
