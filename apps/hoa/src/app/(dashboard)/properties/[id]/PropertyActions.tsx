'use client'

import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteProperty } from '@/lib/properties'

export function PropertyActions({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/properties/${propertyId}/edit`)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <TwoClickDelete
        onDelete={async () => {
          // deleteProperty throws on failure instead of returning {ok, error}.
          // Adapt to the TwoClickDelete contract.
          try {
            await deleteProperty(propertyId)
            return { ok: true as const }
          } catch (err) {
            return {
              ok: false as const,
              error: err instanceof Error ? err.message : 'Delete failed.',
            }
          }
        }}
        successMessage="Property deleted."
        onAfterDelete={() => router.push('/properties')}
        label="Delete"
      />
    </div>
  )
}
