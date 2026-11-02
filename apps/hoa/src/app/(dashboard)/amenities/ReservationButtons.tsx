'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { cancelReservation, createBoardHold, decideReservation, retireAmenity } from '@/lib/amenities/actions'
import { hourLabel } from '@/lib/amenities/model'

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

/** Cancel a booking that has not started. The board gives a reason the resident will read. */
export function CancelButton({ reservationId, asBoard = false, isHold = false }: { reservationId: string; asBoard?: boolean; isHold?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function cancel() {
    startTransition(async () => {
      const res = await cancelReservation(reservationId, reason)
      if (!res.ok) {
        if (res.fieldErrors?.note) setError(res.fieldErrors.note)
        else toast({ tone: 'error', message: res.error })
        return
      }
      toast({ tone: 'success', message: isHold ? 'Hold removed.' : 'Booking canceled.' })
      router.refresh()
    })
  }

  if (asBoard && !isHold && asking) {
    return (
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Field label="Why is it canceled?" required error={error ?? undefined}>
          <Input value={reason} onChange={(e) => setReason(e.currentTarget.value)} disabled={pending} autoComplete="off" />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={cancel} loading={pending}>
            Cancel and tell them
          </Button>
          <Button variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
            Back
          </Button>
        </div>
      </div>
    )
  }
  return (
    <Button variant="ghost" loading={pending} onClick={() => (asBoard && !isHold ? setAsking(true) : cancel())}>
      {isHold ? 'Remove hold' : 'Cancel booking'}
    </Button>
  )
}

/** The board blocks a time (maintenance, a meeting) so nobody can book it. */
export function HoldDialog({ amenities }: { amenities: { id: string; name: string }[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amenityId, setAmenityId] = useState(amenities[0]?.id ?? '')
  const [day, setDay] = useState('')
  const [start, setStart] = useState('9')
  const [end, setEnd] = useState('12')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const hours = Array.from({ length: 25 }, (_, i) => i)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createBoardHold({ amenityId, day, startHour: Number(start), endHour: Number(end), note })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      setOpen(false)
      setNote('')
      toast({ tone: 'success', message: 'Time held. Residents will see it as taken.' })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={amenities.length === 0}>
          Hold a time
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Hold a time"
        description="Block a time for maintenance or a board meeting. Residents see it as taken."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="amenity-hold" loading={pending}>
              Hold this time
            </Button>
          </>
        }
      >
        <form id="amenity-hold" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Which space?" required error={errors.amenityId}>
              <Select value={amenityId} onValueChange={setAmenityId} disabled={pending}>
                {amenities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Day" required error={errors.day}>
              <Input type="date" value={day} onChange={(e) => setDay(e.currentTarget.value)} disabled={pending} />
            </Field>
          </div>
          <Field label="From" required error={errors.startHour}>
            <Select value={start} onValueChange={setStart} disabled={pending}>
              {hours.slice(0, 24).map((h) => (
                <option key={h} value={String(h)}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Until" required error={errors.endHour}>
            <Select value={end} onValueChange={setEnd} disabled={pending}>
              {hours.slice(1).map((h) => (
                <option key={h} value={String(h)}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What is it for?" required error={errors.note} hint="For example: Pool cleaning.">
              <Input value={note} onChange={(e) => setNote(e.currentTarget.value)} disabled={pending} autoComplete="off" />
            </Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Stop offering a space. History stays. The board chooses what happens to upcoming bookings. */
export function RetireButton({ amenityId, name, upcoming }: { amenityId: string; name: string; upcoming: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [cancelUpcoming, setCancelUpcoming] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function retire() {
    startTransition(async () => {
      const res = await retireAmenity({ id: amenityId, cancelUpcoming, note })
      if (!res.ok) {
        if (res.fieldErrors?.note) setError(res.fieldErrors.note)
        else toast({ tone: 'error', message: res.error })
        return
      }
      setOpen(false)
      toast({ tone: 'success', message: `${name} is retired. Its history is kept.` })
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Retire
      </Button>
    )
  }
  return (
    <div className="w-full space-y-3 rounded-lg border border-border p-4">
      <p className="text-base font-semibold text-foreground">Retire {name}?</p>
      <p className="text-base text-foreground-secondary">
        Residents will no longer see it or book it. {upcoming === 0 ? 'It has no upcoming bookings.' : `It has ${upcoming} upcoming ${upcoming === 1 ? 'booking' : 'bookings'}.`}
      </p>
      {upcoming > 0 ? (
        <Checkbox
          label="Cancel the upcoming bookings and tell each resident"
          description="Off: they stay as they are."
          checked={cancelUpcoming}
          onChange={(e) => setCancelUpcoming(e.currentTarget.checked)}
          disabled={pending}
        />
      ) : null}
      {cancelUpcoming ? (
        <Field label="Note for the residents" required error={error ?? undefined}>
          <Input value={note} onChange={(e) => setNote(e.currentTarget.value)} disabled={pending} autoComplete="off" />
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={retire} loading={pending}>
          Retire it
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Back
        </Button>
      </div>
    </div>
  )
}
