import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import {
  LEGACY_PLAN_VALUES,
  PRICING_V2,
  RENEWAL_TARGET_PLAN,
  SUPPORT_EMAIL,
  V2_LOOKUP_KEYS,
  bandFor,
  bandLabel,
  formatUsd,
  grandfathering,
  planPriceCents,
  type BillingCadence,
} from '@homeowner-portal/billing'
import { inngest } from './client'
import { loadBoardRecipients, BoardRecipientsError } from './daily-digest'
import { CHANGEABLE_SUBSCRIPTION_STATUSES, errorFacts, type BillingStripePort } from './billing-stripe-port'
import { planForBandLookupKey } from './billing-band-sync'

/**
 * BL-104 (decision §5): grandfathered $4.99/door subscriptions keep their
 * price until renewal (packages/billing/src/grandfathering.ts), then move to
 * Complete at their band. Once a day this job:
 *
 * 1. NOTICE — from 30 days before the renewal (grandfathering().noticeAt)
 *    until it, emails the org's board (org_members role board/admin, via
 *    loadBoardRecipients — never residents) that the subscription moves to
 *    Complete at renewal, with the new price from pricing-v2 at the homes on
 *    file. Once per subscription term: a claim row `billing.renewal_notice`
 *    (metadata.term = `<subscription id>:<renewal ISO>`) is written to
 *    audit_log BEFORE sending, and a term with a claim is never emailed
 *    again. Sent through the injected guarded sendEmail (apps/hoa's, BL-004)
 *    with the org's sandbox flag.
 * 2. SWITCH — when the renewal is the next invoice (renewal ===
 *    current_period_end) and is at most SWITCH_LEAD_MS away, and the board
 *    was given this term's notice, swaps the item to the Complete band Price
 *    (quantity = homes on file) with `proration_behavior: 'none'`, so the
 *    renewal invoice is the first at the new price. The webhook then
 *    rewrites orgs.plan from the Price's lookup key. Writes
 *    `billing.renewal_switch`.
 *
 * Notice length: a monthly subscriber already past the 12-month commitment
 * at the flip renews at their next invoice, so their notice can be shorter
 * than 30 days. That is the decision's rule (grandfathering.ts), and the new
 * price is lower at every size, so it is never an increase.
 *
 * - A no-op while PRICING_V2 is off: returns before any read.
 * - Idempotent: the claim row gates the email; the switch is skipped once
 *   the Price carries a band lookup key, and carries a Stripe idempotency
 *   key per term.
 * - Stripe is injected (BillingStripePort); this file never builds a client.
 *
 * Logs: org ids, subscription ids, counts and error codes. Never an address.
 */

export const RENEWAL_NOTICE_AUDIT_ACTION = 'billing.renewal_notice'
export const RENEWAL_SWITCH_AUDIT_ACTION = 'billing.renewal_switch'
/** The switch happens in the last two days before the renewal (a missed day still lands). */
export const SWITCH_LEAD_MS = 2 * 24 * 60 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
type Logger = Pick<Console, 'info' | 'error'>

export interface RenewalEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface RenewalDeps {
  /** null when Stripe isn't configured (the run is skipped). */
  stripe: () => BillingStripePort | null
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (input: RenewalEmail, opts: { orgSandbox?: boolean; ref?: string }) => Promise<{ ok: boolean }>
  /** Absolute URL for an app path. */
  appUrl: (path: string) => string
  /** Overridable for tests; defaults to the outbound guard's reader. */
  orgSandbox?: (db: Db, orgId: string) => Promise<boolean>
}

export interface RenewalResult {
  skipped?: 'pricing_v2_off' | 'stripe_not_configured'
  checked: number
  noticesSent: number
  emailsSent: number
  switched: number
  failed: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
}

