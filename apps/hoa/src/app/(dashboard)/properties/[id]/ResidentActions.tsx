'use client'

import { useRouter } from 'next/navigation'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
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
    <ConfirmDeleteButton
      title={`Remove ${residentName}?`}
      description="They stop receiving notices for this home. The record stays in the property’s history."
      confirmLabel="Remove"
      successMessage={`${residentName} removed.`}
      onDelete={() => removeResident(residentId)}
      onAfterDelete={() => router.refresh()}
    />
  )
}
