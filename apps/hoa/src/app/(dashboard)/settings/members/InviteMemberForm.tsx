'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Fieldset, Input, Select } from '@homeowner-portal/ui'
import {
  inviteMember,
  type MemberRole,
  type PropertyOption,
  type ResidencyRole,
} from '@/lib/members'

const ALL_ROLES: Array<{ value: MemberRole; label: string; help: string }> = [
  { value: 'admin', label: 'Admin', help: 'Full control — can manage members + everything Board can do.' },
  { value: 'board', label: 'Board', help: 'Can manage vendors, RFPs, violations, dues. Cannot manage members.' },
  { value: 'resident', label: 'Resident', help: 'Homeowner portal — view dues, submit ARC/violation reports.' },
]

const RESIDENCY_ROLES: Array<{ value: ResidencyRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family_member', label: 'Family member' },
  { value: 'other', label: 'Other' },
]

export function InviteMemberForm({ properties, role }: { properties: PropertyOption[]; role: 'admin' | 'board' }) {
  const ROLES = role === 'admin' ? ALL_ROLES : ALL_ROLES.filter((r) => r.value === 'resident')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string>('')
  const [residencyRole, setResidencyRole] = useState<ResidencyRole>('owner')

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)

    const email = String(formData.get('email') ?? '').trim()
    const role = String(formData.get('role') ?? 'resident') as MemberRole
    const fullName = String(formData.get('full_name') ?? '').trim() || null

    startTransition(async () => {
      const result = await inviteMember({
        email,
        role,
        fullName,
        propertyId: propertyId || null,
        residencyRole: propertyId ? residencyRole : null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const linkSuffix = propertyId
        ? ` and linked to the selected property as ${residencyRole.replace('_', ' ')}.`
        : '.'
      setSuccess(
        result.data.alreadyExisted
          ? `${email} was already in the system; added to this HOA as ${role}${linkSuffix.replace(/\.$/, ', linked to the selected property.')}`
          : `Invitation sent to ${email}${linkSuffix} They'll get a magic link to sign in.`,
      )
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" required>
          <Input name="email" type="email" required placeholder="name@example.com" autoComplete="off" />
        </Field>
        <Field label="Name" optional>
          <Input name="full_name" placeholder="Jane Smith" />
        </Field>
      </div>

      <Field label="Role" required hint={ROLES.find((r) => r.value === 'resident')?.help}>
        <Select name="role" required defaultValue="resident">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>

      <Fieldset
        legend="Link to a property"
        hint="Optional. Also records this person as a resident of the property, shown under their name in the list."
        className="rounded-lg border border-border bg-subtle p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            <Select value={propertyId} onValueChange={setPropertyId}>
              <option value="">None</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.unit_number ? ` · ${p.unit_number}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Residency role">
            <Select
              value={residencyRole}
              onValueChange={(v) => setResidencyRole(v as ResidencyRole)}
              disabled={!propertyId}
            >
              {RESIDENCY_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Fieldset>

      {error ? (
        <Alert variant="error" title="Couldn’t send the invitation">
          {error}
        </Alert>
      ) : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Send invitation
        </Button>
      </div>
    </form>
  )
}
