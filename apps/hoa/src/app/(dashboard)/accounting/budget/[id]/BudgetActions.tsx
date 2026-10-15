'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteBudget } from '@/lib/budgets'

/** Delete a draft budget (approved budgets are locked and offer no delete). */
export function BudgetActions({ budgetId, name }: { budgetId: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      destructive
      title={`Delete the ${name} budget?`}
      description="The draft and all its line items are removed. Nothing in the ledger changes."
      confirmLabel="Delete budget"
      trigger={
        <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
          Delete
        </Button>
      }
      onConfirm={async () => {
        const r = await deleteBudget(budgetId)
        if (!r.ok) {
          toast({ tone: 'error', title: 'Couldn’t delete the budget', message: r.error })
          throw new Error(r.error)
        }
        toast({ tone: 'success', message: 'Budget deleted.' })
        router.push('/accounting/budget')
        router.refresh()
      }}
    />
  )
}
