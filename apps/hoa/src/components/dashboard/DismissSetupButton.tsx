'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { dismissSetupChecklist } from '@/lib/dashboard/setup-actions'

export function DismissSetupButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<X />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await dismissSetupChecklist()
          if (!result.ok) {
            toast({ tone: 'error', title: 'Couldn’t hide the checklist', message: result.error ?? 'Try again.' })
            return
          }
          router.refresh()
        })
      }
    >
      Dismiss
    </Button>
  )
}
