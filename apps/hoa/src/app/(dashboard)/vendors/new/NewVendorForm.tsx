'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
import { createVendor } from '@/lib/vendors'

export function NewVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tradesText, setTradesText] = useState('')

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const trades = tradesText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const result = await createVendor({
        legalName: String(formData.get('legalName') ?? ''),
        dba: (String(formData.get('dba') ?? '').trim() || null),
        ein: (String(formData.get('ein') ?? '').trim() || null),
        primaryEmail: (String(formData.get('primaryEmail') ?? '').trim() || null),
        primaryPhone: (String(formData.get('primaryPhone') ?? '').trim() || null),
        trades,
        notes: (String(formData.get('notes') ?? '').trim() || null),
      })

      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/vendors/${result.data.vendorId}/compliance`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Field label="Legal name" required>
        <Input name="legalName" required placeholder="ACME Landscaping LLC" />
      </Field>

      <Field label="DBA (doing business as)">
        <Input name="dba" placeholder="ACME Lawn Care" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary email">
          <Input name="primaryEmail" type="email" placeholder="ops@acme.com" />
        </Field>
        <Field label="Primary phone">
          <Input name="primaryPhone" placeholder="(555) 123-4567" />
        </Field>
      </div>

      <Field label="EIN">
        <Input name="ein" placeholder="12-3456789" />
        <p className="text-xs text-muted-fg">Stored as entered; UI shows last 4 only.</p>
      </Field>

      <Field label="Trades">
        <Input
          name="trades"
          placeholder="landscaping, irrigation"
          value={tradesText}
          onChange={(e) => setTradesText(e.target.value)}
        />
        <p className="text-xs text-muted-fg">
          Comma-separated. Trades requiring a license are tracked per association.
        </p>
      </Field>

      <Field label="Notes">
        <Textarea name="notes" rows={3} placeholder="Internal notes for the board." />
      </Field>

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
          {isPending ? 'Saving…' : 'Create vendor'}
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
      <span className="text-sm font-medium text-muted">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}
