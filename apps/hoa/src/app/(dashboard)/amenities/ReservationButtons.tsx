'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Field, Input, useToast } from '@homeowner-portal/ui'
import { cancelReservation, decideReservation } from '@/lib/amenities/actions'

/** Approve or deny a waiting request. A denial asks for a short reason. */
export function DecideButtons({ reservationId }: { reservationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [denying, setDenying] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function decide(decision: 'approve' | 'deny') {
    startTransition(async () => {
      const res = await decideReservation({ reservationId, decision, note })
      if (!res.ok) {
        if (res.fieldErrors?.note) setError(res.fieldErrors.note)
        else toast({ tone: 'error', message: res.error })
        return
      }
      toast({ tone: 'success', message: decision === 'approve' ? 'Booking approved.' : 'Booking turned down.' })
      router.refresh()
    })
  }

  if (denying) {
    return (
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Field label="Why is it not approved?" required error={error ?? undefined}>
          <Input value={note} onChange={(e) => setNote(e.currentTarget.value)} disabled={pending} autoComplete="off" />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => decide('deny')} loading={pending}>
            Send answer
          </Button>
          <Button variant="ghost" onClick={() => setDenying(false)} disabled={pending}>
            Back
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <Button onClick={() => decide('approve')} loading={pending}>
        Approve
      </Button>
      <Button variant="secondary" onClick={() => setDenying(true)} disabled={pending}>
        Turn down
      </Button>
    </div>
  )
}

/** Cancel a booking that has not started. */
export function CancelButton({ reservationId }: { reservationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelReservation(reservationId)
          if (!res.ok) {
            toast({ tone: 'error', message: res.error })
            return
          }
          toast({ tone: 'success', message: 'Booking canceled.' })
          router.refresh()
        })
      }
    >
      Cancel booking
    </Button>
  )
}
