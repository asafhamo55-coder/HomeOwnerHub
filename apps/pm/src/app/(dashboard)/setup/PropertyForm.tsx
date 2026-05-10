'use client'

import { useActionState } from 'react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import { createOrUpdateProperty, type PropertyActionState } from '@/lib/properties'

const initial: PropertyActionState = {}

interface PropertyFormProps {
  existing?: {
    id: string
    address: string
    monthly_rent: number | null
    tenant_name: string | null
    tenant_email: string | null
    tenant_phone: string | null
    lease_start: string | null
    lease_end: string | null
  } | null
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-fg">{hint}</p>
      ) : null}
    </div>
  )
}

export function PropertyForm({ existing }: PropertyFormProps) {
  const [state, action, pending] = useActionState(createOrUpdateProperty, initial)
  const f = state.fieldErrors ?? {}

  return (
    <form action={action} className="space-y-5">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Property address" htmlFor="address" required error={f.address}>
          <Input
            id="address"
            name="address"
            required
            autoFocus={!existing}
            defaultValue={existing?.address ?? ''}
            placeholder="789 Buffalo Bayou Dr, Houston, TX"
            error={Boolean(f.address)}
            disabled={pending}
          />
        </Field>

        <Field
          label="Monthly rent"
          htmlFor="monthly_rent"
          required
          error={f.monthly_rent}
        >
          <Input
            id="monthly_rent"
            name="monthly_rent"
            type="number"
            inputMode="decimal"
            min={0}
            step={50}
            defaultValue={existing?.monthly_rent ?? 1500}
            prefix={<span className="text-xs">$</span>}
            disabled={pending}
          />
        </Field>

        <Field label="Tenant name" htmlFor="tenant_name" hint="Optional">
          <Input
            id="tenant_name"
            name="tenant_name"
            defaultValue={existing?.tenant_name ?? ''}
            placeholder="Jane Doe"
            disabled={pending}
          />
        </Field>

        <Field label="Tenant email" htmlFor="tenant_email" hint="Optional" error={f.tenant_email}>
          <Input
            id="tenant_email"
            name="tenant_email"
            type="email"
            defaultValue={existing?.tenant_email ?? ''}
            placeholder="jane@example.com"
            error={Boolean(f.tenant_email)}
            disabled={pending}
          />
        </Field>

        <Field label="Tenant phone" htmlFor="tenant_phone" hint="Optional">
          <Input
            id="tenant_phone"
            name="tenant_phone"
            type="tel"
            defaultValue={existing?.tenant_phone ?? ''}
            placeholder="(555) 123-4567"
            disabled={pending}
          />
        </Field>

        <Field label="Lease start" htmlFor="lease_start" hint="Optional">
          <Input
            id="lease_start"
            name="lease_start"
            type="date"
            defaultValue={existing?.lease_start ?? ''}
            disabled={pending}
          />
        </Field>

        <Field label="Lease end" htmlFor="lease_end" hint="Optional">
          <Input
            id="lease_end"
            name="lease_end"
            type="date"
            defaultValue={existing?.lease_end ?? ''}
            disabled={pending}
          />
        </Field>
      </div>

      {state.error ? (
        <Alert variant="error" title="Couldn't save">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          {existing ? 'Save changes' : 'Add property'}
        </Button>
      </div>
    </form>
  )
}
