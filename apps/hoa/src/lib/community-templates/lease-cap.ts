/**
 * Turns lease statistics into the meter and text fields for the lease cap
 * notice.
 *
 * Pure by design: it takes stats already fetched by getLeaseStats
 * (apps/hoa/src/lib/leases.ts:74) rather than querying, so it is unit
 * testable and the query stays in one place. `LeaseCapStats` is a subset of
 * `LeaseStats` — field names match exactly so nothing needs adapting at the
 * call site.
 *
 * Two hard rules, both enforced here rather than left to the copy:
 *
 *   - Totals only. Never a unit number, never a resident name, never a
 *     property_id from lease_waiting_list. This email goes to the whole
 *     community and in a small association a single identifying detail
 *     names the household.
 *   - If the board has not set a cap, refuse. Never substitute
 *     lease_cap_ai_suggested_pct — that value is an advisory reading of the
 *     governing documents and has not been reviewed. A wrong cap stated in
 *     a mass email reads as a rule change.
 */

import type { VisualBlockSpec } from '@/lib/email/visual-block'

export interface LeaseCapStats {
  leasedCount: number
  totalUnits: number
  leasedPct: number
  capPct: number | null
}

function requireCap(stats: LeaseCapStats): number {
  if (stats.capPct === null || stats.capPct === undefined) {
    throw new Error(
      'lease cap is not set for this association. Set it from the lease policy ' +
        'screen before sending — the AI-suggested value is advisory and must not be used here.',
    )
  }
  if (!(stats.capPct > 0)) {
    throw new Error(`lease cap must be greater than zero, got ${stats.capPct}`)
  }
  return stats.capPct
}

/** One decimal: enough to be honest, not so much it looks computed. */
function round1(n: number): string {
  return `${Math.round(n * 10) / 10}`
}

export function buildLeaseCapVisual(stats: LeaseCapStats, _waitingCount: number): VisualBlockSpec {
  const cap = requireCap(stats)
  return {
    kind: 'meter',
    label: 'Homes currently leased',
    valuePct: stats.leasedPct,
    capPct: cap,
    valueLabel: `${stats.leasedCount} of ${stats.totalUnits} homes`,
    capLabel: `${round1(cap)}% cap`,
  }
}

export function buildLeaseCapFields(
  stats: LeaseCapStats,
  waitingCount: number,
): Record<string, string> {
  const cap = requireCap(stats)
  const permitted = Math.floor((cap / 100) * stats.totalUnits)
  const remaining = Math.max(0, permitted - stats.leasedCount)

  const waitingPhrase =
    waitingCount === 0
      ? 'no households are on the waiting list'
      : waitingCount === 1
        ? '1 household is on the waiting list'
        : `${waitingCount} households are on the waiting list`

  return {
    leased_count: String(stats.leasedCount),
    total_units: String(stats.totalUnits),
    leased_pct: `${round1(stats.leasedPct)}%`,
    cap_pct: `${round1(cap)}%`,
    permitted_count: String(permitted),
    remaining_slots: String(remaining),
    waiting_count: String(waitingCount),
    waiting_phrase: waitingPhrase,
  }
}
