'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteInvoice } from '@/lib/invoices'

export function InvoiceActions({
  invoiceId,
  isPaid,
}: {
  invoiceId: string
  isPaid: boolean
}) {
  const router = useRouter()
  if (isPaid) return null
  return (
    <TwoClickDelete
      onDelete={() => deleteInvoice(invoiceId)}
      successMessage="Invoice deleted."
      onAfterDelete={() => router.push('/accounting/invoices')}
      label="Delete"
    />
  )
}