/** The board's notice. Pure, so the copy is unit-tested. */
export function buildRenewalNotice(args: {
  orgName: string
  renewsAt: Date
  cadence: BillingCadence
  homes: number
  link: string
}): { subject: string; html: string; text: string } {
  const cents = planPriceCents(RENEWAL_TARGET_PLAN, args.cadence, args.homes)
  const price = formatUsd(cents / 100, { withCents: cents % 100 !== 0 })
  const per = args.cadence === 'annual' ? 'year' : 'month'
  const date = longDate(args.renewsAt)
  const band = bandLabel(bandFor(args.homes))
  const subject = `Your plan changes on ${date}: Complete at ${price} a ${per}`
  const paras = [
    `On ${date}, when your subscription renews, ${args.orgName} moves from the $4.99-per-home price to the Complete plan.`,
    `Your new price: ${price} a ${per} for ${args.homes} homes on file (${band}).`,
    'Complete includes every feature you use today. You don’t need to do anything: the change takes effect at that renewal, with no partial charges before it.',
    `Questions, or want to move sooner? Email ${SUPPORT_EMAIL}.`,
  ]
  const text = [...paras, '', `See your plan: ${args.link}`].join('\n\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(subject)}</h2>
  ${paras.map((p) => `<p style="margin:0 0 12px 0;color:#333;">${escapeHtml(p)}</p>`).join('\n  ')}
  <p style="margin:0;"><a href="${escapeHtml(args.link)}">See your plan</a></p>
</div>`
  return { subject, html, text }
}

async function homeCount(db: Db, orgId: string): Promise<{ count: number } | { code: string | null }> {
  const { count, error } = await db.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
  if (error) return { code: error.code ?? null }
  return { count: count ?? 0 }
}

async function termClaimed(db: Db, orgId: string, term: string): Promise<boolean> {
  const { data, error } = await db
    .from('audit_log')
    .select('id')
    .eq('org_id', orgId)
    .eq('action', RENEWAL_NOTICE_AUDIT_ACTION)
    .contains('metadata', { term })
    // Only the job's own claims (service role, user_id null): a board
    // member can insert audit rows as themselves and pre-claim a term.
    .is('user_id', null)
    .limit(1)
  if (error) throw Object.assign(new Error('claim_read_failed'), { code: error.code })
  return Array.isArray(data) && data.length > 0
}

export async function runRenewalJob(
  db: Db,
  deps: RenewalDeps,
  opts: { pricingV2?: boolean; now?: number; logger?: Logger } = {},
): Promise<RenewalResult> {
  const result: RenewalResult = { checked: 0, noticesSent: 0, emailsSent: 0, switched: 0, failed: 0 }
  if (!(opts.pricingV2 ?? PRICING_V2)) return { ...result, skipped: 'pricing_v2_off' }
  const stripe = deps.stripe()
  if (!stripe) return { ...result, skipped: 'stripe_not_configured' }
  const log = opts.logger ?? console
  const nowMs = opts.now ?? Date.now()
  const now = new Date(nowMs)

  const { data: orgs, error } = await db
    .from('orgs')
    .select('id, name, plan, stripe_sub_id')
    .in('plan', [...LEGACY_PLAN_VALUES])
    .not('stripe_sub_id', 'is', null)
    .is('archived_at', null)
  if (error) {
    log.error('[billing-renewal] org read failed', { code: error.code ?? null })
    throw Object.assign(new Error('org_read_failed'), { code: error.code })
  }

  for (const org of (orgs ?? []) as Array<{ id: string; name: string; plan: string; stripe_sub_id: string | null }>) {
    if (!org.stripe_sub_id) continue
    result.checked += 1
    try {
      const sub = await stripe.getSubscription(org.stripe_sub_id)
      // Gone, cancelled, or already on a band Price (switched): nothing to do.
      if (!sub || !CHANGEABLE_SUBSCRIPTION_STATUSES.includes(sub.status) || planForBandLookupKey(sub.lookupKey)) continue

      const decision = grandfathering(
        { plan: org.plan, cadence: sub.cadence, startedAt: sub.startedAt, currentPeriodEnd: sub.currentPeriodEnd },
        now,
      )
      if (!decision) continue
      const noticeDue = nowMs >= decision.noticeAt.getTime() && nowMs < decision.renewsAt.getTime()
      const switchDue =
        decision.renewsAt.getTime() === sub.currentPeriodEnd.getTime() && decision.renewsAt.getTime() - nowMs <= SWITCH_LEAD_MS
      if (!noticeDue && !switchDue) continue

      const homes = await homeCount(db, org.id)
      if (!('count' in homes)) {
        log.error('[billing-renewal] home count failed', { orgId: org.id, code: homes.code })
        result.failed += 1
        continue
      }
      if (homes.count < 1) {
        log.info('[billing-renewal] no homes on file; left alone', { orgId: org.id })
        continue
      }

      const renewsIso = decision.renewsAt.toISOString()
      const term = `${sub.id}:${renewsIso}`
      let claimed = await termClaimed(db, org.id, term)

      if (noticeDue && !claimed) {
        // Recipients first: a failed read leaves no claim, so tomorrow retries.
        let recipients
        try {
          recipients = await loadBoardRecipients(db, org.id)
        } catch (err) {
          if (!(err instanceof BoardRecipientsError)) throw err
          log.error('[billing-renewal] board recipients read failed', { orgId: org.id, stage: err.stage, code: err.code ?? null })
          result.failed += 1
          continue
        }
        const { error: claimErr } = await db.from('audit_log').insert({
          action: RENEWAL_NOTICE_AUDIT_ACTION,
          org_id: org.id,
          entity_type: 'subscription',
          metadata: {
            term,
            subscription_id: sub.id,
            renews_at: renewsIso,
            cadence: sub.cadence,
            homes: homes.count,
            new_price_cents: planPriceCents(RENEWAL_TARGET_PLAN, sub.cadence, homes.count),
            recipients: recipients.length,
          },
        })
        if (claimErr) {
          // No claim, no email: a broken write must never become a daily email.
          log.error('[billing-renewal] notice claim failed', { orgId: org.id, code: claimErr.code ?? null })
          result.failed += 1
          continue
        }
        claimed = true
        result.noticesSent += 1
        const email = buildRenewalNotice({
          orgName: org.name,
          renewsAt: decision.renewsAt,
          cadence: sub.cadence,
          homes: homes.count,
          link: deps.appUrl('/settings/billing'),
        })
        const orgSandbox = await (deps.orgSandbox ?? fetchOrgSandbox)(db, org.id)
        let sent = 0
        for (const r of recipients) {
          const res = await deps.sendEmail({ to: r.email, ...email }, { orgSandbox, ref: `renewal:${org.id}` })
          if (res.ok) sent += 1
        }
        result.emailsSent += sent
        log.info('[billing-renewal] notice', { orgId: org.id, subscriptionId: sub.id, recipients: recipients.length, sent })
      }

      if (switchDue && claimed) {
        const lookupKey = V2_LOOKUP_KEYS[RENEWAL_TARGET_PLAN][sub.cadence]
        const priceId = await stripe.resolvePriceId(lookupKey)
        if (!priceId) {
          log.error('[billing-renewal] band price not configured', { orgId: org.id, lookupKey })
          result.failed += 1
          continue
        }
        await stripe.updateSubscriptionItem({
          subscriptionId: sub.id,
          itemId: sub.itemId,
          priceId,
          quantity: homes.count,
          prorationBehavior: 'none',
          idempotencyKey: `renewal-switch:${sub.id}:${renewsIso}`,
        })
        result.switched += 1
        log.info('[billing-renewal] switched to Complete at renewal', { orgId: org.id, subscriptionId: sub.id, quantity: homes.count })
        const { error: auditErr } = await db.from('audit_log').insert({
          action: RENEWAL_SWITCH_AUDIT_ACTION,
          org_id: org.id,
          entity_type: 'subscription',
          metadata: { term, subscription_id: sub.id, lookup_key: lookupKey, quantity: homes.count, renews_at: renewsIso },
        })
        if (auditErr) log.error('[billing-renewal] audit write failed', { orgId: org.id, code: auditErr.code ?? null })
      }
    } catch (err) {
      result.failed += 1
      log.error('[billing-renewal] org failed', { orgId: org.id, ...errorFacts(err) })
    }
  }

  log.info('[billing-renewal] done', { ...result })
  return result
}

export function createBillingRenewalJob(deps: RenewalDeps) {
  return inngest.createFunction(
    { id: 'billing-renewal', name: 'Grandfathered renewal notice and switch (BL-104)' },
    { cron: 'TZ=UTC 0 14 * * *' },
    async () => runRenewalJob(createAdminClient() as unknown as Db, deps),
  )
}
