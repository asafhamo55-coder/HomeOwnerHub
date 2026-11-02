'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { requestReservation } from '@/lib/amenities/actions'
import { endHours, hourLabel, startHours, type Amenity } from '@/lib/amenities/model'

export interface HomeOption {
  id: string
  label: string
}

/** Pick a day and hours. Plain words, big fields; the server checks every rule again. */
export function BookingForm({
  amenity,
  homes,
  today,
  lastDay,
}: {
  amenity: Amenity
  homes: HomeOption[]
  today: string
  lastDay: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const first = startHours(amenity)[0] ?? amenity.openHour
  const [unitId, setUnitId] = useState(homes[0]?.id ?? '')
  const [day, setDay] = useState('')
  const [start, setStart] = useState(String(first))
  const [end, setEnd] = useState(String(first + 1))
  const [purpose, setPurpose] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const ends = endHours(amenity, Number(start))

  function changeStart(v: string) {
    setStart(v)
    const options = endHours(amenity, Number(v))
    if (!options.includes(Number(end))) setEnd(String(options[0] ?? Number(v) + 1))
    setErrors(({ startHour: _s, endHour: _e, ...rest }) => rest)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await requestReservation({
        amenityId: amenity.id,
        unitId,
        day,
        startHour: Number(start),
        endHour: Number(end),
        purpose,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      setDay('')
      setPurpose('')
      toast({
        tone: 'success',
        message: res.status === 'approved' ? 'You are booked.' : 'Request sent. The board will answer here.',
      })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {homes.length > 1 ? (
        <div className="sm:col-span-2">
          <Field label="Which home is this for?" required error={errors.unitId}>
            <Select value={unitId} onValueChange={setUnitId} disabled={pending}>
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Field label="Day" required error={errors.day}>
          <Input type="date" value={day} min={today} max={lastDay} onChange={(e) => setDay(e.currentTarget.value)} disabled={pending} required />
        </Field>
      </div>
      <Field label="From" required error={errors.startHour}>
        <Select value={start} onValueChange={changeStart} disabled={pending}>
          {startHours(amenity).map((h) => (
            <option key={h} value={String(h)}>
              {hourLabel(h)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Until" required error={errors.endHour}>
        <Select value={end} onValueChange={setEnd} disabled={pending}>
          {ends.map((h) => (
            <option key={h} value={String(h)}>
              {hourLabel(h)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="What is it for?" optional error={errors.purpose}>
          <Input value={purpose} onChange={(e) => setPurpose(e.currentTarget.value)} disabled={pending} autoComplete="off" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={pending} disabled={!day || !unitId}>
          {amenity.requiresApproval ? 'Ask the board for this time' : 'Book this time'}
        </Button>
      </div>
    </form>
  )
}
