'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, useToast } from '@homeowner-portal/ui'
import { materializeCurrentPeriodAssessments } from '@/lib/assessments'

/** Generate this month's regular dues for every property, in a dialog. */
export function MaterializeButton({ monthLabel, variant = 'secondary' }: { monthLabel: string; variant?: 'default' | 'secondary' }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('250')
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter the monthly dues per property, greater than $0.')
      return
    }
    setError(undefined)
    startTransition(async () => {
      const result = await materializeCurrentPeriodAssessments({ amountPerUnit: n })
      if (!result.ok) {
        if (result.fieldErrors?.amountPerUnit) setError(result.fieldErrors.amountPerUnit)
        else toast({ tone: 'error', title: 'Couldn’t generate dues', message: result.error })
        return
      }
      setOpen(false)
      toast({ tone: 'success', message: `${monthLabel} dues generated.` })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant} icon={<CalendarPlus aria-hidden />}>
          Generate {monthLabel} dues
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Generate ${monthLabel} dues`}
        description="Creates one regular charge per property for this month and posts it to the ledger. Properties that already have regular dues in the current fiscal period are skipped."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="materialize-dues" loading={pending}>
              Generate dues
            </Button>
          </>
        }
      >
        <form id="materialize-dues" onSubmit={submit}>
          <Field label="Amount per property" required error={error}>
            <Input inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
