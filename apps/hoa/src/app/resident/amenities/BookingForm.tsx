'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button, Checkbox, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { requestReservation } from '@/lib/amenities/actions'
import { hourLabel, validEnds, type Amenity, type DayView } from '@/lib/amenities/model'

export interface HomeOption {
  id: string
  label: string
}

const STRIP = 14

/**
 * Pick a day, then a free start time, then an end time, then confirm. Only
 * times that can work are offered, and each day says Free times, Full or
 * Closed in words. The server checks every rule again on submit.
 */
export function BookingForm({
  amenity,
  homes,
  days,
}: {
  amenity: Amenity
  homes: HomeOption[]
  /** Free-time view for the next days, starting today. */
  days: DayView[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [unitId, setUnitId] = useState(homes[0]?.id ?? '')
  const [page, setPage] = useState(0)
  const [day, setDay] = useState<string | null>(null)
  const [start, setStart] = useState<number | null>(null)
  const [end, setEnd] = useState<number | null>(null)
  const [purpose, setPurpose] = useState('')
  const [people, setPeople] = useState('')
  const [read, setRead] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const shown = days.slice(page * STRIP, page * STRIP + STRIP)
  const view = useMemo(() => days.find((d) => d.day === day) ?? null, [days, day])
  const ends = view && start !== null ? validEnds(view, start, amenity.maxHours) : []
  const mustRead = Boolean(amenity.rules)
  const home = homes.find((h) => h.id === unitId)

  function chooseDay(d: string) {
    setDay(d)
    setStart(null)
    setEnd(null)
    setErrors({})
  }
  function chooseStart(h: number) {
    setStart(h)
    setEnd(null)
    setErrors({})
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!day || start === null || end === null) return
    startTransition(async () => {
      const res = await requestReservation({
        amenityId: amenity.id,
        unitId,
        day,
        startHour: start,
        endHour: end,
        purpose,
        partySize: people.trim() ? Number(people) : null,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast({ tone: 'error', message: res.error })
        router.refresh()
        return
      }
      setErrors({})
      setDay(null)
      setStart(null)
      setEnd(null)
      setPurpose('')
      setPeople('')
      setRead(false)
      toast({
        tone: 'success',
        message:
          res.status === 'approved'
            ? 'You are booked. See it under Your bookings below.'
            : 'Request sent. Your time is held. You will get an email when the board answers.',
      })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {homes.length > 1 ? (
        <Field label="Which home is this for?" required error={errors.unitId}>
          <Select value={unitId} onValueChange={setUnitId} disabled={pending}>
            {homes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="space-y-2">
        <p className="text-base font-semibold text-foreground">1. Pick a day</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {shown.map((d) => {
            const usable = d.status === 'open'
            return (
              <Button
                key={d.day}
                type="button"
                size="lg"
                variant={day === d.day ? 'default' : 'secondary'}
                disabled={!usable || pending}
                onClick={() => chooseDay(d.day)}
                className="h-auto min-h-14 flex-col items-start gap-0 whitespace-normal py-2 text-left"
                aria-pressed={day === d.day}
              >
                <span className="text-base font-semibold">{d.label}</span>
                <span className="text-sm font-normal">{d.note}</span>
              </Button>
            )
          })}
        </div>
        <div className="flex gap-2">
          {page > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setPage(page - 1)}>
              Earlier dates
            </Button>
          ) : null}
          {(page + 1) * STRIP < days.length ? (
            <Button type="button" variant="ghost" onClick={() => setPage(page + 1)}>
              Later dates
            </Button>
          ) : null}
        </div>
        {errors.day ? <p className="text-base text-danger" role="alert">{errors.day}</p> : null}
      </div>

      {view ? (
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">2. Pick when you start on {view.label}</p>
          {view.hours ? (
            <p className="text-base text-foreground-secondary">
              Open {hourLabel(view.hours.open)} to {hourLabel(view.hours.close)}. You can book up to {amenity.maxHours}{' '}
              {amenity.maxHours === 1 ? 'hour' : 'hours'} in a row.
            </p>
          ) : null}
          <ul className="grid gap-2 sm:grid-cols-2">
            {view.slots.map((s) => (
              <li key={s.hour} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="text-base text-foreground">
                  {s.label}{' '}
                  <span className="text-foreground-secondary">
                    {s.state === 'free' ? 'Free' : s.state === 'taken' ? 'Taken' : s.state === 'past' ? 'Passed' : 'Too soon'}
                  </span>
                </span>
                {s.state === 'free' ? (
                  <Button
                    type="button"
                    size="md"
                    variant={start === s.hour ? 'default' : 'secondary'}
                    onClick={() => chooseStart(s.hour)}
                    disabled={pending}
                    aria-pressed={start === s.hour}
                  >
                    {start === s.hour ? 'Chosen' : 'Choose'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {errors.startHour ? <p className="text-base text-danger" role="alert">{errors.startHour}</p> : null}
        </div>
      ) : null}

      {view && start !== null ? (
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">3. Pick when you finish</p>
          <div className="flex flex-wrap gap-2">
            {ends.map((h) => (
              <Button
                key={h}
                type="button"
                size="lg"
                variant={end === h ? 'default' : 'secondary'}
                onClick={() => setEnd(h)}
                disabled={pending}
                aria-pressed={end === h}
              >
                {hourLabel(h)}
              </Button>
            ))}
          </div>
          {errors.endHour ? <p className="text-base text-danger" role="alert">{errors.endHour}</p> : null}
        </div>
      ) : null}

      {view && start !== null && end !== null ? (
        <div className="space-y-4">
          <p className="text-base font-semibold text-foreground">4. Check your booking</p>
          <p className="text-base text-foreground">
            {amenity.name}, {view.label}, {hourLabel(start)} to {hourLabel(end)}
            {home ? `, for ${home.label}` : ''}.
          </p>
          {amenity.capacity ? (
            <Field label={`How many people? (up to ${amenity.capacity})`} optional error={errors.partySize}>
              <Input value={people} onChange={(e) => setPeople(e.currentTarget.value)} inputMode="numeric" disabled={pending} autoComplete="off" />
            </Field>
          ) : null}
          <Field label="What is it for?" optional error={errors.purpose}>
            <Input value={purpose} onChange={(e) => setPurpose(e.currentTarget.value)} disabled={pending} autoComplete="off" />
          </Field>
          {mustRead ? (
            <Checkbox
              label="I read the house rules above"
              checked={read}
              onChange={(e) => setRead(e.currentTarget.checked)}
              disabled={pending}
            />
          ) : null}
          <Button type="submit" size="lg" loading={pending} disabled={!unitId || (mustRead && !read)}>
            {amenity.requiresApproval ? 'Ask the board for this time' : 'Book this time'}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
