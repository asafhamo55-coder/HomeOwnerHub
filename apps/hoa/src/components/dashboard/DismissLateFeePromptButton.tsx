'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useToast } from '@homeowner-portal/ui'
import { dismissLateFeePrompt } from '@/lib/late-fees/prompt-actions'

export function DismissLateFeePromptButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="lg"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await dismissLateFeePrompt()
          if (!result.ok) {
            toast({ tone: 'error', title: 'Couldn’t hide this', message: result.error ?? 'Try again.' })
            return
          }
          router.refresh()
        })
      }
    >
      Not now
    </Button>
  )
}
