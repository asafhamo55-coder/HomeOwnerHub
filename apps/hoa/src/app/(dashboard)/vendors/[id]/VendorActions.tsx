'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteVendor } from '@/lib/vendors'

export function VendorActions({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Delete ${vendorName}?`,
        description:
          'This permanently removes the vendor, all uploaded documents (COI, W-9, licenses), and compliance history. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteVendor(vendorId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Vendor deleted.' })
      router.push('/vendors')
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/vendors/${vendorId}/edit`)}
        disabled={pending}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </>
  )
}
