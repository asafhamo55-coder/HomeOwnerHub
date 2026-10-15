'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { US_STATES } from '@/lib/us-states'
import { createTenantFromForm, type FieldErrors } from '../../_components/form-actions'

export function NewTenantForm() {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await createTenantFromForm(formData)
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        if (result.error) setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Tenant created.' })
      router.push(`/admin/tenants/${result.data.orgId}`)
    })
  }

  return (
    <form action={handleSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Organization</CardTitle>
          <CardDescription>The tenant record people sign in to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="HOA or community name" required error={fieldErrors.name}>
            <Input name="name" required maxLength={200} placeholder="Sample Ridge HOA" autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" required error={fieldErrors.plan}>
              <Select name="plan" defaultValue="free">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </Select>
            </Field>
            <Field label="Doors / units" optional hint="Declared size, used for billing." error={fieldErrors.doors_count}>
              <Input name="doors_count" inputMode="numeric" placeholder="125" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Initial association</CardTitle>
          <CardDescription>Every tenant starts with one association; more can be added inside the tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Association name" required error={fieldErrors.association_name}>
            <Input name="association_name" required maxLength={200} placeholder="Sample Ridge Homeowners Association" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State" required error={fieldErrors.state}>
              <Select name="state" defaultValue="GA">
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" required error={fieldErrors.association_type}>
              <Select name="association_type" defaultValue="hoa">
                <option value="hoa">HOA</option>
                <option value="condo">Condo</option>
                <option value="coop">Co-op</option>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">First admin</CardTitle>
          <CardDescription>We email this person an invitation to administer the tenant. Leave blank to let them sign up later.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Admin email" optional error={fieldErrors.invite_admin_email}>
            <Input name="invite_admin_email" type="email" placeholder="board@example.org" autoComplete="off" />
          </Field>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="error" title="Couldn’t create the tenant">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/admin/tenants" className="no-underline">
            Cancel
          </Link>
        </Button>
        <Button type="submit" loading={isPending}>
          Create tenant
        </Button>
      </div>
    </form>
  )
}
