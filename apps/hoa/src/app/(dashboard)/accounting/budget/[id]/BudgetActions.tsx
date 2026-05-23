'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteBudget } from '@/lib/budgets'

export function BudgetActions({
  budgetId,
  isEditable,
}: {
  budgetId: string
  isEditable: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  if (!isEditable) return null

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this budget?',
        description:
          'This permanently removes the draft budget and all its line items. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteBudget(budgetId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Budget deleted.' })
      router.push('/accounting/budget')
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  )
}
