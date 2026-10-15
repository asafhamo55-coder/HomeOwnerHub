'use client'

import { useActionState } from 'react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
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

export function PropertyForm({ existing }: PropertyFormProps) {
  const [state, action, pending] = useActionState(createOrUpdateProperty, initial)
  const f = state.fieldErrors ?? {}

  return (
    <form action={action} className="space-y-5">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Property address" required error={f.address}>
          <Input
            name="address"
            required
            autoFocus={!existing}
            defaultValue={existing?.address ?? ''}
            placeholder="789 Buffalo Bayou Dr, Houston, TX"
            disabled={pending}
          />
        </Field>

        <Field
          label="Monthly rent"
         
          required
          error={f.monthly_rent}
        >
          <Input
            name="monthly_rent"
            type="number"
            inputMode="decimal"
            min={0}
            step={50}
            defaultValue={existing?.monthly_rent ?? 1500}
            prefix="$"
            disabled={pending}
          />
        </Field>

        <Field label="Tenant name" optional>
          <Input
            name="tenant_name"
            defaultValue={existing?.tenant_name ?? ''}
            placeholder="Jane Doe"
            disabled={pending}
          />
        </Field>

        <Field label="Tenant email" optional error={f.tenant_email}>
          <Input
            name="tenant_email"
            type="email"
            defaultValue={existing?.tenant_email ?? ''}
            placeholder="jane@example.com"
            disabled={pending}
          />
        </Field>

        <Field label="Tenant phone" optional>
          <Input
            name="tenant_phone"
            type="tel"
            defaultValue={existing?.tenant_phone ?? ''}
            placeholder="(555) 123-4567"
            disabled={pending}
          />
        </Field>

        <Field label="Lease start" optional>
          <Input
            name="lease_start"
            type="date"
            defaultValue={existing?.lease_start ?? ''}
            disabled={pending}
          />
        </Field>

        <Field label="Lease end" optional>
          <Input
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
