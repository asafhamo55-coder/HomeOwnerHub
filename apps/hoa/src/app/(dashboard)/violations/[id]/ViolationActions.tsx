'use client'

import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteViolation } from '@/lib/violations'

export function ViolationActions({ violationId }: { violationId: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/violations/${violationId}/edit`)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <TwoClickDelete
        onDelete={() => deleteViolation(violationId)}
        successMessage="Violation deleted."
        onAfterDelete={() => router.push('/violations')}
        label="Delete"
      />
    </div>
  )
}
