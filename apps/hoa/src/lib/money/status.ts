import type { StatusTone } from '@homeowner-portal/ui'

/**
 * One status vocabulary for the money area (the UX plan's STATUS registry,
 * docs/specs/2026-10-15-design-system-v2.md §6 rule 4). Each page used to
 * keep its own `variant={status === 'posted' ? 'success' : …}` ternary, and
 * they disagreed — an approved invoice was amber on the list and amber on
 * the detail page but an approved budget was green.
 *
 * Tones mean the same thing everywhere: success = settled/done, warning =
 * needs someone, danger = wrong/contested, info = in progress, neutral =
 * inert or not started.
 */
export interface StatusDef {
  tone: StatusTone
  label: string
}

type Registry = Record<string, StatusDef>

export const JOURNAL_STATUS: Registry = {
  posted: { tone: 'success', label: 'Posted' },
  draft: { tone: 'neutral', label: 'Draft' },
  reversed: { tone: 'danger', label: 'Reversed' },
}

export const INVOICE_STATUS: Registry = {
  received: { tone: 'neutral', label: 'Received' },
  coded: { tone: 'info', label: 'Coded' },
  approved: { tone: 'warning', label: 'Approved · unpaid' },
  paid: { tone: 'success', label: 'Paid' },
  disputed: { tone: 'danger', label: 'Disputed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

/** Statuses that still owe the vendor money. */
export const UNPAID_INVOICE_STATUSES = ['received', 'coded', 'approved'] as const

export const BUDGET_STATUS: Registry = {
  draft: { tone: 'warning', label: 'Draft' },
  approved: { tone: 'success', label: 'Approved' },
  archived: { tone: 'neutral', label: 'Archived' },
}

export const PERIOD_STATUS: Registry = {
  open: { tone: 'info', label: 'Open' },
  closing: { tone: 'warning', label: 'Closing' },
  closed: { tone: 'success', label: 'Closed' },
}

export const PLAN_STATUS: Registry = {
  proposed: { tone: 'neutral', label: 'Proposed' },
  active: { tone: 'info', label: 'Active' },
  completed: { tone: 'success', label: 'Completed' },
  defaulted: { tone: 'danger', label: 'Defaulted' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

export const PROPOSAL_STATUS: Registry = {
  proposed: { tone: 'ai', label: 'Awaiting approval' },
  approved: { tone: 'danger', label: 'Approved · posting incomplete' },
}

/** Human names for journal_entries.source. */
export const JOURNAL_SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  ap_invoice: 'Bills (AP)',
  ar_payment: 'Owner payments (AR)',
  bank_rec: 'Bank reconciliation',
  recurring: 'Recurring',
  closing: 'Period close',
  reversing: 'Reversal',
}

export const JOURNAL_SOURCES = Object.keys(JOURNAL_SOURCE_LABEL)

export function sourceLabel(source: string): string {
  return JOURNAL_SOURCE_LABEL[source] ?? humanize(source)
}

export function statusOf(registry: Registry, status: string): StatusDef {
  return registry[status] ?? { tone: 'neutral', label: humanize(status) }
}

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
