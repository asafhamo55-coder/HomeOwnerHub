'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDay } from '@/lib/money/format'
import Link from 'next/link'
import { MessageSquare, Pencil } from 'lucide-react'
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea, cn, useToast } from '@homeowner-portal/ui'
import {
  updateResident,
  type PropertyResidentRow,
  type PropertyResidentRole,
} from '@/lib/property-residents'
import { ResidentActions } from './ResidentActions'
import { ContactLink } from '@/components/contact/ContactLink'
import { isPlausibleEmail } from '@/lib/contact-links'
import { EnterPortalButton } from './EnterPortalButton'

// Inline-editable resident row. Click the pencil → row expands to a
// form with all editable fields. Save calls updateResident; Cancel
// reverts to read-only without firing a request. Auto-collapses on
// successful save.
//
// Uses the existing updateResident server action — no new lib changes
// needed.

const ROLES: Array<{ value: PropertyResidentRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family_member', label: 'Family member' },
  { value: 'other', label: 'Other' },
]

const ROLE_LABEL: Record<PropertyResidentRole, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  family_member: 'Family',
  other: 'Other',
}

export function ResidentRow({
  resident,
  selfUpdatedAt = null,
  isAdmin = false,
  propertyId,
  unitId,
  messageHref = null,
}: {
  resident: PropertyResidentRow
  /** PR-10: when this person last updated their own contact details in the portal. */
  selfUpdatedAt?: string | null
  isAdmin?: boolean
  propertyId?: string
  unitId?: string | null
  /** The household composer (this home's residents preselected), or null. */
  messageHref?: string | null
}) {
  const [editing, setEditing] = useState(false)
  const isActive = resident.moved_out_at === null
  const roleVariant: 'success' | 'info' | 'neutral' | 'outline' =
    resident.role === 'owner'
      ? 'success'
      : resident.role === 'tenant'
        ? 'info'
        : 'neutral'

  return (
    <li className={cn('px-4 py-3 text-sm', !isActive && 'bg-subtle/50')}>
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn('flex items-center gap-2 truncate font-medium', isActive ? 'text-foreground' : 'text-muted')}>
              {resident.full_name}
              {resident.is_primary ? (
                <Badge variant="outline" size="sm">
                  Primary
                </Badge>
              ) : null}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge variant={roleVariant} size="sm">
                {ROLE_LABEL[resident.role]}
              </Badge>
              {resident.email ? <ContactLink kind="email" value={resident.email} /> : null}
              {resident.phone ? <ContactLink kind="phone" value={resident.phone} /> : null}
              {resident.moved_in_at ? (
                <span>moved in {formatDay(resident.moved_in_at)}</span>
              ) : null}
              {selfUpdatedAt ? (
                <span>Updated by {resident.role === 'owner' ? 'owner' : 'resident'} on {formatDay(selfUpdatedAt)}</span>
              ) : null}
              {resident.moved_out_at ? (
                <span className="font-medium text-foreground-secondary">
                  moved out {formatDay(resident.moved_out_at)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isActive && messageHref && (resident.email || resident.phone) ? (
              <Button asChild variant="ghost" size="icon-sm" aria-label={`Message ${resident.full_name}`} title="Message">
                <Link href={messageHref}>
                  <MessageSquare aria-hidden />
                </Link>
              </Button>
            ) : null}
            {isAdmin && isActive && resident.role === 'owner' && propertyId ? (
              <EnterPortalButton
                email={resident.email}
                name={resident.full_name}
                propertyId={propertyId}
                unitId={unitId ?? null}
                variant="ghost"
              />
            ) : null}
            {isActive ? (
              <Button
                variant="ghost"
                size="icon-sm"
                icon={<Pencil aria-hidden />}
                onClick={() => setEditing(true)}
                aria-label={`Edit ${resident.full_name}`}
                title="Edit"
              />
            ) : null}
            <ResidentActions
              residentId={resident.id}
              residentName={resident.full_name}
              isActive={isActive}
            />
          </div>
        </div>
      ) : (
        <ResidentEditForm
          resident={resident}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </li>
  )
}

function ResidentEditForm({
  resident,
  onCancel,
  onSaved,
}: {
  resident: PropertyResidentRow
  onCancel: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string }>({})

  const [fullName, setFullName] = useState(resident.full_name)
  const [email, setEmail] = useState(resident.email ?? '')
  const [phone, setPhone] = useState(resident.phone ?? '')
  const [role, setRole] = useState<PropertyResidentRole>(resident.role)
  const [isPrimary, setIsPrimary] = useState(resident.is_primary)
  const [movedInAt, setMovedInAt] = useState(resident.moved_in_at ?? '')
  const [notes, setNotes] = useState(resident.notes ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Checked here, under the field, before anything is sent: a typo'd
    // address used to save and then silently never receive a notice.
    const fe: { fullName?: string; email?: string } = {}
    if (fullName.trim().length === 0) fe.fullName = 'Enter a name.'
    if (email.trim() && !isPlausibleEmail(email)) fe.email = 'Enter a valid email, like name@example.com.'
    setFieldErrors(fe)
    if (fe.fullName || fe.email) return

    startTransition(async () => {
      const result = await updateResident(resident.id, {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
        is_primary: isPrimary,
        moved_in_at: movedInAt || null,
        notes: notes.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Resident updated.' })
      onSaved()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="space-y-4 rounded-lg border border-border bg-subtle/40 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={fieldErrors.fullName}>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
            disabled={pending}
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as PropertyResidentRole)}
            disabled={pending}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email" optional error={fieldErrors.email}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="name@example.com"
            disabled={pending}
          />
        </Field>
        <Field label="Phone" optional>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="(555) 555-5555"
            disabled={pending}
          />
        </Field>
        <Field label="Moved in">
          <Input
            type="date"
            value={movedInAt}
            onChange={(e) => setMovedInAt(e.currentTarget.value)}
            disabled={pending}
          />
        </Field>
        <div className="flex items-end pb-1.5">
          <Checkbox
            label="Primary resident for this property"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.currentTarget.checked)}
            disabled={pending}
          />
        </div>
      </div>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          rows={2}
          maxLength={2000}
          placeholder="Optional — anything the board should know."
          disabled={pending}
        />
      </Field>

      {error ? (
        <Alert variant="error" title="Couldn’t save">
          {error}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
