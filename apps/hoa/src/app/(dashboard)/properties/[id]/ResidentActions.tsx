'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { removeResident } from '@/lib/property-residents'

export function ResidentActions({
  residentId,
  residentName,
  isActive,
}: {
  residentId: string
  residentName: string
  isActive: boolean
}) {
  const router = useRouter()
  if (!isActive) return null
  return (
    <TwoClickDelete
      onDelete={() => removeResident(residentId)}
      successMessage={`${residentName} removed.`}
      onAfterDelete={() => router.refresh()}
      variant="ghost"
    />
  )
}
