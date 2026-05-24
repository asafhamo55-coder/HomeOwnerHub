'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteAssessment } from '@/lib/assessments'

export function DeleteAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  return (
    <TwoClickDelete
      onDelete={() => deleteAssessment(assessmentId)}
      successMessage="Assessment deleted."
      onAfterDelete={() => router.refresh()}
      variant="ghost"
    />
  )
}
