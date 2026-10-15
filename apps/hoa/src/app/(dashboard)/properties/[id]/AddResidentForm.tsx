'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Select,
  useToast,
} from '@homeowner-portal/ui'
import { addResident, type PropertyResidentRole } from '@/lib/property-residents'

const ROLE_OPTIONS: Array<{ value: PropertyResidentRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family_member', label: 'Family member' },
  { value: 'other', label: 'Other' },
]

/** "Add resident" button that opens a short form in a Dialog (a bottom sheet on phones). */
export function AddResidentForm({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const toast = useToast()
  const formId = `add-resident-${useId().replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
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
    setNameError(null)
    setFormError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNameError(null)
    setFormError(null)
    if (fullName.trim().length === 0) {
      setNameError('Enter the resident’s name.')
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
        setFormError(result.error)
        return
      }
      toast({ tone: 'success', message: `${fullName.trim()} added.` })
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" icon={<UserPlus aria-hidden />}>
          Add resident
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add resident"
        description="Owners, tenants and family members living here. Notices and outreach use this list."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Add resident
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={nameError}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="off"
                autoFocus
                disabled={pending}
              />
            </Field>
            <Field label="Role">
              <Select value={role} onValueChange={(v) => setRole(v as PropertyResidentRole)} disabled={pending}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Email" optional>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Phone" optional>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Moved in" optional>
              <Input type="date" value={movedInAt} onChange={(e) => setMovedInAt(e.target.value)} disabled={pending} />
            </Field>
          </div>
          <Checkbox
            label="Primary contact"
            description="The person notices for this home are addressed to."
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            disabled={pending}
          />
          {formError ? (
            <Alert variant="error" title="Couldn’t add resident">
              {formError}
            </Alert>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}
