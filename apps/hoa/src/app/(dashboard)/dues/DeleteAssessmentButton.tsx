'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { deleteAssessment } from '@/lib/assessments'

// Two-click confirmation. First click flips the button into a 5-second
// "Click to confirm" state; second click within that window actually
// deletes. We tried useConfirm() (modal-based) but the <dialog> was
// rendering invisibly in some browser/CSS combinations and clicks
// silently exited the action. This inline pattern has no modal at all
// — the confirmation is fully visible and cancellation is automatic.

export function DeleteAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)

  // Auto-disarm after 5 seconds — prevents stale "armed" states from
  // hanging around if the user navigated away with their eyes but not
  // their mouse.
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(timer)
  }, [armed])

  function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    // Armed → actually delete.
    startTransition(async () => {
      const result = await deleteAssessment(assessmentId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        setArmed(false)
        return
      }
      toast({ tone: 'success', message: 'Assessment deleted.' })
      setArmed(false)
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant={armed ? 'destructive' : 'ghost'}
      onClick={handleClick}
      disabled={pending}
      title={armed ? 'Click again to confirm delete' : 'Delete assessment'}
    >
      {armed ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs">Click to confirm</span>
        </>
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}
