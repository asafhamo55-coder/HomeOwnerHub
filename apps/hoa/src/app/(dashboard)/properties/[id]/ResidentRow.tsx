'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Pencil, Save, X } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import {
  updateResident,
  type PropertyResidentRow,
  type PropertyResidentRole,
} from '@/lib/property-residents'
import { ResidentActions } from './ResidentActions'
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
  isAdmin = false,
  propertyId,
  unitId,
}: {
  resident: PropertyResidentRow
  isAdmin?: boolean
  propertyId?: string
  unitId?: string | null
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
    <li className={`px-4 py-3 text-sm ${isActive ? '' : 'opacity-60'}`}>
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium text-foreground">
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
              {resident.email ? (
                <a
                  href={`mailto:${resident.email}`}
                  className="hover:text-foreground hover:underline"
                >
                  {resident.email}
                </a>
              ) : null}
              {resident.phone ? <span>{resident.phone}</span> : null}
              {resident.moved_in_at ? (
                <span>moved in {format(new Date(resident.moved_in_at), 'PP')}</span>
              ) : null}
              {resident.moved_out_at ? (
                <span className="text-destructive/80">
                  moved out {format(new Date(resident.moved_out_at), 'PP')}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
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
                size="sm"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${resident.full_name}`}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
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
    if (fullName.trim().length === 0) {
      setError('Name is required.')
      return
    }

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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Full name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as PropertyResidentRole)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="(555) 555-5555"
          />
        </Field>
        <Field label="Moved in">
          <Input
            type="date"
            value={movedInAt}
            onChange={(e) => setMovedInAt(e.currentTarget.value)}
          />
        </Field>
        <label className="flex items-end gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.currentTarget.checked)}
            className="h-4 w-4"
          />
          <span>Primary resident for this property</span>
        </label>
      </div>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          rows={2}
          maxLength={2000}
          placeholder="Optional — anything the board should know."
        />
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          <Save className="h-3.5 w-3.5" />
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
