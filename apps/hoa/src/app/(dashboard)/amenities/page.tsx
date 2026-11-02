import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { requireBoardOrAdmin } from '@/lib/auth'
import { currentTimeZone } from '@/lib/association-time-current'
import { formatSlot, rulesSummary } from '@/lib/amenities/model'
import { loadAmenities, loadBoardReservations, type LooseDb } from '@/lib/amenities/queries'
import { AmenityDialog } from './AmenityDialog'
import { CancelButton, DecideButtons } from './ReservationButtons'

export const metadata = { title: 'Amenities' }
export const dynamic = 'force-dynamic'

// BL-034: the board sets up the clubhouse, pool or courts and answers booking
// requests. Board or admin only (requireBoardOrAdmin redirects residents
// before any read). With M11_APPLIED off the page says so and reads nothing.

const DESCRIPTION =
  'Set up the places residents can book, with your rules. Residents pick a day and hours, and two bookings can never overlap.'

export default async function AmenitiesPage() {
  const { org } = await requireBoardOrAdmin()

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
  const [amenities, reservations] = await Promise.all([
    loadAmenities(db, org.id),
    loadBoardReservations(db, org.id, new Date().toISOString()),
  ])
  if (amenities === null || reservations === null) {
    return (
      <Page title="Amenities" description={DESCRIPTION} linkAs={Link}>
        <LoadFailed what="your amenities" retryHref="/amenities" />
      </Page>
    )
  }

  const names = new Map(amenities.map((a) => [a.id, a.name]))
  const waiting = reservations.filter((r) => r.status === 'pending')
  const confirmed = reservations.filter((r) => r.status === 'approved')

  return (
    <Page title="Amenities" description={DESCRIPTION} linkAs={Link} actions={<AmenityDialog amenity={null} />}>
      <div className="space-y-6">
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
                  <p className="text-sm text-foreground-secondary">For {r.homeLabel}</p>
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
                    <p className="text-sm text-foreground-secondary">For {r.homeLabel}</p>
                  </div>
                  <CancelButton reservationId={r.id} />
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
                  <AmenityDialog amenity={a} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
