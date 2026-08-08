// Presentation for the left pane's severity signal. Pure and free of React
// and Supabase imports so it runs under vitest's node-only harness.
//
// The rank itself is computed in SQL (hoa_property_list_v, migration 0039)
// so ordering can be a plain indexed column sort. This module only decides
// how a rank *reads*.

export type SeverityTone = 'red' | 'amber' | 'slate' | 'clear'

export interface SeveritySource {
  balance: number
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  threadsNeedingReply: number
  hasOwner: boolean
  hasTenure: boolean
  hasUnitLink: boolean
}

export interface ReasonPill {
  text: string
  tone: SeverityTone
}

export function severityTone(rank: number): SeverityTone {
  if (rank === 1 || rank === 2) return 'red'
  if (rank === 3 || rank === 4) return 'amber'
  if (rank === 5) return 'slate'
  return 'clear'
}

/**
 * Every dot carries one of these as its tooltip and screen-reader text.
 * Colour alone must never carry the meaning.
 */
export function severityLabel(rank: number): string {
  switch (rank) {
    case 1:
      return 'Violation past its cure date'
    case 2:
      return 'Past due balance'
    case 3:
      return 'Open violation'
    case 4:
      return 'Mail awaiting reply'
    case 5:
      return 'Missing property data'
    default:
      return 'Nothing outstanding'
  }
}

// No `text-success` / `text-warning` utilities exist in the shared Tailwind
// config — only the CSS-variable tokens. Literal emerald/amber with dark:
// pairs is the established convention (inbox/ThreadList.tsx:19-25).
export function severityDotClass(tone: SeverityTone): string {
  switch (tone) {
    case 'red':
      return 'bg-destructive'
    case 'amber':
      return 'bg-amber-500 dark:bg-amber-400'
    case 'slate':
      return 'bg-muted'
    default:
      return 'bg-border'
  }
}

/**
 * Short reasons shown under the address. Balance is deliberately excluded —
 * it renders right-aligned in its own column, and repeating it as a pill
 * makes the row noisier without adding information.
 */
export function reasonPills(row: SeveritySource): ReasonPill[] {
  const pills: ReasonPill[] = []

  if (row.violationsPastCure > 0) {
    pills.push({
      text: `${row.violationsPastCure} past cure date`,
      tone: 'red',
    })
  } else if (row.openViolations > 0) {
    pills.push({
      text: `${row.openViolations} ${row.openViolations === 1 ? 'violation' : 'violations'}`,
      tone: 'amber',
    })
  }

  if (row.threadsNeedingReply > 0) {
    pills.push({ text: `${row.threadsNeedingReply} unread`, tone: 'amber' })
  }

  // One pill however many fields are missing — three pills saying the same
  // thing is noise, and the panel names the specifics.
  if (!row.hasOwner || !row.hasTenure || !row.hasUnitLink) {
    pills.push({ text: 'Missing data', tone: 'slate' })
  }

  return pills
}
