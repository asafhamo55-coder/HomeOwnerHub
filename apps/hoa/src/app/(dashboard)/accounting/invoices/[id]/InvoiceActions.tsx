'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteInvoice } from '@/lib/invoices'

/** Delete an unpaid invoice, behind a destructive confirm (Cancel focused). */
export function InvoiceActions({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      destructive
      title={`Delete invoice ${invoiceNumber}?`}
      description="It disappears from the invoice list. Journal entries already posted for it stay in the ledger — reverse them there if they were wrong."
      confirmLabel="Delete invoice"
      trigger={
        <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
          Delete
        </Button>
      }
      onConfirm={async () => {
        const r = await deleteInvoice(invoiceId)
        if (!r.ok) {
          toast({ tone: 'error', title: 'Couldn’t delete the invoice', message: r.error })
          throw new Error(r.error)
        }
        toast({ tone: 'success', message: `Invoice ${invoiceNumber} deleted.` })
        router.push('/accounting/invoices')
        router.refresh()
      }}
    />
  )
}
