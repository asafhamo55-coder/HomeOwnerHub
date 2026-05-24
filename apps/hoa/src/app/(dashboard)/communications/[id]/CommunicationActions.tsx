'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteCommunication } from '@/lib/communications/actions'

export function CommunicationActions({ commId }: { commId: string }) {
  const router = useRouter()
  return (
    <TwoClickDelete
      onDelete={() => deleteCommunication(commId)}
      successMessage="Communication deleted."
      onAfterDelete={() => router.push('/communications')}
      label="Delete"
    />
  )
}
