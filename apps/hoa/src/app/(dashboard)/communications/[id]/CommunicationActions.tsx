'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteCommunication } from '@/lib/communications/actions'

export function CommunicationActions({ commId }: { commId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this communication?',
        description:
          'This permanently removes the message, delivery records, and any replies. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteCommunication(commId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Communication deleted.' })
      router.push('/communications')
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  )
}
