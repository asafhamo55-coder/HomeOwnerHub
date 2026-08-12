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

import { renderMeterHtml } from '@/lib/email/meter'

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

/**
 * Same one-decimal precision as round1, but floors instead of rounding
 * half-up. Used only for the occupancy figure (leased_pct), never for the
 * cap.
 *
 * The meter bar renders the RATIO valuePct/capPct, not leasedPct in
 * isolation — so a true leasedPct of 14.96% against a 15% cap draws a bar
 * that is visibly short of full. round1(14.96) would print "15%", making
 * the sentence read "that's 15% against a cap of 15%" — self-contradictory
 * with the bar, and worse, it reads as "at cap" when the association is
 * still under it. For an email about mortgageability risk, overstating how
 * close a community is to its cap is the wrong error to make; understating
 * it by a tenth of a point is not. Flooring can only ever round DOWN, so it
 * can never make an under-cap association read as at-cap, while a genuinely
 * at-cap 15.0 still floors to "15%" untouched. Do not change this back to
 * Math.round — that reintroduces the false "at cap" reading.
 *
 * The `+ 1e-9` below is not noise — do not delete it. leasedPct comes from
 * leases.ts:118 as (leasedCount/totalUnits)*100 with no rounding, and that
 * division routinely lands a hair below the true tenth in floating point:
 * 23/40 is exactly 57.5%, but (23/40)*100 computes as 57.49999999999999.
 * A bare Math.floor(n*10)/10 would print "57.4%" — wrong, and for reasons
 * that have nothing to do with the floor-vs-round policy above; a sweep of
 * every count/total pair for totals 1..3000 found 768 ordinary HOA-sized
 * pairs (23/40, 29/50, 46/80, 29/100, ...) affected. Nudging by 1e-9 before
 * flooring absorbs that representation error — it's far below any tenth of
 * a percentage point that could matter here, and far above the ~1e-14
 * error floating-point division actually produces — while still flooring
 * genuine mid-tenth values (14.96 -> "14.9%" is unaffected).
 */
function floor1(n: number): string {
  return `${Math.floor(n * 10 + 1e-9) / 10}`
}

/**
 * Renders the occupancy meter as HTML, for merge substitution into the
 * template's `{{lease_meter_html}}` placeholder.
 *
 * This cannot be baked into the template at registry/seed time the way the
 * image-kind visuals are: it needs live data, so `visual` on the
 * lease-cap-status template is `{ kind: 'none' }` and the meter is produced
 * here instead, at send time, from the association's current lease stats.
 * Merge substitution (renderTemplateStrict) is raw, not HTML-escaped, so
 * this markup passes through into the sent email intact.
 */
export function buildLeaseCapMeterHtml(stats: LeaseCapStats, accentColor: string): string {
  const cap = requireCap(stats)
  return renderMeterHtml({
    label: 'Homes currently leased',
    valuePct: stats.leasedPct,
    capPct: cap,
    accentColor,
    valueLabel: `${stats.leasedCount} of ${stats.totalUnits} homes`,
    capLabel: `${round1(cap)}% cap`,
  })
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
    leased_pct: `${floor1(stats.leasedPct)}%`,
    cap_pct: `${round1(cap)}%`,
    permitted_count: String(permitted),
    remaining_slots: String(remaining),
    waiting_count: String(waitingCount),
    waiting_phrase: waitingPhrase,
  }
}
