'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Button, Input, Select } from '@homeowner-portal/ui'
import { createTenant } from '@/lib/platform-admin'

export function NewTenantForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const name = String(formData.get('name') ?? '').trim()
    const plan = String(formData.get('plan') ?? 'free') as 'free' | 'pro' | 'enterprise'
    const doorsRaw = String(formData.get('doors_count') ?? '').trim()
    const doorsCount = doorsRaw ? Number(doorsRaw.replace(/[^0-9]/g, '')) : null

    const associationName = String(formData.get('association_name') ?? '').trim()
    const state = String(formData.get('state') ?? 'GA') as 'GA' | 'FL' | 'CA' | 'TX'
    const associationType = String(formData.get('association_type') ?? 'hoa') as 'hoa' | 'condo' | 'coop'
    const inviteAdminEmail = String(formData.get('invite_admin_email') ?? '').trim() || null

    startTransition(async () => {
      const result = await createTenant({
        name,
        plan,
        doorsCount,
        associationName,
        state,
        associationType,
        inviteAdminEmail,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/admin/tenants/${result.data.orgId}`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Organization
        </h2>

        <Field label="HOA / community name" required>
          <Input name="name" required maxLength={200} placeholder="Madison Park" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan">
            <Select name="plan" defaultValue="free">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
          <Field label="Doors / units (optional)">
            <Input name="doors_count" inputMode="numeric" placeholder="125" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Initial association
        </h2>
        <p className="text-xs text-muted">
          Each tenant has at least one association. You can add more later from inside the tenant.
        </p>

        <Field label="Association name" required>
          <Input name="association_name" required placeholder="Madison Park HOA" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="State" required>
            <Select name="state" required defaultValue="GA">
              <option value="GA">Georgia</option>
              <option value="FL">Florida</option>
              <option value="CA">California</option>
              <option value="TX">Texas</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select name="association_type" defaultValue="hoa">
              <option value="hoa">HOA</option>
              <option value="condo">Condo</option>
              <option value="coop">Co-op</option>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Initial admin (optional)
        </h2>
        <p className="text-xs text-muted">
          If you provide an email, we invite that person as the tenant's first admin.
          You can also skip and let the admin sign up themselves.
        </p>

        <Field label="Email">
          <Input
            name="invite_admin_email"
            type="email"
            placeholder="board@madisonparkhoa.com"
          />
        </Field>
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Building2 className="h-4 w-4" />
          {isPending ? 'Creating…' : 'Create tenant'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}
