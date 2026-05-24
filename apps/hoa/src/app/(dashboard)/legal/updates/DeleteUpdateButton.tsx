'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteLawUpdate } from '@/lib/state-law'

export function DeleteUpdateButton({ updateId }: { updateId: string }) {
  const router = useRouter()
  return (
    <TwoClickDelete
      onDelete={() => deleteLawUpdate(updateId)}
      successMessage="Update deleted."
      onAfterDelete={() => router.refresh()}
      label="Delete"
    />
  )
}
