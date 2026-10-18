'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { runArcReviewNow } from '@/lib/arc-review/actions'

/** BL-027: run (or re-run) the W37 draft for one application. Board-gated server-side. */
export function RunArcReviewButton({ arcId, label }: { arcId: string; label: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Sparkles aria-hidden />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await runArcReviewNow(arcId)
          if (!r.ok) {
            toast({ tone: 'error', title: 'Couldn’t run the AI review', message: r.error })
            return
          }
          toast({ tone: 'success', message: 'AI review ready. Nothing was decided.' })
          router.refresh()
        })
      }
    >
      {label}
    </Button>
  )
}
