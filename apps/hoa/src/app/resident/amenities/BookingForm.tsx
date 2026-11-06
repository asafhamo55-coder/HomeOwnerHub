'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button, Checkbox, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { requestReservation } from '@/lib/amenities/actions'
import { loadBookingDays } from '@/lib/amenities/booking-days'
import { addCalendarDays } from '@/lib/association-time'
import { validEnds, type Amenity, type DayView } from '@/lib/amenities/model'
import {
  SLOT_WORDS,
  WEEKDAY_HEADS,
  approvalLine,
  dayAria,
  hoursWord,
  longDayLabel,
  monthTitle,
  monthWeeks,
  nextMonth,
  plainRules,
  prevMonth,
  reviewSentence,
  timeLabel,
} from '@/lib/amenities/booking-copy'

export interface HomeOption {
  id: string
  label: string
}

/** Everything the server worked out for one space. */
export interface BookableAmenity {
  amenity: Amenity
  homes: HomeOption[]
  /** Free-time view from today for the first weeks; later months load on demand. */
  days: DayView[]
  today: string
  /** The last day the space can be booked (today plus the advance limit). */
  lastDay: string
  timeZone: string
  /** Bookings that still count against the limit, by home id. */
  activeByHome: Record<string, number>
}

type Step = 'amenity' | 'day' | 'time' | 'review' | 'done'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function scrollTo(el: HTMLElement | null) {
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' })
}

/**
 * Four plain steps: pick a space, pick a day, pick a time and length, check
 * and book. Availability comes from the server; this only shows it. The
 * server checks every rule again on submit.
 */
