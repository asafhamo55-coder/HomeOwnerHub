'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteInvoice } from '@/lib/invoices'

export function InvoiceActions({
  invoiceId,
  isPaid,
}: {
  invoiceId: string
  isPaid: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this invoice?',
        description:
          'This permanently removes the invoice and its associated journal entries. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteInvoice(invoiceId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Invoice deleted.' })
      router.push('/accounting/invoices')
    })
  }

  if (isPaid) return null

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  )
}
