// Presentation for the left pane's severity signal. Pure and free of React
// and Supabase imports so it runs under vitest's node-only harness.
//
// The rank itself is computed in SQL (hoa_property_list_v, migration 0039)
// so ordering can be a plain indexed column sort. This module only decides
// how a rank *reads*.

import type { PropertyFilter } from './list-params'

export type SeverityTone = 'red' | 'amber' | 'slate' | 'clear'

/**
 * Empty-state copy for the list pane, per filter.
 *
 * Every filter except 'all' selects a subset, so an empty result means
 * "nothing matched this filter" — not "there are no properties". The list
 * previously fell back to "No properties yet." for everything except
 * 'attention', which told a manager whose records are all complete, or who
 * filtered to Leased in an owner-occupied association, that their
 * association has no homes at all.
 *
 * Exhaustive over PropertyFilter with no `default`, so adding a filter is
 * a type error here rather than a silently wrong message.
 */
export function emptyListMessage(filter: PropertyFilter): string {
  switch (filter) {
    case 'attention':
      return 'Nothing needs attention right now.'
    case 'incomplete':
      return 'Every property record is complete.'
    case 'owner_occupied':
      return 'No owner-occupied properties.'
    case 'leased':
      return 'No leased properties.'
    case 'unknown':
      return 'Every property has its tenure recorded.'
    case 'all':
      return 'No properties yet.'
  }
}

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

/**
 * The street part of an address, for list rows.
 *
 * Every property in one association shares a city/state/ZIP, so printing
 * "105 Springwood Pkwy, Atlanta, GA 30067" on all 135 rows spends the row's
 * width on the identical part and truncates the only part that
 * distinguishes it — observed live as "105 Springwood Pkwy, Atlanta, GA
 * 300…". Callers keep the full address in `title` for hover, and the detail
 * panel still shows it in full.
 *
 * Splits on the FIRST comma only: a US street line does not contain one,
 * and an address with no comma at all is returned untouched.
 */
export function streetOf(address: string): string {
  const comma = address.indexOf(',')
  return (comma === -1 ? address : address.slice(0, comma)).trim()
}

