'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { approveVendor } from '@/lib/vendors'

export function ApproveVendorButton({
  vendorId,
  vendorName,
}: {
  vendorId: string
  vendorName?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const ok = await confirm({
      title: vendorName ? `Approve ${vendorName}?` : 'Approve this vendor?',
      description:
        "Once approved, they'll appear in the invitable-vendor list for every RFP. Their compliance status (COI, W-9, license) must stay current.",
      confirmLabel: 'Approve vendor',
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await approveVendor(vendorId)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Vendor approved.' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={isPending}>
        <CheckCircle2 className="h-4 w-4" />
        {isPending ? 'Approving…' : 'Approve vendor'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
