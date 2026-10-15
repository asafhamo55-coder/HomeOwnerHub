'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, useToast } from '@homeowner-portal/ui'
import { reverseJournalEntry } from '@/lib/journal-entries'

/**
 * Posts a mirror-image entry dated today. Destructive in effect (the
 * original stops counting), so it is a dialog with Cancel focused first
 * rather than an inline panel that pushed the page around.
 */
export function ReverseEntryButton({ journalEntryId, entryNumber }: { journalEntryId: string; entryNumber: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(undefined)
    startTransition(async () => {
      const result = await reverseJournalEntry({ journalEntryId, reason: reason.trim() || undefined })
      if (!result.ok) {
        if (result.fieldErrors?.reason) setFieldError(result.fieldErrors.reason)
        else toast({ tone: 'error', title: 'Couldn’t reverse the entry', message: result.error })
        return
      }
      setOpen(false)
      toast({ tone: 'success', message: `Reversal posted for ${entryNumber}.` })
      router.push(`/accounting/ledger/${result.reversingJeId}`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" icon={<Undo2 aria-hidden />}>
          Reverse
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Reverse ${entryNumber}?`}
        description="Posts an equal and opposite entry dated today. The original stays on the books, marked reversed — nothing is deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending} autoFocus>
              Cancel
            </Button>
            <Button type="submit" form="reverse-je" variant="destructive" loading={pending} icon={<Undo2 aria-hidden />}>
              Post reversal
            </Button>
          </>
        }
      >
        <form id="reverse-je" onSubmit={submit}>
          <Field label="Reason" optional hint="Kept on the reversing entry’s memo for the audit trail." error={fieldError}>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate posting, wrong account…"
              maxLength={500}
              disabled={pending}
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
