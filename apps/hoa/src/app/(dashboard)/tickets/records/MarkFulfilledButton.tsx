'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button, Input, useToast } from '@homeowner-portal/ui'
import { markRecordsRequestFulfilled } from '@/lib/records-requests/actions'

/**
 * Closes the request with an internal note. Nothing is sent to the owner:
 * tell them in the conversation first.
 */
export function MarkFulfilledButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')

  if (!asking) {
    return (
      <Button size="sm" icon={<CheckCircle2 aria-hidden />} onClick={() => setAsking(true)}>
        Mark fulfilled
      </Button>
    )
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const res = await markRecordsRequestFulfilled({ ticketId, note: note.trim() || undefined })
          if (!res.ok) {
            toast({ tone: 'error', message: res.error })
            return
          }
          toast({ tone: 'success', message: 'Marked fulfilled. The owner was not emailed.' })
          router.refresh()
        })
      }}
    >
      <label className="sr-only" htmlFor={`fulfil-${ticketId}`}>
        How the records were provided (internal note, optional)
      </label>
      <Input
        id={`fulfil-${ticketId}`}
        value={note}
        maxLength={1000}
        placeholder="How were they provided? (internal, optional)"
        onChange={(e) => setNote(e.currentTarget.value)}
        className="h-9 min-w-[16rem]"
      />
      <Button type="submit" size="sm" loading={pending}>
        Confirm
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </form>
  )
}
