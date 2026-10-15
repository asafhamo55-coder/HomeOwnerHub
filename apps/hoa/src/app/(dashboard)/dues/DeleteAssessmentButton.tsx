'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteAssessment } from '@/lib/assessments'

export function DeleteAssessmentButton({ assessmentId, unitLabel }: { assessmentId: string; unitLabel: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      destructive
      title="Delete this charge?"
      description={`Removes the charge for ${unitLabel} from the dues list. Its journal entry stays in the ledger — reverse it there if it should not count.`}
      confirmLabel="Delete charge"
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label={`Delete charge for ${unitLabel}`} title="Delete charge">
          <Trash2 aria-hidden />
        </Button>
      }
      onConfirm={async () => {
        const r = await deleteAssessment(assessmentId)
        if (!r.ok) {
          toast({ tone: 'error', title: 'Couldn’t delete the charge', message: r.error })
          throw new Error(r.error)
        }
        toast({ tone: 'success', message: 'Charge deleted.' })
        router.refresh()
      }}
    />
  )
}
