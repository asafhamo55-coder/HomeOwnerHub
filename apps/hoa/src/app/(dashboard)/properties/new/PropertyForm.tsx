'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button, Input, Textarea, Alert, cn } from '@homeownerhub/ui'
import { createProperty, type PropertyActionState } from '@/lib/properties'

const initial: PropertyActionState = {}

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

export function PropertyForm() {
  const [state, action, pending] = useActionState(createProperty, initial)
  const f = state.fieldErrors ?? {}

  return (
    <form action={action} className={cn('space-y-5')}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Address" htmlFor="address" required error={f.address}>
          <Input
            id="address"
            name="address"
            required
            autoFocus
            placeholder="123 Madison Park Ln"
            error={Boolean(f.address)}
            disabled={pending}
          />
        </Field>

        <Field label="Unit / Lot #" htmlFor="unit_number" hint="Optional" error={f.unit_number}>
          <Input
            id="unit_number"
            name="unit_number"
            placeholder="A-12"
            error={Boolean(f.unit_number)}
            disabled={pending}
          />
        </Field>

        <Field label="Owner name" htmlFor="owner_name" hint="Optional" error={f.owner_name}>
          <Input
            id="owner_name"
            name="owner_name"
            placeholder="Jane Doe"
            error={Boolean(f.owner_name)}
            disabled={pending}
          />
        </Field>

        <Field label="Owner email" htmlFor="owner_email" hint="Optional" error={f.owner_email}>
          <Input
            id="owner_email"
            name="owner_email"
            type="email"
            placeholder="jane@example.com"
            error={Boolean(f.owner_email)}
            disabled={pending}
          />
        </Field>

        <Field label="Owner phone" htmlFor="owner_phone" hint="Optional" error={f.owner_phone}>
          <Input
            id="owner_phone"
            name="owner_phone"
            type="tel"
            placeholder="(555) 123-4567"
            error={Boolean(f.owner_phone)}
            disabled={pending}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Optional. Anything the board should remember.">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Side gate needs lock replaced. Owner travels frequently."
          disabled={pending}
        />
      </Field>

      {state.error ? (
        <Alert variant="error" title="Couldn't save">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="outline" disabled={pending}>
          <Link href="/properties">Cancel</Link>
        </Button>
        <Button type="submit" loading={pending}>
          Add property
        </Button>
      </div>
    </form>
  )
}
