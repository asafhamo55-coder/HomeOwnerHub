import { createAdminClient } from '@homeowner-portal/db'
import {
  HOA_PLAN_IDS,
  PRICING_V2,
  V2_LOOKUP_KEYS,
  bandFor,
  monthlyPriceCents,
  type HoaPlanId,
} from '@homeowner-portal/billing'
import { inngest } from './client'
import { CHANGEABLE_SUBSCRIPTION_STATUSES, errorFacts, type BillingStripePort } from './billing-stripe-port'

/**
 * BL-104 (decision §2): every night, for each org on the new plans
 * (orgs.plan 'essentials' / 'complete' with a subscription), recount the
 * billable doors from the server's own home count (hoa_properties rows,
 * the same count checkout sends) and, when that changes what the org pays,
 * set the subscription quantity with `proration_behavior: 'none'`: the new
 * band bills from the next renewal, never mid-term.
 *
 * "Changes what the org pays" = the monthly price at the new count differs
 * from the price at Stripe's quantity: a band change (50/100/200/400), or
 * any change in the per-door 401+ band. A count that moves inside a closed
 * band changes nothing and makes no Stripe call.
 *
 * - A no-op while PRICING_V2 is off: returns before any read.
 * - Idempotent: once Stripe's quantity matches, the next run changes
 *   nothing; each change carries a Stripe idempotency key (subscription,
 *   new quantity, UTC day), so a retried run cannot double-apply.
 * - 0 homes on file is skipped, never billed as the 1–50 band: an emptied
 *   property list is far more likely an import in progress than a real
 *   shrink.
 * - Only Prices with a band lookup key are touched; a grandfathered
 *   $4.99/door subscription is the renewal job's (billing-renewal.ts).
 * - Stripe is injected (BillingStripePort); this file never builds a client.
 * - Each change writes an audit_log row `billing.band_sync` (quantities and
 *   bands only).
 *
 * Logs: org ids, subscription ids, counts and error codes only.
 */

export const BAND_SYNC_AUDIT_ACTION = 'billing.band_sync'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface BandSyncDeps {
  /** null when Stripe isn't configured (the run is skipped). */
  stripe: () => BillingStripePort | null
}

export interface BandSyncResult {
  skipped?: 'pricing_v2_off' | 'stripe_not_configured'
  checked: number
  changed: number
  unchanged: number
  /** Not a band subscription, no homes, or not in a changeable status. */
  ignored: number
  failed: number
}

type Logger = Pick<Console, 'info' | 'error'>

const V2_KEY_PLAN: ReadonlyMap<string, HoaPlanId> = new Map(
  HOA_PLAN_IDS.flatMap((plan) => Object.values(V2_LOOKUP_KEYS[plan]).map((key) => [key, plan] as const)),
)

/** The plan a band Price's lookup key belongs to; null for any other Price. */
export function planForBandLookupKey(lookupKey: string | null): HoaPlanId | null {
  return (lookupKey && V2_KEY_PLAN.get(lookupKey)) || null
}

export async function runBandSync(
  db: Db,
  deps: BandSyncDeps,
  opts: { pricingV2?: boolean; now?: number; logger?: Logger } = {},
): Promise<BandSyncResult> {
  const result: BandSyncResult = { checked: 0, changed: 0, unchanged: 0, ignored: 0, failed: 0 }
  if (!(opts.pricingV2 ?? PRICING_V2)) return { ...result, skipped: 'pricing_v2_off' }
  const stripe = deps.stripe()
  if (!stripe) return { ...result, skipped: 'stripe_not_configured' }
  const log = opts.logger ?? console
  const day = new Date(opts.now ?? Date.now()).toISOString().slice(0, 10)

  const { data: orgs, error } = await db
    .from('orgs')
    .select('id, plan, stripe_sub_id')
    .in('plan', [...HOA_PLAN_IDS])
    .not('stripe_sub_id', 'is', null)
    .is('archived_at', null)
  if (error) {
    log.error('[billing-band-sync] org read failed', { code: error.code ?? null })
    // Throw so Inngest retries and the failure-reporting middleware sees it.
    throw Object.assign(new Error('org_read_failed'), { code: error.code })
  }

  for (const org of (orgs ?? []) as Array<{ id: string; plan: string; stripe_sub_id: string | null }>) {
    if (!org.stripe_sub_id) continue
    result.checked += 1
    try {
      const { count, error: countErr } = await db
        .from('hoa_properties')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
      if (countErr) {
        log.error('[billing-band-sync] home count failed', { orgId: org.id, code: countErr.code ?? null })
        result.failed += 1
        continue
      }
      const homes = count ?? 0
      if (homes < 1) {
        log.info('[billing-band-sync] no homes on file; left alone', { orgId: org.id })
        result.ignored += 1
        continue
      }

      const sub = await stripe.getSubscription(org.stripe_sub_id)
      const plan = planForBandLookupKey(sub?.lookupKey ?? null)
      if (!sub || !plan || !CHANGEABLE_SUBSCRIPTION_STATUSES.includes(sub.status)) {
        result.ignored += 1
        continue
      }

      if (monthlyPriceCents(plan, sub.quantity) === monthlyPriceCents(plan, homes)) {
        result.unchanged += 1
        continue
      }

      const fromQuantity = sub.quantity
      await stripe.updateSubscriptionItem({
        subscriptionId: sub.id,
        itemId: sub.itemId,
        quantity: homes,
        prorationBehavior: 'none',
        idempotencyKey: `band-sync:${sub.id}:${homes}:${day}`,
      })
      result.changed += 1
      const fromBand = bandFor(fromQuantity).id
      const toBand = bandFor(homes).id
      log.info('[billing-band-sync] quantity set for next renewal', {
        orgId: org.id,
        subscriptionId: sub.id,
        fromQuantity,
        toQuantity: homes,
        fromBand,
        toBand,
      })
      const { error: auditErr } = await db.from('audit_log').insert({
        action: BAND_SYNC_AUDIT_ACTION,
        org_id: org.id,
        entity_type: 'subscription',
        metadata: {
          subscription_id: sub.id,
          plan,
          from_quantity: fromQuantity,
          to_quantity: homes,
          from_band: fromBand,
          to_band: toBand,
          effective: 'next_renewal',
        },
      })
      if (auditErr) log.error('[billing-band-sync] audit write failed', { orgId: org.id, code: auditErr.code ?? null })
    } catch (err) {
      result.failed += 1
      log.error('[billing-band-sync] org failed', { orgId: org.id, ...errorFacts(err) })
    }
  }

  log.info('[billing-band-sync] done', { ...result })
  return result
}

export function createBillingBandSyncJob(deps: BandSyncDeps) {
  return inngest.createFunction(
    { id: 'billing-band-sync', name: 'Nightly billing band sync (BL-104)' },
    { cron: 'TZ=UTC 0 6 * * *' },
    async () => runBandSync(createAdminClient() as unknown as Db, deps),
  )
}
