'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  Input,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { updateVendor } from '@/lib/vendors'

interface Props {
  vendorId: string
  defaultValues: {
    legalName: string
    dba: string
    primaryEmail: string
    primaryPhone: string
    trades: string
    notes: string
  }
}

export function EditVendorForm({ vendorId, defaultValues }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFieldErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await updateVendor(vendorId, {
        legalName: fd.get('legalName') as string,
        dba: (fd.get('dba') as string) || null,
        primaryEmail: (fd.get('primaryEmail') as string) || null,
        primaryPhone: (fd.get('primaryPhone') as string) || null,
        trades: (fd.get('trades') as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: (fd.get('notes') as string) || null,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors)
        } else {
          setFormError(result.error)
        }
        return
      }
      toast({ tone: 'success', message: 'Vendor updated.' })
      router.push(`/vendors/${vendorId}`)
    })
  }

  const fe = (k: string) => fieldErrors[k]

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4 pt-5">
          <Field label="Legal name" required error={fe('legal_name')}>
            <Input name="legalName" defaultValue={defaultValues.legalName} required />
          </Field>
          <Field label="DBA" optional error={fe('dba')}>
            <Input name="dba" defaultValue={defaultValues.dba} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={fe('primary_email')}>
              <Input name="primaryEmail" type="email" defaultValue={defaultValues.primaryEmail} />
            </Field>
            <Field label="Phone" error={fe('primary_phone')}>
              <Input name="primaryPhone" type="tel" defaultValue={defaultValues.primaryPhone} />
            </Field>
          </div>
          <Field label="Trades" hint="Comma-separated, e.g. landscaping, irrigation." error={fe('trades')}>
            <Input name="trades" defaultValue={defaultValues.trades} />
          </Field>
          <Field label="Internal notes" optional error={fe('notes')}>
            <Textarea name="notes" defaultValue={defaultValues.notes} rows={3} />
          </Field>
          {formError ? (
            <Alert variant="error" title="Couldn’t save changes">
              {formError}
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
