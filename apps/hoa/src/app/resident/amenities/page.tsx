import { CalendarDays } from 'lucide-react'
import { Badge, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { DEFAULT_ASSOCIATION_TIME_ZONE, addCalendarDays, dayOf, hourIn, todayIn } from '@/lib/association-time'
import {
  DISPLAY_LABELS,
  canCancel,
  countsAgainstHome,
  dayLabel,
  dayStrip,
  displayStatus,
  formatSlot,
  residentMustAskBoard,
  rulesSummary,
  scopeToOwnership,
  type Reservation,
} from '@/lib/amenities/model'
import { loadAmenities, loadHeldSlots, loadHomeReservations, type LooseDb } from '@/lib/amenities/queries'
import { Panel, ScreenEmpty, ScreenHeader, Section } from '@/components/resident/screen'
import { ResidentCancel } from './ResidentCancel'
import { BookingForm, type BookableAmenity } from './BookingForm'
import { cancelLine, shortHour } from '@/lib/amenities/booking-copy'

export const metadata = { title: 'Book a space' }
export const dynamic = 'force-dynamic'

/** Days shown on first load; later months are fetched when the resident pages forward. */
const FIRST_DAYS = 62

const SUBTITLE = 'Pick a space, a day and a time. Times that are taken are marked.'

/**
 * BL-034: a resident books an amenity for their home. Amenities and the
 * taken times are read with the service role, confined to the signed-in
 * member's current org and to the amenities of their own association; the
 * taken times carry no names. Flag off: says so and reads nothing.
 */
export default async function ResidentAmenitiesPage() {
  const [org, actor] = await Promise.all([getCurrentOrg(), getResidentActor()])
  if (!org) return <NoOrgSelected href="/resident" />
  if (actor.impersonating && actor.orgId !== org.id) return <NoOrgSelected href="/resident" />
  const header = <ScreenHeader title="Book a space" subtitle={SUBTITLE} />

  if (!M11_APPLIED) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<CalendarDays />}
          title="Not available yet"
          description="Booking spaces is not turned on for your community yet. Ask the board if you need the clubhouse."
        />
      </div>
    )
  }

  const units = await getResidentUnits()
  if (units.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<CalendarDays />}
          title="No home on your account yet"
          description="We could not find a home linked to your account, so you cannot book yet. Ask the board to add you to your home."
        />
      </div>
    )
  }
  const db = createAdminClient() as unknown as LooseDb
  const now = new Date()
  const [allAmenities, allMine] = await Promise.all([
    loadAmenities(db, org.id, { activeOnly: true }),
    loadHomeReservations(
      db,
      org.id,
      units.map((u) => u.unit_id),
      new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    ),
  ])
  if (allAmenities === null || allMine === null) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="the spaces you can book" retryHref="/resident/amenities" />
      </div>
    )
  }

  const mine = scopeToOwnership(allMine, units)
  const associationIds = new Set(units.map((u) => u.association_id))
  const amenities = allAmenities.filter((a) => associationIds.has(a.associationId) && !a.retiredAt)
  const held = await loadHeldSlots(db, org.id, amenities.map((a) => a.id), now.toISOString(), M11_APPLIED, new Date(now.getTime() + (FIRST_DAYS + 2) * 86_400_000).toISOString())
  if (held === null) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="the spaces you can book" retryHref="/resident/amenities" />
      </div>
    )
  }

  if (amenities.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<CalendarDays />}
          title="Nothing to book yet"
          description="Your board has not set up any spaces for booking. Ask them if you need one."
        />
      </div>
    )
  }

  const zoneFor = (associationId: string | null) =>
    units.find((u) => u.association_id === associationId)?.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const names = new Map(allAmenities.map((a) => [a.id, a.name]))
  const cutoffs = new Map(allAmenities.map((a) => [a.id, a.cancelCutoffHours]))
  const homeLabel = (u: (typeof units)[number]) => [u.address, u.unit_number ? `Unit ${u.unit_number}` : null].filter(Boolean).join(', ') || 'Your home'
  const bookingLabel = (r: Reservation) => {
    const zone = zoneFor(units.find((u) => u.unit_id === r.unitId)?.association_id ?? null)
    const day = dayOf(r.startsAt, zone)
    return `${names.get(r.amenityId) ?? 'Space'}, ${day ? dayLabel(day) : ''}, ${shortHour(hourIn(zone, new Date(r.startsAt)))}`
  }
  const spaces: BookableAmenity[] = amenities.map((a) => {
    const zone = zoneFor(a.associationId)
    return {
      amenity: a,
      homes: units.filter((u) => u.association_id === a.associationId).map((u) => ({ id: u.unit_id, label: homeLabel(u) })),
      days: dayStrip({ amenity: a, timeZone: zone, now, held: held.get(a.id) ?? [], count: Math.min(a.advanceDays + 1, FIRST_DAYS) }),
      today: todayIn(zone, now),
      lastDay: addCalendarDays(todayIn(zone, now), a.advanceDays),
      timeZone: zone,
      activeByHome: Object.fromEntries(
        units
          .filter((u) => u.association_id === a.associationId)
          .map((u) => [u.unit_id, mine.filter((r) => r.unitId === u.unit_id && r.amenityId === a.id && countsAgainstHome(r, now)).length]),
      ),
    }
  })

  return (
    <div className="space-y-8">
      {header}

      <div className="sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:p-4">
        <BookingForm spaces={spaces} />
      </div>

      {mine.length > 0 ? (
        <Section label="Your bookings">
          <Panel className="space-y-4">
            {mine.map((r: Reservation) => (
              <div key={r.id} className="space-y-1 border-b border-border pb-4 last:border-0 last:pb-0">
                <p className="text-base font-semibold text-foreground">
                  {names.get(r.amenityId) ?? 'Space'}: {formatSlot(r.startsAt, r.endsAt, zoneFor(units.find((u) => u.unit_id === r.unitId)?.association_id ?? null))}
                </p>
                <Badge variant={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'} size="md">
                  {DISPLAY_LABELS[displayStatus(r, now)]}
                </Badge>
                {r.decisionNote ? <p className="text-base text-foreground-secondary">Board note: {r.decisionNote}</p> : null}
                {r.cancelReason ? <p className="text-base text-foreground-secondary">Reason: {r.cancelReason}</p> : null}
                {canCancel(r, now) ? (
                  residentMustAskBoard(r, cutoffs.get(r.amenityId) ?? 0, now) ? (
                    <p className="text-base text-foreground-secondary">This starts soon, so you cannot cancel it here. Please ask the board.</p>
                  ) : (
                    <div className="space-y-1">
                      <ResidentCancel reservationId={r.id} label={bookingLabel(r)} />
                      <p className="text-base text-foreground-secondary">{cancelLine(cutoffs.get(r.amenityId) ?? 0)}</p>
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </Panel>
        </Section>
      ) : null}
    </div>
  )
}
