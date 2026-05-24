'use client'

import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteVendor } from '@/lib/vendors'

export function VendorActions({ vendorId, vendorName: _ }: { vendorId: string; vendorName: string }) {
  const router = useRouter()
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/vendors/${vendorId}/edit`)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <TwoClickDelete
        onDelete={() => deleteVendor(vendorId)}
        successMessage="Vendor deleted."
        onAfterDelete={() => router.push('/vendors')}
        label="Delete"
      />
    </>
  )
}
