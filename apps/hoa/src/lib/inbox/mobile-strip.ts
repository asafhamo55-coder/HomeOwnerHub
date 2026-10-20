/**
 * BL-101 A7 — the context strip above the messages on a phone or tablet
 * (below `xl`, where the property rail has no column of its own and sits
 * under the conversation). One line: which home, its balance, and what is
 * open there; tapping it jumps to the full rail.
 *
 * Pure, so "unknown" can never render as "nothing owed": a failed ledger
 * read gives `balance: { tone: 'unknown' }`, never $0.00.
 */

export interface StripInput {
  filed: boolean
  /** Null when the property context failed to load. */
  context: {
    address: string
    unitNumber: string | null
    openViolations: number
    openArcRequests: readonly unknown[]
    openTickets: readonly unknown[]
    degraded: readonly string[]
  } | null
  /** From the A1 rail: null = not loaded; `account: null` = ledger read failed. */
  account: { balanceCents: number; pastDueCount: number; truncated: boolean } | null | undefined
}

export interface StripModel {
  home: string
  balance: { tone: 'owed' | 'clear' | 'unknown'; label: string } | null
  /** Non-zero open items only, e.g. ["2 violations", "1 ticket"]. */
  open: string[]
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function contextStripModel(input: StripInput): StripModel {
  if (!input.filed) return { home: 'Not filed under a home', balance: null, open: [] }
  const c = input.context
  if (!c) return { home: 'Home details couldn’t load', balance: null, open: [] }

  const home = c.unitNumber ? `${c.address} #${c.unitNumber}` : c.address
  let balance: StripModel['balance']
  if (input.account === undefined) {
    balance = null
  } else if (!input.account || input.account.truncated) {
    balance = { tone: 'unknown', label: 'Balance unknown' }
  } else if (input.account.balanceCents > 0) {
    balance = {
      tone: 'owed',
      label: `${dollars(input.account.balanceCents)} owed${input.account.pastDueCount > 0 ? ' · past due' : ''}`,
    }
  } else {
    balance = { tone: 'clear', label: 'Nothing owed' }
  }

  const missing = new Set(c.degraded)
  const open: string[] = []
  if (!missing.has('violations') && c.openViolations > 0) open.push(plural(c.openViolations, 'violation'))
  if (!missing.has('arc') && c.openArcRequests.length > 0) open.push(plural(c.openArcRequests.length, 'ARC request'))
  if (!missing.has('tickets') && c.openTickets.length > 0) open.push(plural(c.openTickets.length, 'ticket'))
  return { home, balance, open }
}
