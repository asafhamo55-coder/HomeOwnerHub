import { isPaperOnly, labelFor, type PaperRule } from '@/lib/properties/roster/labels'
import type { OwnerRosterRow } from '@/lib/properties/statutory-roster/model'
import { finishPacket, propertyFrom, unitLabel } from './packets'
import type { ReminderCharge, ReminderPacket } from './types'

/**
 * Paper dues reminders: one letter per household that cannot be reached by
 * email. Pure (no database, no logging) so a test can pin who gets a letter
 * and what it says. Who counts as paper-only is decided by the mailing-label
 * rule (isPaperOnly): fail-closed and judged home by home. The amounts come
 * from the same charge math as the emailed reminder.
 */

export interface PaperLetter {
  /** Printed address block, top to bottom: addressee, street, "City, ST ZIP". */
  addressLines: string[]
  /** "Pat Lee & Sam Lee" or "Current Resident". */
  addressee: string
  /** The same shape the emailed reminder renders from. email is always ''. */
  packet: ReminderPacket
}

export interface PaperReminderSet {
  letters: PaperLetter[]
  /** Paper-only homes that owe money but have no street address to mail to. */
  noAddress: number
}

const key = (lines: readonly string[]) => lines.map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase()).join('\n')

/**
 * `chargesByProperty` holds each home's open charges (balance above zero).
 * Homes with nothing owed get no letter. Homes at the same mailing address
 * for the same people (an owner of several lots) share one letter, like the
 * emailed reminder, which lists every property in one message.
 */
export function buildPaperReminders(
  rows: readonly OwnerRosterRow[],
  chargesByProperty: ReadonlyMap<string, readonly ReminderCharge[]>,
  rule?: PaperRule,
): PaperReminderSet {
  const byAddress = new Map<string, PaperLetter>()
  let noAddress = 0
  for (const row of rows) {
    const charges = chargesByProperty.get(row.propertyId)
    if (!charges || charges.length === 0) continue
    if (!isPaperOnly(row, rule)) continue
    const label = labelFor(row)
    if (!label) {
      noAddress += 1
      continue
    }
    const property = propertyFrom(row.propertyId, unitLabel({ address_line1: row.address, unit_number: row.unitNumber }), [...charges])
    const k = key(label.lines)
    const existing = byAddress.get(k)
    if (existing) {
      if (!existing.packet.properties.some((p) => p.unitId === row.propertyId)) existing.packet.properties.push(property)
      continue
    }
    const addressee = label.lines[0] ?? 'Current Resident'
    byAddress.set(k, {
      addressLines: label.lines,
      addressee,
      packet: {
        email: '',
        ownerName: addressee,
        userId: null,
        properties: [property],
        totalDue: 0,
        pastDueTotal: 0,
        oldestDaysLate: 0,
        chargeCount: 0,
      },
    })
  }
  const letters = [...byAddress.values()]
  for (const l of letters) finishPacket(l.packet)
  letters.sort((a, b) => b.packet.pastDueTotal - a.packet.pastDueTotal || b.packet.totalDue - a.packet.totalDue)
  return { letters, noAddress }
}
