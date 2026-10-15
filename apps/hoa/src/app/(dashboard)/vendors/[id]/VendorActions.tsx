'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { deleteVendor } from '@/lib/vendors'

/** The ⋯ menu on the vendor page: edit, and delete behind a confirm. */
export function VendorActions({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${vendorName}?`,
      description:
        'The vendor is removed from your list, RFP invitations and pickers. Their past invoices and bids keep their history.',
      confirmLabel: 'Delete vendor',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteVendor(vendorId)
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t delete vendor', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Vendor deleted.' })
      router.push('/vendors')
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          icon={<MoreHorizontal aria-hidden />}
          aria-label="More vendor actions"
          loading={pending}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={<Pencil aria-hidden />} onSelect={() => router.push(`/vendors/${vendorId}/edit`)}>
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 aria-hidden />} destructive onSelect={() => void handleDelete()}>
          Delete vendor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
