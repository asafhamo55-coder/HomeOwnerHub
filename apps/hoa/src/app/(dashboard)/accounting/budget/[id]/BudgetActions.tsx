'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteBudget } from '@/lib/budgets'

export function BudgetActions({
  budgetId,
  isEditable,
}: {
  budgetId: string
  isEditable: boolean
}) {
  const router = useRouter()
  if (!isEditable) return null
  return (
    <TwoClickDelete
      onDelete={() => deleteBudget(budgetId)}
      successMessage="Budget deleted."
      onAfterDelete={() => router.push('/accounting/budget')}
      label="Delete"
    />
  )
}
