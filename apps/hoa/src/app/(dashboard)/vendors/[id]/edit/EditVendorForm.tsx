'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, useToast } from '@homeowner-portal/ui'
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
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
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Vendor updated.' })
      router.push(`/vendors/${vendorId}`)
    })
  }

  const cls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Legal name</label>
            <input name="legalName" defaultValue={defaultValues.legalName} required className={cls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">DBA</label>
            <input name="dba" defaultValue={defaultValues.dba} className={cls} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
              <input name="primaryEmail" type="email" defaultValue={defaultValues.primaryEmail} className={cls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Phone</label>
              <input name="primaryPhone" defaultValue={defaultValues.primaryPhone} className={cls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Trades (comma-separated)</label>
            <input name="trades" defaultValue={defaultValues.trades} className={cls} />
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
