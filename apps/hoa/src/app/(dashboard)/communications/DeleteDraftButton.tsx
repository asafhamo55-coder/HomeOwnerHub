'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteDraft } from '@/lib/communications/draft-actions'

/**
 * BL-102 A9: delete an unsent draft. The action only ever touches a row
 * that is still a draft. Nothing was sent, so residents lose nothing.
 */
export function DeleteDraftButton({
  draftId,
  title,
  size = 'sm',
  onDeleted,
  disabled,
}: {
  draftId: string
  title: string
  size?: 'xs' | 'sm'
  /** Runs before navigating away (the composer stops autosaving). */
  onDeleted?: () => void
  disabled?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      destructive
      title="Delete this draft?"
      description={<>“{title}” hasn’t been sent. Deleting it removes it from your drafts.</>}
      confirmLabel="Delete draft"
      onConfirm={async () => {
        const result = await deleteDraft(draftId)
        if (!result.ok) {
          toast({ tone: 'error', message: result.error })
          throw new Error(result.error)
        }
        onDeleted?.()
        toast({ tone: 'success', message: 'Draft deleted. Nothing was sent.' })
        router.push('/communications?status=draft')
        router.refresh()
      }}
      trigger={
        <Button type="button" variant="destructive-ghost" size={size} icon={<Trash2 aria-hidden />} disabled={disabled}>
          Delete draft
        </Button>
      }
    />
  )
}
