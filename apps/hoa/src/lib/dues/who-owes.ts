import { agingForCharges, type AgingBucket } from '@/lib/dues/aging'
import type { ReminderPacket } from '@/lib/dues-reminders/types'

export interface AgedOwner {
  packet: ReminderPacket
  bucket: AgingBucket
}

/**
 * Each owner sits in the bucket of their oldest unpaid charge across all
 * their properties. The one place this is decided: the Who owes panel and
 * its CSV export both call it, so the file can never differ from the screen.
 */
export function ageOwners(packets: readonly ReminderPacket[], today: string): AgedOwner[] {
  return packets.map((packet) => ({
    packet,
    bucket:
      agingForCharges(
        packet.properties.flatMap((prop) => prop.charges.map((c) => ({ dueDate: c.dueDate, balance: c.balance }))),
        today,
      )?.bucket ?? 'current',
  }))
}

/** The owners the panel shows for an `?aging=` filter (null = everyone). */
export function ownersForAging(aged: readonly AgedOwner[], aging: AgingBucket | null): AgedOwner[] {
  return aging ? aged.filter((a) => a.bucket === aging) : [...aged]
}

/** Oldest still-unpaid due date ('YYYY-MM-DD') across an owner's charges, or ''. */
export function oldestUnpaidDue(packet: ReminderPacket): string {
  let oldest = ''
  for (const prop of packet.properties) {
    for (const c of prop.charges) {
      if (!(c.balance > 0)) continue
      if (oldest === '' || c.dueDate < oldest) oldest = c.dueDate
    }
  }
  return oldest
}
