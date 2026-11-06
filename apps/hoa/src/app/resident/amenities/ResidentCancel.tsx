'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, useToast } from '@homeowner-portal/ui'
import { cancelReservation } from '@/lib/amenities/actions'

/** The "Your bookings" heading on the page; focus lands here after a cancel. */
export const BOOKINGS_HEADING_ID = 'your-bookings-heading'

/**
 * A resident cancels their own booking. The first tap asks "Cancel
 * Clubhouse, Sat Nov 8, 2 pm?" so a slip of the thumb does not lose the time.
 * The board's own cancel path is in the dashboard and is unchanged.
 */
export function ResidentCancel({ reservationId, label }: { reservationId: string; label: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const yes = useRef<HTMLButtonElement>(null)
  const ask = useRef<HTMLButtonElement>(null)
  const wasAsking = useRef(false)

  useEffect(() => {
    if (asking) yes.current?.focus()
    else if (wasAsking.current) ask.current?.focus()
    wasAsking.current = asking
  }, [asking])

  function cancel() {
    startTransition(async () => {
      const res = await cancelReservation(reservationId, '')
      if (!res.ok) {
        toast({ tone: 'error', message: res.error })
        setAsking(false)
        return
      }
      toast({ tone: 'success', message: 'Booking canceled.' })
      // Move to the bookings list so a screen reader hears what changed.
      document.getElementById(BOOKINGS_HEADING_ID)?.focus()
      router.refresh()
    })
  }

  if (!asking) {
    return (
      <Button ref={ask} type="button" variant="secondary" size="lg" className="min-h-12" aria-label={`Cancel booking: ${label}`} onClick={() => setAsking(true)}>
        Cancel booking
      </Button>
    )
  }
  return (
    <div role="group" aria-label={`Cancel ${label}?`} className="space-y-2">
      <p className="text-base font-semibold text-foreground">Cancel {label}?</p>
      <div className="flex flex-wrap gap-2">
        <Button ref={yes} type="button" variant="destructive" size="lg" className="min-h-12" loading={pending} onClick={cancel}>
          Yes, cancel it
        </Button>
        <Button type="button" variant="secondary" size="lg" className="min-h-12" disabled={pending} onClick={() => setAsking(false)}>
          No, keep it
        </Button>
      </div>
    </div>
  )
}
