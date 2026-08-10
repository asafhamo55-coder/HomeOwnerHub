import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  PacketBuildResult,
  ReminderCharge,
  ReminderPacket,
  ReminderProperty,
  SkippedOwner,
} from './types'

const MS_PER_DAY = 86_400_000

/** Explicit ceilings so PostgREST's server-side max-rows can never silently
 *  truncate the sweep — a truncated read here understates what somebody
 *  owes, which is worse than an obviously-too-small page of history. The
 *  dues page lists 500 rows because it is a screenful; this is every open
 *  charge in the association, so it is set an order of magnitude higher
 *  than any association we serve could plausibly have outstanding. */
const MAX_ASSESSMENTS = 5000
/** Ownerships are fetched for units that already made the cut above, and
 *  a unit rarely has more than two or three active owners. */
const MAX_OWNERSHIPS = 5000

/** Whole days between two 'YYYY-MM-DD' dates. Both parse as UTC midnight,
 *  so this is timezone-stable — unlike a local-time date difference. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY)
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
): Promise<PacketBuildResult> {
  const supabase = await getSupabaseServerClient()

  const { data: assessmentData, error: assessmentError } = await supabase
    .from('assessments')
    .select(
      'id, unit_id, amount, due_date, assessment_type, payments(amount), unit:unit_id(id, address_line1, unit_number)',
    )
    .eq('association_id', associationId)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)
    .limit(MAX_ASSESSMENTS)

  // supabase-js RESOLVES on a query error rather than rejecting, so an
  // unread `error` turns an RLS change or a dropped column into `data:
  // null` — which reads downstream as "nobody owes anything", the exact
  // shape of the healthy empty case. Throw so the caller's error path
  // (WhoOwesPanel's allSettled branch) actually runs.
  if (assessmentError) {
    throw new Error(`Failed to load assessments: ${assessmentError.message}`)
  }

  const assessments = (assessmentData ?? []) as unknown as AssessmentRow[]
  const today = new Date().toISOString().slice(0, 10)

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

  const { data: ownershipData, error: ownershipError } = await supabase
    .from('ownerships')
    .select('unit_id, owner_name, owner_email, owner_user_id')
    .in('unit_id', unitIds)
    .is('valid_to', null)
    .limit(MAX_OWNERSHIPS)

  // Same reasoning as the assessments read above: swallowing this error
  // would mail nobody and report it as "all caught up".
  if (ownershipError) {
    throw new Error(`Failed to load ownerships: ${ownershipError.message}`)
  }

  const ownerships = (ownershipData ?? []) as unknown as OwnershipRow[]

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
