'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { approveVendor } from '@/lib/vendors'

export function ApproveVendorButton({
  vendorId,
  vendorName,
  size = 'md',
}: {
  vendorId: string
  vendorName?: string
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: vendorName ? `Approve ${vendorName}?` : 'Approve this vendor?',
      description:
        "Once approved, they'll appear in the invitable-vendor list for every RFP. Their compliance status (COI, W-9, license) must stay current.",
      confirmLabel: 'Approve vendor',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await approveVendor(vendorId)
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t approve vendor', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Vendor approved.' })
      router.refresh()
    })
  }

  return (
    <Button size={size} onClick={handleClick} loading={isPending} icon={<CheckCircle2 aria-hidden />}>
      {isPending ? 'Approving…' : 'Approve vendor'}
    </Button>
  )
}
