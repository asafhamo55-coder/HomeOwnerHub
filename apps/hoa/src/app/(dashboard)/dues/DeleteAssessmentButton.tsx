'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteAssessment } from '@/lib/assessments'

export function DeleteAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this assessment?',
        description:
          'This permanently removes the assessment and its journal entries. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteAssessment(assessmentId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Assessment deleted.' })
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
