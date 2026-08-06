'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Alert, Button, Input, useToast } from '@homeowner-portal/ui'
import { updateResidentFromInbox } from '@/lib/inbox/resident/actions'

interface RailResident {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
}

/**
 * Inline edit, not a modal: `packages/ui` exports no Dialog/Modal/Sheet
 * (only the confirm-only Confirm.tsx, which cannot host children), and
 * inline is the convention this record type already uses on the property
 * page — see properties/[id]/ResidentRow.tsx, whose useTransition + toast +
 * router.refresh() shape this mirrors.
 */
export function ResidentRailRow({
  threadId,
  resident,
}: {
  threadId: string
  resident: RailResident
}) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(resident.name)
  const [email, setEmail] = useState(resident.email ?? '')
  const [phone, setPhone] = useState(resident.phone ?? '')

  // BOTH sides normalised, matching what the server action compares
  // (actions.ts lowercases the stored value too). Normalising only the input
  // made a resident stored as 'Old@Example.com' show the amber banner the
  // moment the row opened, and never clear it.
  const emailChanged =
    (email.trim().toLowerCase() || null) !== (resident.email?.trim().toLowerCase() || null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (fullName.trim().length === 0) {
      setError('Name is required.')
      return
    }

    startTransition(async () => {
      const result = await updateResidentFromInbox(threadId, resident.id, {
        fullName,
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      // A warning means the record WAS corrected but the alias repoint
      // failed. Tone is 'info', not 'error' — ToastTone has no 'warning',
      // and signalling an error for a save that succeeded would invite a
      // retry. The message text carries the caveat.
      toast({
        tone: result.warning ? 'info' : 'success',
        message: result.warning ?? 'Resident updated.',
      })
      setEditing(false)
      router.refresh()
    })
  }

  function cancel() {
    setEditing(false)
    setError(null)
    setFullName(resident.name)
    setEmail(resident.email ?? '')
    setPhone(resident.phone ?? '')
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">
            {resident.name} <span className="text-muted">({resident.role})</span>
          </p>
          {resident.email ? (
            <p className="truncate text-[11px] text-muted">{resident.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${resident.name}`}
          className="shrink-0 rounded p-1 text-muted hover:bg-muted/10 hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-border p-2">
      <RailField label="Name" value={fullName} onChange={setFullName} />
      <RailField label="Email" value={email} onChange={setEmail} type="email" />
      <RailField label="Phone" value={phone} onChange={setPhone} />

      {emailChanged ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Changing the email re-points where their mail files. It does not
          update their resident-portal sign-in or the mailing lists used for
          announcements — those still hold the old address.
        </p>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function RailField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-xs"
        autoComplete="off"
      />
    </label>
  )
}
