'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, useToast } from '@homeowner-portal/ui'
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
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
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Property updated.' })
      router.push(`/properties/${propertyId}`)
    })
  }

  const cls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Address</label>
            <input name="address" defaultValue={defaultValues.address} required className={cls} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Unit number</label>
              <input name="unitNumber" defaultValue={defaultValues.unitNumber} className={cls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Owner name</label>
              <input name="ownerName" defaultValue={defaultValues.ownerName} className={cls} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Owner email</label>
              <input name="ownerEmail" type="email" defaultValue={defaultValues.ownerEmail} className={cls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Owner phone</label>
              <input name="ownerPhone" defaultValue={defaultValues.ownerPhone} className={cls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Notes</label>
            <textarea name="notes" defaultValue={defaultValues.notes} rows={3} className={cls} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
