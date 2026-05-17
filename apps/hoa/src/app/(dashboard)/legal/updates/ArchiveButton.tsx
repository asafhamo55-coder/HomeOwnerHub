'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { archiveLawUpdate, unarchiveLawUpdate } from '@/lib/state-law'

export function ArchiveButton({
  updateId,
  archived,
}: {
  updateId: string
  archived: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (archived) {
      if (!window.confirm('Restore this update to the feed?')) return
    } else {
      if (!window.confirm('Archive this update? It will stop appearing in the feed.')) return
    }
    setError(null)
    startTransition(async () => {
      const result = archived
        ? await unarchiveLawUpdate(updateId)
        : await archiveLawUpdate(updateId)
      if (!result.ok) {
        setError(result.error)
        return
      }
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
