import Link from 'next/link'
import { CalendarDays, Pencil, Plus } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { requireBoardOrAdmin } from '@/lib/auth'
import { currentTimeZone } from '@/lib/association-time-current'
import { formatSlot, isRealDay, rulesSummary } from '@/lib/amenities/model'
import { loadAmenities, loadAmenityReservations, loadBoardReservations, type LooseDb } from '@/lib/amenities/queries'
import { addCalendarDays, todayIn } from '@/lib/association-time'
import { BoardCalendar } from './BoardCalendar'
import { CancelButton, DecideButtons, HoldDialog, RetireButton } from './ReservationButtons'

export const metadata = { title: 'Amenities' }
export const dynamic = 'force-dynamic'

// BL-034: the board sets up the clubhouse, pool or courts and answers booking
// requests. Board or admin only (requireBoardOrAdmin redirects residents
// before any read). With M11_APPLIED off the page says so and reads nothing.

const DESCRIPTION =
  'Set up the places residents can book, with your rules. Residents pick a day and hours, and two bookings can never overlap.'

export default async function AmenitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ amenity?: string; month?: string; day?: string }>
}) {
  const { org } = await requireBoardOrAdmin()
  const params = await searchParams

  if (!M11_APPLIED) {
    return (
      <Page title="Amenities" description={DESCRIPTION} linkAs={Link}>
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title="Amenity booking is almost ready"
          description="It turns on after a database update. Until then, residents can ask for the clubhouse by sending you a message."
        />
      </Page>
    )
  }

  const db = createAdminClient() as unknown as LooseDb
  const timeZone = await currentTimeZone()
  const now = new Date()
  const [allAmenities, reservations] = await Promise.all([
    loadAmenities(db, org.id),
    loadBoardReservations(db, org.id, now.toISOString()),
  ])
  if (allAmenities === null || reservations === null) {
    return (
      <Page title="Amenities" description={DESCRIPTION} linkAs={Link}>
        <LoadFailed what="your amenities" retryHref="/amenities" />
      </Page>
    )
  }

  const amenities = allAmenities.filter((a) => !a.retiredAt)
  const retired = allAmenities.filter((a) => a.retiredAt)
  const names = new Map(allAmenities.map((a) => [a.id, a.name]))
  const upcomingBy = new Map<string, number>()
  for (const r of reservations) upcomingBy.set(r.amenityId, (upcomingBy.get(r.amenityId) ?? 0) + 1)

  // Month calendar for one amenity at a time (?amenity=&month=&day=).
  const calAmenity = amenities.find((a) => a.id === params.amenity) ?? amenities[0] ?? null
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') && isRealDay(`${params.month}-01`) ? (params.month as string) : todayIn(timeZone, now).slice(0, 7)
  const selectedDay = params.day && isRealDay(params.day) ? params.day : null
  const monthStart = `${month}-01`
  const monthReservations = calAmenity
    ? await loadAmenityReservations(
        db,
        org.id,
        calAmenity.id,
        addCalendarDays(monthStart, -1),
        addCalendarDays(addCalendarDays(monthStart, 31), 7),
      )
    : []
  if (monthReservations === null) {
    return (
      <Page title="Amenities" description={DESCRIPTION} linkAs={Link}>
        <LoadFailed what="your amenities" retryHref="/amenities" />
      </Page>
    )
  }
  const waiting = reservations.filter((r) => r.status === 'pending')
  const confirmed = reservations.filter((r) => r.status === 'approved')

  return (
    <Page title="Amenities" description={DESCRIPTION} linkAs={Link} actions={
        <div className="flex flex-wrap gap-2">
          <HoldDialog amenities={amenities.map((a) => ({ id: a.id, name: a.name }))} />
          <Button asChild>
            <Link href="/amenities/new">
              <Plus aria-hidden />
              Add an amenity
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {calAmenity ? (
          <BoardCalendar
            amenities={amenities}
            amenity={calAmenity}
            month={month}
            selectedDay={selectedDay}
            reservations={monthReservations}
            timeZone={timeZone}
          />
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Waiting for your answer ({waiting.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {waiting.length === 0 ? (
              <p className="text-base text-foreground-secondary">Nothing is waiting. New requests show up here.</p>
            ) : (
              waiting.map((r) => (
                <div key={r.id} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
                  <p className="text-base font-semibold text-foreground">
                    {names.get(r.amenityId) ?? 'Amenity'}: {formatSlot(r.startsAt, r.endsAt, timeZone)}
                  </p>
                  <p className="text-sm text-foreground-secondary">For {r.homeLabel}{r.partySize ? `, about ${r.partySize} people` : ''}</p>
                  {r.purpose ? <p className="text-sm text-foreground-secondary">Reason given: {r.purpose}</p> : null}
                  <DecideButtons reservationId={r.id} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming up ({confirmed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {confirmed.length === 0 ? (
              <p className="text-base text-foreground-secondary">No confirmed bookings yet.</p>
            ) : (
              confirmed.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {names.get(r.amenityId) ?? 'Amenity'}: {formatSlot(r.startsAt, r.endsAt, timeZone)}
                    </p>
                    <p className="text-sm text-foreground-secondary">
                      {r.kind === 'hold' ? `Board hold: ${r.purpose ?? ''}` : `For ${r.homeLabel}`}
                    </p>
                  </div>
                  <CancelButton reservationId={r.id} asBoard isHold={r.kind === 'hold'} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your amenities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {amenities.length === 0 ? (
              <p className="text-base text-foreground-secondary">
                You have not added any yet. Use “Add an amenity” to set up the clubhouse, pool or courts.
              </p>
            ) : (
              amenities.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                      {a.name}
                      {a.isActive ? null : <Badge variant="neutral" size="md">Closed for booking</Badge>}
                      <Badge variant="info" size="md">{a.requiresApproval ? 'Board approves' : 'Booked right away'}</Badge>
                    </p>
                    <p className="text-sm text-foreground-secondary">{rulesSummary(a)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/amenities/${a.id}/edit`} aria-label={`Edit ${a.name}`}>
                        <Pencil aria-hidden />
                        Edit
                      </Link>
                    </Button>
                    <RetireButton amenityId={a.id} name={a.name} upcoming={upcomingBy.get(a.id) ?? 0} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {retired.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Retired ({retired.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {retired.map((a) => (
                <p key={a.id} className="text-base text-foreground-secondary">
                  {a.name}: not offered to residents. Its history is kept.
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  )
}
