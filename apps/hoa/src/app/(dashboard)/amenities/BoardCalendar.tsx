import Link from 'next/link'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { dayOf } from '@/lib/association-time'
import { dayLabel, formatSlot, monthGrid, type Amenity } from '@/lib/amenities/model'
import type { BoardReservation } from '@/lib/amenities/queries'
import { CancelButton, DecideButtons } from './ReservationButtons'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * One month for one amenity: every day says how many bookings it has and how
 * many are waiting, in words as well as colour. Tap a day to list its
 * bookings with the board's actions. Server-rendered; the links are plain
 * (no script needed), and on a phone the day list below is the reading order.
 */
export function BoardCalendar({
  amenities,
  amenity,
  month,
  selectedDay,
  reservations,
  timeZone,
}: {
  amenities: Amenity[]
  amenity: Amenity
  month: string
  selectedDay: string | null
  reservations: BoardReservation[]
  timeZone: string
}) {
  const weeks = monthGrid({ month, timeZone, reservations, amenity })
  const [y, m] = month.split('-').map(Number)
  const href = (over: { amenity?: string; month?: string; day?: string | null }) => {
    const q = new URLSearchParams({ amenity: over.amenity ?? amenity.id, month: over.month ?? month })
    if (over.day) q.set('day', over.day)
    return `/amenities?${q.toString()}`
  }
  const dayRows = selectedDay
    ? reservations.filter((r) => dayOf(r.startsAt, timeZone) === selectedDay)
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {amenities.length > 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Choose a space">
            {amenities.map((a) => (
              <Link
                key={a.id}
                href={href({ amenity: a.id, day: null })}
                className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-base ${a.id === amenity.id ? 'border-primary bg-primary-subtle font-semibold text-foreground' : 'border-border text-foreground-secondary'}`}
                aria-current={a.id === amenity.id ? 'page' : undefined}
              >
                {a.name}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Link href={href({ month: shiftMonth(month, -1), day: null })} className="inline-flex min-h-11 items-center px-3 text-base text-primary">
            Earlier
          </Link>
          <p className="text-lg font-semibold text-foreground">
            {MONTH_NAMES[m - 1]} {y}
          </p>
          <Link href={href({ month: shiftMonth(month, 1), day: null })} className="inline-flex min-h-11 items-center px-3 text-base text-primary">
            Later
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-sm text-foreground-secondary" aria-hidden>
          {WEEK.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((c) => {
            const label = `${dayLabel(c.day)}: ${c.closed ? 'closed' : c.held === 0 ? 'nothing booked' : `${c.held} booked${c.waiting ? `, ${c.waiting} waiting` : ''}`}`
            const tone = !c.inMonth
              ? 'border-transparent text-muted'
              : c.waiting > 0
                ? 'border-warning/25 bg-warning-subtle text-foreground'
                : c.held > 0
                  ? 'border-success/20 bg-success-subtle text-foreground'
                  : c.closed
                    ? 'border-border bg-surface text-muted'
                    : 'border-border text-foreground'
            return (
              <Link
                key={c.day}
                href={href({ day: c.day })}
                aria-label={label}
                aria-current={c.day === selectedDay ? 'date' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg border text-sm ${tone} ${c.day === selectedDay ? 'ring-2 ring-primary' : ''}`}
              >
                <span className="text-base font-semibold">{Number(c.day.slice(8))}</span>
                {c.inMonth && c.closed ? <span>Closed</span> : null}
                {c.inMonth && c.waiting > 0 ? <span>{c.waiting} waiting</span> : null}
                {c.inMonth && c.held > 0 && c.waiting === 0 ? <span>{c.held} booked</span> : null}
              </Link>
            )
          })}
        </div>
        <p className="text-sm text-foreground-secondary">Green: booked. Yellow: waiting for you. Grey: closed. Tap a day to see who booked.</p>

        {selectedDay ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-base font-semibold text-foreground">{dayLabel(selectedDay)}</p>
            {dayRows.length === 0 ? (
              <p className="text-base text-foreground-secondary">Nothing is booked this day.</p>
            ) : (
              dayRows.map((r) => (
                <div key={r.id} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                    {formatSlot(r.startsAt, r.endsAt, timeZone)}
                    <Badge variant={r.kind === 'hold' ? 'neutral' : r.status === 'pending' ? 'warning' : 'success'} size="md">
                      {r.kind === 'hold' ? 'Board hold' : r.status === 'pending' ? 'Waiting' : 'Confirmed'}
                    </Badge>
                  </p>
                  <p className="text-sm text-foreground-secondary">
                    {r.kind === 'hold' ? r.purpose : `For ${r.homeLabel}`}
                    {r.partySize ? `, about ${r.partySize} people` : ''}
                  </p>
                  {r.kind === 'booking' && r.purpose ? <p className="text-sm text-foreground-secondary">Reason given: {r.purpose}</p> : null}
                  {r.status === 'pending' ? <DecideButtons reservationId={r.id} /> : null}
                  <CancelButton reservationId={r.id} asBoard isHold={r.kind === 'hold'} />
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
