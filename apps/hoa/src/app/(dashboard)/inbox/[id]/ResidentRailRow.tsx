'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Alert, Button, Field, Input, useToast } from '@homeowner-portal/ui'
import { updateResidentFromInbox } from '@/lib/inbox/resident/actions'

interface RailResident {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
}

/**
 * Inline edit, not a modal: the rail is narrow and the edit is three
 * fields, and inline is the convention this record type uses on the
 * property page too — see properties/[id]/ResidentRow.tsx, whose
 * useTransition + toast + router.refresh() shape this mirrors.
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
  const [nameError, setNameError] = useState<string | null>(null)

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
      setNameError('Name is required.')
      return
    }
    setNameError(null)

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
      // failed. Tone is 'warning', not 'error':
      // and signalling an error for a save that succeeded would invite a
      // retry. The message text carries the caveat.
      toast({
        tone: result.warning ? 'warning' : 'success',
        message: result.warning ?? 'Resident updated.',
      })
      setEditing(false)
      router.refresh()
    })
  }

  function cancel() {
    setEditing(false)
    setError(null)
    setNameError(null)
    setFullName(resident.name)
    setEmail(resident.email ?? '')
    setPhone(resident.phone ?? '')
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            {resident.name} <span className="text-xs text-muted">· {resident.role.replace(/_/g, ' ')}</span>
          </p>
          {resident.email ? <p className="truncate text-xs text-muted">{resident.email}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${resident.name}`}
          icon={<Pencil aria-hidden />}
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-subtle/60 p-3">
      <Field label="Name" error={nameError} required>
        <Input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="off" />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
      </Field>
      <Field label="Phone">
        <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="off" />
      </Field>

      {emailChanged ? (
        <Alert variant="warning" hideIcon className="p-3 text-xs">
          Changing the email re-points where their mail files. It does not update their
          resident-portal sign-in or the mailing lists used for announcements — those still hold
          the old address.
        </Alert>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
