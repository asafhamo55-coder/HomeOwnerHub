'use server'

// Later months of the booking calendar, fetched when the resident pages
// forward. Read only. Availability is computed here from the model functions;
// the caller supplies nothing but an amenity id and a window.

import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { DEFAULT_ASSOCIATION_TIME_ZONE, addCalendarDays, dateOnlyCompare, instantAtLocalTime, todayIn } from '@/lib/association-time'
import { dayStrip, type DayView } from './model'
import { loadAmenities, loadHeldSlots, type LooseDb } from './queries'

/** Most days one call returns. */
const MAX_DAYS_PER_CALL = 62

const Schema = z.object({
  amenityId: z.string().uuid(),
  fromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(1).max(MAX_DAYS_PER_CALL),
})

export type BookingDaysResult = { ok: true; days: DayView[] } | { ok: false; error: string }

export async function loadBookingDays(input: z.input<typeof Schema>): Promise<BookingDaysResult> {
  const failed = { ok: false, error: 'We could not load more days. Please try again.' } as const
  if (!M11_APPLIED) return failed
  const actor = await getResidentActor()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return failed
  const v = parsed.data
  const org = await getCurrentOrg()
  if (!org) return failed
  if (actor.impersonating && actor.orgId !== org.id) return failed

  const units = await getResidentUnits()
  const db = createAdminClient() as unknown as LooseDb
  const all = await loadAmenities(db, org.id, { activeOnly: true })
  const amenity = all?.find((a) => a.id === v.amenityId && !a.retiredAt)
  const unit = amenity ? units.find((u) => u.association_id === amenity.associationId) : undefined
  if (!amenity || !unit) return failed

  const timeZone = unit.association_time_zone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const now = new Date()
  const today = todayIn(timeZone, now)
  const last = addCalendarDays(today, amenity.advanceDays)
  const from = dateOnlyCompare(v.fromDay, today) < 0 ? today : v.fromDay
  if (dateOnlyCompare(from, last) > 0) return { ok: true, days: [] }
  const count = Math.min(v.count, MAX_DAYS_PER_CALL)
  const toIso = instantAtLocalTime(addCalendarDays(from, count), 0, timeZone).toISOString()
  const fromIso = instantAtLocalTime(from, 0, timeZone).toISOString()
  const held = await loadHeldSlots(db, org.id, [amenity.id], fromIso, M11_APPLIED, toIso)
  if (held === null) return failed
  return { ok: true, days: dayStrip({ amenity, timeZone, now, held: held.get(amenity.id) ?? [], count, startDay: from }) }
}
