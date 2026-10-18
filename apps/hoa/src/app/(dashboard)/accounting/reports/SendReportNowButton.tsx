'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { sendMonthlyReportNow } from '@/lib/monthly-report/actions'

/** Queues last month's board report (admins). The job decides and sends; a month already sent is refused. */
export function SendReportNowButton({ disabled, label }: { disabled: boolean; label: string }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function send() {
    startTransition(async () => {
      const res = await sendMonthlyReportNow()
      if (!res.ok) {
        toast({ tone: 'error', title: 'Report not sent', message: res.error })
        return
      }
      toast({
        tone: 'success',
        title: `${res.data.label} report queued`,
        message: 'Board members will have it in their inbox in a few minutes.',
      })
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      onClick={send}
      loading={pending}
      disabled={disabled}
      title={disabled ? `The ${label} report has already been sent.` : undefined}
      icon={<Send aria-hidden />}
    >
      Send now
    </Button>
  )
}
