'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { archiveLawUpdate, unarchiveLawUpdate } from '@/lib/state-law'

export function ArchiveButton({
  updateId,
  archived,
  headline,
}: {
  updateId: string
  archived: boolean
  headline?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    // Restore is non-destructive — go straight through without a confirm.
    if (!archived) {
      const ok = await confirm({
        title: 'Archive this update?',
        description: headline
          ? `“${headline}” will be hidden from the State law page. You can restore it later.`
          : 'It will be hidden from the State law page. You can restore it later.',
        confirmLabel: 'Archive',
      })
      if (!ok) return
    }
    startTransition(async () => {
      const result = archived ? await unarchiveLawUpdate(updateId) : await archiveLawUpdate(updateId)
      if (!result.ok) {
        toast({ tone: 'error', title: archived ? 'Couldn’t restore' : 'Couldn’t archive', message: result.error })
        return
      }
      toast({
        tone: 'success',
        message: archived ? 'Update restored to the live list.' : 'Update archived.',
      })
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleClick}
      loading={isPending}
      icon={archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
    >
      {archived ? 'Restore' : 'Archive'}
    </Button>
  )
}
