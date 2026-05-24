'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteArcRequest } from '@/lib/board-review'

export function ArcActions({ arcId }: { arcId: string }) {
  const router = useRouter()
  return (
    <TwoClickDelete
      onDelete={() => deleteArcRequest(arcId)}
      successMessage="ARC application deleted."
      onAfterDelete={() => router.push('/arc')}
      label="Delete"
    />
  )
}
