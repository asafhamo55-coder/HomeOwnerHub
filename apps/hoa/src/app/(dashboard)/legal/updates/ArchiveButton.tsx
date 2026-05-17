'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { archiveLawUpdate, unarchiveLawUpdate } from '@/lib/state-law'

export function ArchiveButton({
  updateId,
  archived,
}: {
  updateId: string
  archived: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    // Restore is non-destructive — go straight through without a confirm.
    if (!archived) {
      const ok = await confirm({
        title: 'Archive this update?',
        description:
          'It will be hidden from the active list. You can restore it later.',
        confirmLabel: 'Archive',
        destructive: true,
      })
      if (!ok) return
    }
    setError(null)
    startTransition(async () => {
      const result = archived
        ? await unarchiveLawUpdate(updateId)
        : await archiveLawUpdate(updateId)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({
        tone: 'success',
        message: archived ? 'Update restored to the active list.' : 'Update archived.',
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {archived ? (
          <>
            <ArchiveRestore className="h-3.5 w-3.5" />
            {isPending ? 'Restoring…' : 'Restore'}
          </>
        ) : (
          <>
            <Archive className="h-3.5 w-3.5" />
            {isPending ? 'Archiving…' : 'Archive'}
          </>
        )}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
