import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { DEFAULT_ASSOCIATION_TIME_ZONE, calendarDaysBetween, todayIn } from '@/lib/association-time'
import type {
  PacketBuildResult,
  ReminderCharge,
  ReminderPacket,
  ReminderProperty,
  SkippedOwner,
} from './types'

/** Both reads below page to the end with `readAll` (BL-047). They used
 *  to ask for `.limit(5000)`, but PostgREST's server-side max_rows (1000)
 *  applies underneath whatever the client asks for, so an association
 *  with more than 1000 open charges silently lost owners and understated
 *  what they owed. A failed page throws (WhoOwesPanel's error path). */

/** Whole calendar days between two 'YYYY-MM-DD' dates (zone-free). */
export function daysBetween(fromIso: string, toIso: string): number {
  return calendarDaysBetween(fromIso, toIso)
}

export function unitLabel(u: {
  address_line1: string | null
  unit_number: string | null
}): string {
  const address = u.address_line1 ?? 'Your property'
  return u.unit_number ? `${address} · Unit ${u.unit_number}` : address
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function toProperty(
  unitId: string,
  label: string,
  charges: ReminderCharge[],
): ReminderProperty {
  return {
    unitId,
    label,
    charges,
    subtotal: round(charges.reduce((s, c) => s + c.balance, 0)),
  }
}

interface AssessmentRow {
  id: string
  unit_id: string
  amount: number
  due_date: string
  assessment_type: string
  payments: { amount: number }[] | null
  unit: { id: string; address_line1: string | null; unit_number: string | null } | null
}

interface OwnershipRow {
  unit_id: string
  owner_name: string | null
  owner_email: string | null
  owner_user_id: string | null
}

/**
 * Everything a set of reminder emails needs, grouped by person.
 *
 * Two deliberate departures from resolveAudience(), which resolves the
 * same tables for the general communications composer:
 *
 *   1. Every ownership row is kept, not one per unit — co-owners are
 *      jointly liable and each gets the full picture.
 *   2. Recipients are keyed by email, not unit — someone who owns three
 *      properties gets one email covering all three.
 */
export async function buildReminderPackets(
  associationId: string,
  /** The association's zone: "past due" is judged against ITS today (BL-043). */
  timeZone: string = DEFAULT_ASSOCIATION_TIME_ZONE,
): Promise<PacketBuildResult> {
  const supabase = await getSupabaseServerClient()

  // supabase-js RESOLVES on a query error rather than rejecting, so an
  // unread `error` turns an RLS change or a dropped column into `data:
  // null` — which reads downstream as "nobody owes anything", the exact
  // shape of the healthy empty case. readAll throws on any failed page so
  // the caller's error path (WhoOwesPanel's allSettled branch) runs.
  const assessments = await readAll<AssessmentRow>(
    (from, to) =>
      supabase
        .from('assessments')
        .select(
          'id, unit_id, amount, due_date, assessment_type, payments(amount), unit:unit_id(id, address_line1, unit_number)',
        )
        .eq('association_id', associationId)
        .in('status', ['open', 'partial'])
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: AssessmentRow[] | null; error: { message?: string } | null }>,
    (e) => new Error(`Failed to load assessments: ${e.message ?? ''}`),
  )
  const today = todayIn(timeZone)

  // Charges with a real remaining balance, bucketed by unit.
  const chargesByUnit = new Map<string, ReminderCharge[]>()
  const unitLabels = new Map<string, string>()

  for (const a of assessments) {
    const paid = (a.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const balance = round(Number(a.amount) - paid)
    if (balance <= 0) continue

    const pastDue = a.due_date < today
    const charge: ReminderCharge = {
      id: a.id,
      assessmentType: a.assessment_type,
      dueDate: a.due_date,
      amount: round(Number(a.amount)),
      paid: round(paid),
      balance,
      pastDue,
      daysLate: pastDue ? daysBetween(a.due_date, today) : 0,
    }

    if (!chargesByUnit.has(a.unit_id)) chargesByUnit.set(a.unit_id, [])
    chargesByUnit.get(a.unit_id)!.push(charge)
    if (a.unit) unitLabels.set(a.unit_id, unitLabel(a.unit))
  }

  const unitIds = [...chargesByUnit.keys()]
  if (unitIds.length === 0) return { packets: [], skipped: [] }

  // Past-due first (oldest first), then upcoming by due date.
  for (const charges of chargesByUnit.values()) {
    charges.sort((x, y) => {
      if (x.pastDue !== y.pastDue) return x.pastDue ? -1 : 1
      return x.dueDate.localeCompare(y.dueDate)
    })
  }

  // Same reasoning as the assessments read above: swallowing this error
  // would mail nobody and report it as "all caught up". The unit list is
  // chunked so a large association never builds one oversized `.in()` URL.
  const ownerships: OwnershipRow[] = []
  for (const ids of chunk(unitIds)) {
    const rows = await readAll<OwnershipRow>(
      (from, to) =>
        supabase
          .from('ownerships')
          .select('id, unit_id, owner_name, owner_email, owner_user_id')
          .in('unit_id', ids)
          .is('valid_to', null)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: OwnershipRow[] | null; error: { message?: string } | null }>,
      (e) => new Error(`Failed to load ownerships: ${e.message ?? ''}`),
    )
    ownerships.push(...rows)
  }

  const byEmail = new Map<string, ReminderPacket>()
  const skipped: SkippedOwner[] = []

  for (const o of ownerships) {
    const charges = chargesByUnit.get(o.unit_id)
    if (!charges || charges.length === 0) continue

    const label = unitLabels.get(o.unit_id) ?? 'Your property'
    const email = o.owner_email?.trim().toLowerCase()
    if (!email) {
      skipped.push({ ownerName: o.owner_name ?? 'Owner', unitLabel: label })
      continue
    }

    const existing = byEmail.get(email)
    if (existing) {
      // Prefer a real name over the "Owner" placeholder. Done before the
      // duplicate check below so a second row for a unit we already have
      // can still contribute the details the first row was missing.
      if (existing.ownerName === 'Owner' && o.owner_name) existing.ownerName = o.owner_name
      if (!existing.userId && o.owner_user_id) existing.userId = o.owner_user_id

      // `ownerships` has no unique constraint on active rows — a re-run
      // csv_import, or two rows whose emails differ only by case and get
      // merged by the lowercasing above, can hand us the same unit twice
      // for the same person. Adding it again would double their totalDue
      // and flip on the multi-property layout, printing the identical
      // property block twice.
      if (existing.properties.some((p) => p.unitId === o.unit_id)) continue

      existing.properties.push(toProperty(o.unit_id, label, charges))
    } else {
      byEmail.set(email, {
        email,
        ownerName: o.owner_name ?? 'Owner',
        userId: o.owner_user_id,
        properties: [toProperty(o.unit_id, label, charges)],
        totalDue: 0,
        pastDueTotal: 0,
        oldestDaysLate: 0,
        chargeCount: 0,
      })
    }
  }

  const packets = [...byEmail.values()]
  for (const p of packets) {
    let total = 0
    let pastDue = 0
    let oldest = 0
    let count = 0
    for (const prop of p.properties) {
      for (const c of prop.charges) {
        total += c.balance
        count += 1
        if (c.pastDue) {
          pastDue += c.balance
          if (c.daysLate > oldest) oldest = c.daysLate
        }
      }
    }
    p.totalDue = round(total)
    p.pastDueTotal = round(pastDue)
    p.oldestDaysLate = oldest
    p.chargeCount = count

    // Properties carrying arrears lead; then the largest balance.
    p.properties.sort((x, y) => {
      const xLate = x.charges.some((c) => c.pastDue)
      const yLate = y.charges.some((c) => c.pastDue)
      if (xLate !== yLate) return xLate ? -1 : 1
      return y.subtotal - x.subtotal
    })
  }

  packets.sort((x, y) => y.pastDueTotal - x.pastDueTotal || y.totalDue - x.totalDue)

  return { packets, skipped }
}
