'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteProperty } from '@/lib/properties'

export function PropertyActions({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this property?',
        description:
          'This permanently removes the property and all associated residents, violations, and assessment history. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      try {
        await deleteProperty(propertyId)
        toast({ tone: 'success', message: 'Property deleted.' })
        router.push('/properties')
      } catch (err) {
        toast({ tone: 'error', message: err instanceof Error ? err.message : 'Delete failed.' })
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/properties/${propertyId}/edit`)}
        disabled={pending}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  )
}
