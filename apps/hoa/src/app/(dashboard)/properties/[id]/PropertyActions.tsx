'use client'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, MoreHorizontal, Pencil } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { deleteProperty } from '@/lib/properties'
import { archiveDescription } from '@/lib/properties/archive-copy'

/**
 * Edit, plus an overflow menu holding "Archive". Archive used to be a
 * "Delete" button beside Edit — one slip from removing a home that still
 * owed money. It is a soft delete (deleted_at), so the copy says
 * "Archive", and the confirm warns about an open balance or violations.
 */
export function PropertyActions({
  propertyId,
  address,
  balance,
  openViolations,
}: {
  propertyId: string
  address: string
  /** Null when the stats failed to load. */
  balance: number | null
  openViolations: number | null
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()

  async function archive() {
    const { body, warning } = archiveDescription({ address, balance, openViolations })
    const ok = await confirm({
      title: 'Archive this property?',
      description: (
        <>
          {warning ? <strong className="mb-2 block font-medium text-danger">{warning}</strong> : null}
          {body}
        </>
      ),
      confirmLabel: 'Archive property',
      destructive: true,
    })
    if (!ok) return
    // deleteProperty throws on failure instead of returning {ok, error}.
    try {
      await deleteProperty(propertyId)
    } catch {
      toast({ tone: 'error', message: 'Couldn’t archive the property. Try again.' })
      return
    }
    toast({ tone: 'success', message: 'Property archived.' })
    router.push('/properties')
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button asChild size="sm" variant="secondary">
        <Link href={propertyHref(asPropertyId(propertyId), { edit: true })}>
          <Pencil aria-hidden />
          Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" icon={<MoreHorizontal aria-hidden />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem destructive icon={<Archive aria-hidden />} onSelect={() => void archive()}>
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