export function BookingForm({ spaces }: { spaces: BookableAmenity[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const single = spaces.length === 1
  const [step, setStep] = useState<Step>(single ? 'day' : 'amenity')
  const [spaceId, setSpaceId] = useState<string | null>(single ? spaces[0].amenity.id : null)
  const [month, setMonth] = useState<string>(spaces[0]?.today.slice(0, 7) ?? '')
  const [extra, setExtra] = useState<Record<string, DayView[]>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [monthFailed, setMonthFailed] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [start, setStart] = useState<number | null>(null)
  const [end, setEnd] = useState<number | null>(null)
  const [unitId, setUnitId] = useState(single ? (spaces[0].homes[0]?.id ?? '') : '')
  const [purpose, setPurpose] = useState('')
  const [people, setPeople] = useState('')
  const [read, setRead] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ status: 'pending' | 'approved'; sentence: string } | null>(null)

  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lengthRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const space = spaces.find((s) => s.amenity.id === spaceId) ?? null
  const amenity = space?.amenity ?? null
  const allDays = useMemo(() => (space ? [...space.days, ...(extra[space.amenity.id] ?? [])] : []), [space, extra])
  const byDay = useMemo(() => new Map(allDays.map((d) => [d.day, d])), [allDays])
  const view = day ? (byDay.get(day) ?? null) : null
  const ends = view && start !== null && amenity ? validEnds(view, start, amenity.maxHours) : []
  const mustRead = Boolean(amenity?.rules)
  const activeCount = space ? (space.activeByHome[unitId] ?? 0) : 0
  const atLimit = Boolean(amenity && activeCount >= amenity.maxActivePerUnit)

  // Every step change moves focus to that step's heading and back to the top.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    scrollTo(formRef.current)
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  // Choosing a start time brings "How long?" into view and reads it out.
  useEffect(() => {
    if (start === null) return
    scrollTo(lengthRef.current)
    lengthRef.current?.focus({ preventScroll: true })
  }, [start])

  function chooseSpace(s: BookableAmenity) {
    setSpaceId(s.amenity.id)
    setMonth(s.today.slice(0, 7))
    setUnitId(s.homes[0]?.id ?? '')
    setDay(null)
    setStart(null)
    setEnd(null)
    setErrors({})
    setRead(false)
    setStep('day')
  }
  function chooseDay(d: string) {
    setDay(d)
    setStart(null)
    setEnd(null)
    setErrors({})
    setStep('time')
  }
  function chooseStart(h: number) {
    setStart(h)
    setEnd(null)
    setErrors({})
  }
  function back() {
    setErrors({})
    if (step === 'review') setStep('time')
    else if (step === 'time') setStep('day')
    else if (step === 'day' && !single) setStep('amenity')
  }
  function toReview() {
    if (start === null) return setErrors({ startHour: 'Tap a start time first.' })
    if (end === null) return setErrors({ endHour: 'Tap how long you want it for.' })
    setErrors({})
    setStep('review')
  }

  async function goToMonth(m: string) {
    if (!space) return setMonth(m)
    const lastLoaded = allDays[allDays.length - 1]?.day
    const monthEnd = addCalendarDays(`${nextMonth(m)}-01`, -1)
    if (!lastLoaded || lastLoaded >= monthEnd || lastLoaded >= space.lastDay) {
      setMonthFailed(null)
      return setMonth(m)
    }
    setLoadingMore(true)
    const res = await loadBookingDays({ amenityId: space.amenity.id, fromDay: addCalendarDays(lastLoaded, 1), count: 62 })
    setLoadingMore(false)
    if (!res.ok) {
      // Stay on the month already shown; offer to try again.
      setMonthFailed(m)
      return
    }
    setMonthFailed(null)
    setExtra((cur) => ({ ...cur, [space.amenity.id]: [...(cur[space.amenity.id] ?? []), ...res.days] }))
    setMonth(m)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!amenity || !day || start === null || end === null) return
    const next: Record<string, string> = {}
    if (!unitId) next.unitId = 'Pick your home.'
    const n = people.trim() ? Number(people) : null
    if (n !== null && (!Number.isInteger(n) || n < 1)) next.partySize = 'Enter a whole number, 1 or more.'
    else if (n !== null && amenity.capacity !== null && n > amenity.capacity) {
      next.partySize = `${amenity.name} holds up to ${amenity.capacity} people.`
    }
    if (mustRead && !read) next.rules = 'Please tick the box to say you read the house rules.'
    if (Object.keys(next).length > 0) return setErrors(next)
    const sentence = reviewSentence(amenity.name, day, start, end)
    startTransition(async () => {
      const res = await requestReservation({
        amenityId: amenity.id,
        unitId,
        day,
        startHour: start,
        endHour: end,
        purpose,
        partySize: n,
      })
      if (!res.ok) {
        const f = res.fieldErrors ?? {}
        setErrors({ ...f, form: res.error })
        // Send the resident to the step that shows the problem.
        if (f.day) setStep('day')
        else if (f.startHour || f.endHour) setStep('time')
        toast({ tone: 'error', message: res.error })
        router.refresh()
        return
      }
      setErrors({})
      setResult({ status: res.status ?? 'pending', sentence })
      setStep('done')
      setDay(null)
      setStart(null)
      setEnd(null)
      setPurpose('')
      setPeople('')
      setRead(false)
      router.refresh()
    })
  }

  const stepNumber = step === 'amenity' ? 1 : step === 'day' ? 2 : step === 'time' ? 3 : 4
  const stepTotal = single ? 3 : 4
  const shownNumber = single ? stepNumber - 1 : stepNumber

  if (step === 'done' && result) {
    return (
      <div ref={formRef as unknown as React.RefObject<HTMLDivElement>} className="space-y-4" role="status">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">
          {result.status === 'approved' ? 'You are booked.' : 'Your request is sent.'}
        </h2>
        <p className="text-base text-foreground">{result.sentence}.</p>
        <p className="text-base text-foreground-secondary">
          {result.status === 'approved'
            ? 'It is listed under Your bookings below.'
            : 'Your time is held. We’ll let you know when the board answers.'}
        </p>
        <Button type="button" size="lg" variant="secondary" onClick={() => setStep(single ? 'day' : 'amenity')}>
          Book another time
        </Button>
      </div>
    )
  }

  const h2 = 'text-xl font-semibold text-foreground focus:outline-none'

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-foreground" aria-live="polite">
          Step {Math.max(shownNumber, 1)} of {stepTotal}
        </p>
        {step !== 'amenity' && !(step === 'day' && single) ? (
          <Button type="button" variant="ghost" size="lg" onClick={back} disabled={pending}>
            Back
          </Button>
        ) : null}
      </div>

      {step === 'amenity' ? (
        <section aria-labelledby="step-amenity" className="space-y-3">
          <h2 ref={headingRef} tabIndex={-1} id="step-amenity" className={h2}>
            What would you like to book?
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s) => (
              <li key={s.amenity.id}>
                <button
                  type="button"
                  onClick={() => chooseSpace(s)}
                  className={`flex min-h-24 w-full flex-col items-start gap-1 rounded-xl border-2 border-border-strong bg-surface p-4 text-left hover:bg-subtle ${FOCUS}`}
                >
                  <span className="text-lg font-semibold text-foreground">{s.amenity.name}</span>
                  {s.amenity.description ? <span className="text-base text-foreground">{s.amenity.description}</span> : null}
                  <span className="text-base text-foreground-secondary">{plainRules(s.amenity)}</span>
                  <span className="text-base text-foreground-secondary">{approvalLine(s.amenity.requiresApproval)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step === 'day' && space ? (
        <section aria-labelledby="step-day" className="space-y-3">
          <h2 ref={headingRef} tabIndex={-1} id="step-day" className={h2}>
            Which day for {space.amenity.name}?
          </h2>
          <p className="text-base text-foreground-secondary">{plainRules(space.amenity)}</p>
          {space.homes.length > 1 ? (
            <Field label="Which home is this for?" required error={errors.unitId}>
              <Select value={unitId} onValueChange={setUnitId} disabled={pending}>
                {space.homes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {atLimit ? (
            <p className="text-base font-semibold text-foreground" role="alert">
              You already have {activeCount} of {space.amenity.maxActivePerUnit} bookings for {space.amenity.name}. Cancel one or wait until it has
              passed.
            </p>
          ) : null}
          <MonthPicker
            space={space}
            month={month}
            goToMonth={goToMonth}
            byDay={byDay}
            allDays={allDays}
            selected={day}
            onPick={chooseDay}
            blocked={pending || atLimit}
            loading={loadingMore}
          />
          {monthFailed ? (
            <div className="space-y-2" role="alert">
              <p className="text-base text-danger">We couldn&apos;t load that month.</p>
              <Button type="button" size="lg" variant="secondary" className="min-h-12" onClick={() => goToMonth(monthFailed)}>
                Try again
              </Button>
            </div>
          ) : null}
          {errors.day ? (
            <p className="text-base text-danger" role="alert">
              {errors.day}
            </p>
          ) : null}
          {errors.form && errors.form !== errors.day ? (
            <p className="text-base text-danger" role="alert">
              {errors.form}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 'time' && space && view && amenity ? (
        <section aria-labelledby="step-time" className="space-y-4">
          <h2 ref={headingRef} tabIndex={-1} id="step-time" className={h2}>
            What time on {longDayLabel(view.day)}?
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Start times">
            {view.slots.map((s) => {
              const free = s.state === 'free'
              const chosen = start === s.hour
              const blocked = !free || pending
              return (
                <li key={s.hour}>
                  <button
                    type="button"
                    aria-disabled={blocked ? 'true' : undefined}
                    aria-pressed={chosen}
                    onClick={() => {
                      if (!blocked) chooseStart(s.hour)
                    }}
                    className={`flex min-h-12 w-full flex-col items-center justify-center rounded-lg border-2 px-2 py-1 text-base ${FOCUS} ${
                      chosen
                        ? 'border-primary bg-primary text-primary-fg'
                        : free
                          ? 'border-border-strong bg-surface text-foreground hover:bg-subtle'
                          : 'border-dashed border-border bg-subtle text-foreground-muted'
                    }`}
                  >
                    <span className="font-semibold">{timeLabel(s.hour)}</span>
                    {!free ? <span>{SLOT_WORDS[s.state]}</span> : chosen ? <span>Chosen</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {errors.startHour ? (
            <p className="text-base text-danger" role="alert">
              {errors.startHour}
            </p>
          ) : null}

          {start !== null ? (
            <div className="space-y-2">
              <h3 ref={lengthRef} tabIndex={-1} className="text-lg font-semibold text-foreground focus:outline-none">
                How long?
              </h3>
              <div className="flex flex-wrap gap-2">
                {ends.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    size="lg"
                    variant={end === h ? 'default' : 'secondary'}
                    aria-pressed={end === h}
                    disabled={pending}
                    onClick={() => {
                      setEnd(h)
                      setErrors({})
                    }}
                  >
                    {hoursWord(h - start)}
                  </Button>
                ))}
              </div>
              {errors.endHour ? (
                <p className="text-base text-danger" role="alert">
                  {errors.endHour}
                </p>
              ) : null}
            </div>
          ) : null}
          {errors.form ? (
            <p className="text-base text-danger" role="alert">
              {errors.form}
            </p>
          ) : null}
          <Button type="button" size="lg" onClick={toReview} disabled={pending}>
            Next: check my booking
          </Button>
        </section>
      ) : null}

      {step === 'review' && space && amenity && day && start !== null && end !== null ? (
        <section aria-labelledby="step-review" className="space-y-4">
          <h2 ref={headingRef} tabIndex={-1} id="step-review" className={h2}>
            Check your booking
          </h2>
          <p className="text-lg font-semibold text-foreground">{reviewSentence(amenity.name, day, start, end)}</p>
          <p className="text-base text-foreground">{approvalLine(amenity.requiresApproval)}</p>
          {space.homes.length > 1 ? (
            <p className="text-base text-foreground-secondary">For {space.homes.find((h) => h.id === unitId)?.label ?? 'your home'}.</p>
          ) : null}
          {amenity.capacity ? (
            <Field label={`How many people? (up to ${amenity.capacity})`} optional error={errors.partySize}>
              <Input value={people} onChange={(e) => setPeople(e.currentTarget.value)} inputMode="numeric" disabled={pending} autoComplete="off" />
            </Field>
          ) : null}
          <Field label="What is it for?" optional error={errors.purpose}>
            <Input value={purpose} onChange={(e) => setPurpose(e.currentTarget.value)} disabled={pending} autoComplete="off" />
          </Field>
          {mustRead ? (
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">House rules</p>
              <p className="whitespace-pre-line text-base text-foreground-secondary">{amenity.rules}</p>
              <Checkbox label="I read the house rules" checked={read} onChange={(e) => setRead(e.currentTarget.checked)} disabled={pending} />
              {errors.rules ? (
                <p className="text-base text-danger" role="alert">
                  {errors.rules}
                </p>
              ) : null}
            </div>
          ) : null}
          {errors.form ? (
            <p className="text-base text-danger" role="alert">
              {errors.form}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
            Book it
          </Button>
        </section>
      ) : null}
    </form>
  )
}

function MonthPicker({
  space,
  month,
  goToMonth,
  byDay,
  allDays,
  selected,
  onPick,
  blocked,
  loading,
}: {
  space: BookableAmenity
  month: string
  goToMonth: (m: string) => void
  byDay: Map<string, DayView>
  allDays: DayView[]
  selected: string | null
  onPick: (day: string) => void
  blocked: boolean
  loading: boolean
}) {
  const first = space.today.slice(0, 7)
  const last = space.lastDay.slice(0, 7)
  const weeks = monthWeeks(month, space.timeZone)
  const lastLoaded = allDays[allDays.length - 1]?.day ?? ''
  const complete = lastLoaded >= space.lastDay
  const open = allDays.filter((d) => d.status === 'open')
  const monthHasOpen = open.some((d) => d.day.startsWith(month))
  const laterOpen = open.find((d) => d.day.slice(0, 7) > month)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="lg" variant="secondary" disabled={month <= first || loading} onClick={() => goToMonth(prevMonth(month))}>
          Earlier month
        </Button>
        <p className="text-center text-lg font-semibold text-foreground" aria-live="polite">
          {monthTitle(month)}
        </p>
        <Button type="button" size="lg" variant="secondary" disabled={month >= last || loading} onClick={() => goToMonth(nextMonth(month))}>
          Later month
        </Button>
      </div>
      {loading ? (
        <p className="text-base text-foreground-secondary" role="status">
          Loading free times...
        </p>
      ) : null}
      {complete && open.length === 0 ? (
        <p className="text-base font-semibold text-foreground" role="status">
          There are no free times for {space.amenity.name} right now. Ask the board.
        </p>
      ) : null}
      {!monthHasOpen && laterOpen ? (
        <Button type="button" size="lg" variant="secondary" onClick={() => goToMonth(laterOpen.day.slice(0, 7))}>
          Next day with free times
        </Button>
      ) : null}
      <div aria-hidden="true" className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_HEADS.map((w) => (
          <div key={w.long} className="py-1 text-center text-base font-semibold text-foreground-secondary">
            {w.short}
          </div>
        ))}
      </div>
      <div className="space-y-0.5">
        {weeks.map((row) => (
          <ul key={row[0].day} className="grid grid-cols-7 gap-0.5">
            {row.map((c) => {
              if (!c.inMonth) return <li key={c.day} aria-hidden="true" />
              const v = byDay.get(c.day)
              const usable = v?.status === 'open'
              const isToday = c.day === space.today
              const chosen = selected === c.day
              const off = !usable || blocked
              return (
                <li key={c.day} className="min-w-0">
                  <button
                    type="button"
                    aria-disabled={off ? 'true' : undefined}
                    aria-label={dayAria(c.day, v, space.today)}
                    aria-pressed={chosen}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => {
                      if (!off) onPick(c.day)
                    }}
                    className={`flex min-h-12 w-full min-w-11 items-center justify-center rounded-lg border-2 text-base ${FOCUS} ${
                      chosen
                        ? 'border-primary bg-primary font-bold text-primary-fg'
                        : usable && !blocked
                          ? 'border-border-strong bg-surface font-semibold text-foreground hover:bg-subtle'
                          : 'border-dashed border-border bg-subtle text-foreground-muted line-through'
                    } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    {Number(c.day.slice(8))}
                  </button>
                </li>
              )
            })}
          </ul>
        ))}
      </div>
      <p className="text-base text-foreground-secondary">
        Days with a solid border have free times. Crossed out days are full, closed or not open yet. Today has a ring around it.
      </p>
    </div>
  )
}
