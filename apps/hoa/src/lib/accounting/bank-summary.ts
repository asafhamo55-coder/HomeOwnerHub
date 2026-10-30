import type { SummaryTile } from '@/components/SummaryStrip'
import { dayOf } from '@/lib/association-time'
import { daysSince, plural, usd } from '@/lib/money/format'

/** An account is due when it was last reconciled more than this many days ago. */
export const RECONCILE_STALE_DAYS = 30

export interface RecAccount {
  id: string
  is_active: boolean
  plaid_item_id: string | null
  current_balance: number | string | null
  last_synced_at: string | null
}

/**
 * Whether an active account needs a reconciliation. True when it has never
 * been reconciled, when the last reconciliation is older than 30 days, or
 * (for a manual account, whose "synced" stamp is its last statement import)
 * when it was reconciled before that statement arrived. A linked account syncs
 * every day, so only the 30-day rule applies to it. Inactive accounts never
 * need one.
 */
export function needsReconciliation(a: RecAccount, lastReconciledAt: string | null, today: string, timeZone: string): boolean {
  if (!a.is_active) return false
  if (!lastReconciledAt) return true
  const day = dayOf(lastReconciledAt, timeZone)
  if (!day || daysSince(day, today) > RECONCILE_STALE_DAYS) return true
  const manual = !a.plaid_item_id
  return manual && a.last_synced_at !== null && new Date(lastReconciledAt).getTime() < new Date(a.last_synced_at).getTime()
}

export interface BankSummaryInput {
  /** Null when the account list failed to load. */
  accounts: RecAccount[] | null
  /** Latest reconciled_at per account id; null when that read failed. */
  lastReconciled: ReadonlyMap<string, string> | null
  /** Unmatched transaction count; null when that read failed. */
  unmatched: number | null
  today: string
  timeZone: string
}

export function bankSummaryTiles({ accounts, lastReconciled, unmatched, today, timeZone }: BankSummaryInput): SummaryTile[] {
  const active = accounts ? accounts.filter((a) => a.is_active) : null
  const total = active ? active.reduce((s, a) => s + (a.current_balance == null ? 0 : Number(a.current_balance)), 0) : null
  const noBalance = active ? active.filter((a) => a.current_balance == null).length : 0
  const due =
    active && lastReconciled ? active.filter((a) => needsReconciliation(a, lastReconciled.get(a.id) ?? null, today, timeZone)).length : null
  return [
    {
      label: 'Total cash',
      value: total === null ? null : usd(total),
      hint: noBalance > 0 ? `${plural(noBalance, 'account')} without a balance yet` : `Across ${plural(active?.length ?? 0, 'active account')}`,
    },
    {
      label: 'Need reconciling',
      value: due === null ? null : String(due),
      hint: due === 0 ? 'All reconciled within 30 days' : 'Not reconciled in 30 days, or since the last statement',
      tone: due ? 'warning' : 'default',
    },
    {
      label: 'Unmatched transactions',
      value: unmatched === null ? null : String(unmatched),
      hint: unmatched === 0 ? 'Everything is matched' : 'Waiting in the matching queue',
      href: '/accounting/bank/queue',
      tone: unmatched ? 'warning' : 'default',
    },
  ]
}
