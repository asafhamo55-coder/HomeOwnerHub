// Presentation for the left pane's severity signal. Pure and free of React
// and Supabase imports so it runs under vitest's node-only harness.
//
// The rank itself is computed in SQL (hoa_property_list_v, migration 0039)
// so ordering can be a plain indexed column sort. This module only decides
// how a rank *reads*.

import type { PropertyFilter } from './list-params'
import { missingFields } from './list-view'

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
    case 'waiting':
      return 'Nobody is waiting to lease.'
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
      return 'Missing owner or tenure'
    default:
      return 'Nothing outstanding'
  }
}

// Design-system v2 status tokens (theme in light and dark on their own).
export function severityDotClass(tone: SeverityTone): string {
  switch (tone) {
    case 'red':
      return 'bg-danger'
    case 'amber':
      return 'bg-warning'
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

  // "Awaiting reply", not "unread": the view counts threads whose status is
  // needs_review or open — a board member may well have read them.
  if (row.threadsNeedingReply > 0) {
    pills.push({ text: `${row.threadsNeedingReply} awaiting reply`, tone: 'amber' })
  }

  // One pill however many fields are missing, naming them. The missing
  // unit link is not counted: it is bookkeeping between two tables that no
  // board member can fill in, and it put "Missing data" on 53 of 57 homes.
  const missing = missingDataLabel(row)
  if (missing) pills.push({ text: missing, tone: 'slate' })

  return pills
}

/** "No owner", "No tenure", "No owner or tenure" — or null when complete. */
export function missingDataLabel(row: Pick<SeveritySource, 'hasOwner' | 'hasTenure'>): string | null {
  const missing = missingFields(row)
  return missing.length === 0 ? null : `No ${missing.join(' or ')}`
}

/**
 * The view's rank 5 ("missing data") also fires for a missing unit link
 * (0039), which is no longer treated as missing data. Without a migration
 * the view cannot change, so a rank-5 row whose owner and tenure are both
 * on file reads as rank 6 ("nothing outstanding") here.
 */
export function effectiveSeverityRank(rank: number, row: Pick<SeveritySource, 'hasOwner' | 'hasTenure'>): number {
  return rank === 5 && missingFields(row).length === 0 ? 6 : rank
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


export interface StatusLine {
  text: string
  tone: 'danger' | 'warning' | 'neutral'
}

/**
 * The single most urgent fact about a home, for the phone card's one
 * status line. Same order as the severity rank (past cure, overdue, open
 * violations, mail), then ARC and missing data.
 */
export function statusLine(row: SeveritySource & { openArc?: number | null }): StatusLine {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  if (row.violationsPastCure > 0) return { text: n(row.violationsPastCure, 'violation past cure', 'violations past cure'), tone: 'danger' }
  if (row.balance > 0 && row.daysOverdue > 0) return { text: n(row.daysOverdue, 'day overdue', 'days overdue'), tone: 'danger' }
  if (row.openViolations > 0) return { text: n(row.openViolations, 'open violation', 'open violations'), tone: 'warning' }
  if (row.threadsNeedingReply > 0) return { text: n(row.threadsNeedingReply, 'email awaiting reply', 'emails awaiting reply'), tone: 'warning' }
  if (row.openArc && row.openArc > 0) return { text: n(row.openArc, 'ARC request to decide', 'ARC requests to decide'), tone: 'warning' }
  if (!row.hasOwner) return { text: 'Owner details missing', tone: 'neutral' }
  if (!row.hasTenure) return { text: 'Tenure not recorded', tone: 'neutral' }
  if (row.balance > 0) return { text: 'Balance not yet due', tone: 'neutral' }
  return { text: 'Nothing outstanding', tone: 'neutral' }
}
