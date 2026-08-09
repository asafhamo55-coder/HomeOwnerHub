// Shapes shared between the packet builder (which does I/O) and the
// renderer (which must stay pure). Keeping them here lets render.test.ts
// build fixtures without importing anything that touches Supabase.

export interface ReminderCharge {
  id: string
  assessmentType: string // regular | special | late_fee | fine
  dueDate: string        // 'YYYY-MM-DD'
  amount: number         // the original assessment amount
  paid: number           // sum of payments applied
  balance: number        // amount - paid, floored at 0
  pastDue: boolean
  daysLate: number       // 0 when not past due
}

export interface ReminderProperty {
  unitId: string
  label: string          // "14 Oak St" / "22 Oak St · Unit B"
  charges: ReminderCharge[]
  subtotal: number
}

export interface ReminderPacket {
  email: string          // the recipient key — normalized lowercase
  ownerName: string
  userId: string | null
  properties: ReminderProperty[]
  totalDue: number
  pastDueTotal: number
  oldestDaysLate: number
  chargeCount: number
}

export interface SkippedOwner {
  ownerName: string
  unitLabel: string
}

export interface PacketBuildResult {
  packets: ReminderPacket[]
  skipped: SkippedOwner[]
}
