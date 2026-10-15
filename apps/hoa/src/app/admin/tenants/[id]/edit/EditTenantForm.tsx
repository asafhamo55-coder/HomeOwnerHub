'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, Button, CardFooter, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { updateTenantFromForm, type FieldErrors } from '../../../_components/form-actions'

interface Props {
  orgId: string
  initialName: string
  initialPlan: string
  initialDoorsCount: number | null
}

export function EditTenantForm({ orgId, initialName, initialPlan, initialDoorsCount }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await updateTenantFromForm(orgId, formData)
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        if (result.error) setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Tenant updated. The change is in the audit log.' })
      router.push(`/admin/tenants/${orgId}`)
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} noValidate>
      <div className="space-y-4 p-5">
        <Field label="Tenant name" required error={fieldErrors.name}>
          <Input name="name" required maxLength={200} defaultValue={initialName} autoComplete="organization" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan" required error={fieldErrors.plan}>
            <Select name="plan" defaultValue={initialPlan}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
          <Field label="Doors / units" optional hint="Declared size, used for billing." error={fieldErrors.doors_count}>
            <Input
              name="doors_count"
              inputMode="numeric"
              defaultValue={initialDoorsCount != null ? String(initialDoorsCount) : ''}
            />
          </Field>
        </div>

        {error ? (
          <Alert variant="error" title="Couldn’t save the tenant">
            {error}
          </Alert>
        ) : null}
      </div>

      <CardFooter className="justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href={`/admin/tenants/${orgId}`} className="no-underline">
            Cancel
          </Link>
        </Button>
        <Button type="submit" loading={isPending}>
          Save changes
        </Button>
      </CardFooter>
    </form>
  )
}
