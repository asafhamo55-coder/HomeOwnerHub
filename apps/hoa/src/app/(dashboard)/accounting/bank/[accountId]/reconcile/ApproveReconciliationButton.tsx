'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { approveReconciliation } from '@/lib/bank-reconciliation'
import { usd } from '@/lib/money/format'

/**
 * Approve one reconciliation. A balanced one approves in one click; one
 * with a difference asks first (it used to use the browser's native
 * confirm()), then sends force=true so the variance stays on the record.
 */
export function ApproveReconciliationButton({ reconciliationId, difference }: { reconciliationId: string; difference: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const hasDiff = Math.abs(difference) > 0.01

  async function approve() {
    const r = await approveReconciliation({ reconciliationId, force: hasDiff })
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t approve', message: r.error })
      throw new Error(r.error)
    }
    toast({ tone: 'success', message: 'Reconciliation approved.' })
    router.refresh()
  }

  if (!hasDiff) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={<Check aria-hidden />}
        loading={pending}
        onClick={() => startTransition(() => approve().catch(() => undefined))}
      >
        Approve
      </Button>
    )
  }

  return (
    <ConfirmDialog
      title={`Approve with a ${usd(difference)} difference?`}
      description="The statement and the ledger don’t agree. Approving records the difference as-is; it stays visible on this reconciliation."
      confirmLabel="Approve anyway"
      trigger={
        <Button size="sm" variant="secondary" icon={<Check aria-hidden />}>
          Approve
        </Button>
      }
      onConfirm={approve}
    />
  )
}
