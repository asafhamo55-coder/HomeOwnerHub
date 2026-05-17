'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { reverseJournalEntry } from '@/lib/journal-entries'

export function ReverseEntryButton({ journalEntryId }: { journalEntryId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await reverseJournalEntry({
        journalEntryId,
        reason: reason.trim() || undefined,
      })
      if (!result.ok) {
        setError(result.error)
      } else {
        router.push(`/accounting/ledger/${result.reversingJeId}`)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Undo2 className="h-3.5 w-3.5" />
        Reverse entry
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Reason (optional)</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. duplicate posting, wrong account"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          disabled={pending}
        />
      </label>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={() => setOpen(false)} variant="ghost" size="sm" disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="outline" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Post reversal
        </Button>
      </div>
    </div>
  )
}
