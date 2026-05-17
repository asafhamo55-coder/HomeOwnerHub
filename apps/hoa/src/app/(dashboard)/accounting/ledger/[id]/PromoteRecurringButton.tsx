'use client'

import { useState, useTransition } from 'react'
import { Loader2, Repeat } from 'lucide-react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import { promoteJeToRecurring } from '@/lib/journal-entries'

const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PromoteRecurringButton({ journalEntryId }: { journalEntryId: string }) {
  const [open, setOpen] = useState(false)
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]>('monthly')
  const [nextRunDate, setNextRunDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    setDone(false)
    startTransition(async () => {
      const r = await promoteJeToRecurring({
        journalEntryId,
        cadence,
        nextRunDate,
      })
      if (!r.ok) {
        setError(r.error)
      } else {
        setDone(true)
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button onClick={() => setOpen(true)} variant="outline" size="sm">
          <Repeat className="h-3.5 w-3.5" />
          Make recurring
        </Button>
        {done ? (
          <span className="text-[11px] text-emerald-600">
            ✓ Saved as recurring template — see Accounting → Recurring Entries
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <p className="text-sm font-semibold text-foreground">Repeat this entry</p>
      <p className="text-xs text-muted">
        The daily cron will clone this JE&apos;s lines on the chosen cadence and
        post a fresh entry with source=&apos;recurring&apos;.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-muted">Cadence</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as (typeof CADENCES)[number])}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            disabled={pending}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted">Next run</span>
          <Input
            type="date"
            value={nextRunDate}
            onChange={(e) => setNextRunDate(e.target.value)}
            disabled={pending}
            className="mt-1"
          />
        </label>
      </div>
      {error ? <Alert variant="error" className="text-xs">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={() => setOpen(false)} variant="ghost" size="sm" disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />}
          Save template
        </Button>
      </div>
    </div>
  )
}
