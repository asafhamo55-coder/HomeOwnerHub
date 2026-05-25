'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input, Select } from '@homeowner-portal/ui'
import {
  inviteMember,
  type MemberRole,
  type PropertyOption,
  type ResidencyRole,
} from '@/lib/members'

const ROLES: Array<{ value: MemberRole; label: string; help: string }> = [
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

export function InviteMemberForm({ properties }: { properties: PropertyOption[] }) {
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
        <Select name="role" required defaultValue="resident">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted">
          {ROLES.find((r) => r.value === 'resident')?.help} (Default — pick another above.)
        </p>
      </label>

      <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/10 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Link to a property (optional)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Property</span>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <option value="">— none —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}{p.unit_number ? ` · ${p.unit_number}` : ''}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Residency role</span>
            <Select
              value={residencyRole}
              onValueChange={(v) => setResidencyRole(v as ResidencyRole)}
              disabled={!propertyId}
            >
              {RESIDENCY_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-xs text-muted">
          If selected, also creates a property-residents row matching this email
          to the property. The Members list will show the link under "Linked to:".
        </p>
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
          <Send className="h-4 w-4" />
          {isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  )
}
