'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Alert, Button, Input } from '@homeownerhub/ui'
import { materializeCurrentPeriodDues } from '@/lib/dues'

interface Props {
  monthLabel: string
}

export function MaterializeButton({ monthLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(250)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await materializeCurrentPeriodDues({ amountPerProperty: amount })
      if (!result.ok) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Plus className="h-3.5 w-3.5" />
        Generate {monthLabel} dues
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-muted">
        Amount per property:
        <Input
          type="number"
          min={0}
          step={25}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          prefix={<span className="text-xs">$</span>}
          className="ml-2 inline-block w-32"
          disabled={pending}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={pending} size="sm">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Generate
        </Button>
        <Button onClick={() => setOpen(false)} variant="ghost" size="sm" disabled={pending}>
          Cancel
        </Button>
      </div>
      {error ? (
        <Alert variant="error" className="w-full">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
