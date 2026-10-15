'use client'

import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { withdrawMyArcRequest } from '@/lib/resident-submissions'

export function WithdrawArcButton({ arcId }: { arcId: string }) {
  const router = useRouter()
  const toast = useToast()

  async function withdraw() {
    const result = await withdrawMyArcRequest(arcId)
    if (!result.ok) {
      toast({ tone: 'error', title: 'Couldn’t withdraw', message: result.error })
      // Throwing keeps the dialog open so the resident can retry or cancel.
      throw new Error('withdraw failed')
    }
    toast({ tone: 'success', message: 'Application withdrawn.' })
    router.refresh()
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive-ghost" size="sm" icon={<Undo2 aria-hidden />}>
          Withdraw
        </Button>
      }
      title="Withdraw this application?"
      description="The board will stop reviewing it. To make the change later, you'll need to submit a new application."
      confirmLabel="Withdraw application"
      destructive
      onConfirm={withdraw}
    />
  )
}
