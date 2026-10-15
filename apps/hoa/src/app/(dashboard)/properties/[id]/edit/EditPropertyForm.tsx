'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardFooter, Field, Input, Textarea, useToast } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { updateProperty } from '@/lib/properties'

interface Props {
  propertyId: string
  defaultValues: {
    address: string
    unitNumber: string
    ownerName: string
    ownerEmail: string
    ownerPhone: string
    notes: string
  }
}

export function EditPropertyForm({ propertyId, defaultValues }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFieldErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await updateProperty(propertyId, {
        address: fd.get('address') as string,
        unitNumber: (fd.get('unitNumber') as string) || null,
        ownerName: (fd.get('ownerName') as string) || null,
        ownerEmail: (fd.get('ownerEmail') as string) || null,
        ownerPhone: (fd.get('ownerPhone') as string) || null,
        notes: (fd.get('notes') as string) || null,
      })
      if (!result.ok) {
        // Field problems go under their field; anything else is a form-level alert.
        const fe = result.fieldErrors ?? {}
        if (Object.keys(fe).some((k) => k !== '_')) setFieldErrors(fe)
        else setFormError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Property updated.' })
      router.push(`/properties/${propertyId}`)
    })
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-5 pt-5">
          <Field label="Address" required error={fieldErrors.address}>
            <Input name="address" defaultValue={defaultValues.address} required autoComplete="street-address" disabled={pending} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Unit / Lot #" optional error={fieldErrors.unitNumber}>
              <Input name="unitNumber" defaultValue={defaultValues.unitNumber} disabled={pending} />
            </Field>
            <Field label="Owner name" optional error={fieldErrors.ownerName}>
              <Input name="ownerName" defaultValue={defaultValues.ownerName} autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Owner email" optional error={fieldErrors.ownerEmail}>
              <Input name="ownerEmail" type="email" defaultValue={defaultValues.ownerEmail} autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Owner phone" optional error={fieldErrors.ownerPhone}>
              <Input name="ownerPhone" type="tel" defaultValue={defaultValues.ownerPhone} autoComplete="off" disabled={pending} />
            </Field>
          </div>
          <Field
            label="Notes"
            optional
            hint="Anything the board should remember. Not shown to residents."
            error={fieldErrors.notes}
            labelAside={
              <AiRewriteButton textareaRef={notesRef} context="Internal property notes for the HOA board" disabled={pending} />
            }
          >
            <Textarea ref={notesRef} name="notes" defaultValue={defaultValues.notes} rows={4} disabled={pending} />
          </Field>
          {formError ? (
            <Alert variant="error" title="Couldn’t save">
              {formError}
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button asChild variant="ghost">
            <Link href={`/properties/${propertyId}`}>Cancel</Link>
          </Button>
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
