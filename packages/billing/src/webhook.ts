import type Stripe from 'stripe'
import { createAdminClient } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { getStripe } from './client'
import { billableDoors } from './pricing'
import {
  AUDIT_INVOICE_PAYMENT_FAILED,
  AUDIT_SUBSCRIPTION_UPDATED,
  clockOf,
  isAfter,
  planForPrice,
  statusEffect,
  type EventClock,
} from './billing-status'

export interface WebhookHandleResult {
  ok: boolean
  /** What we did, for logging. */
  outcome:
    | 'subscription_started'
    | 'one_time_payment'
    | 'case_payment_recorded'
    | 'subscription_deleted'
    | 'subscription_updated'
    | 'invoice_failed'
    | 'duplicate'
    | 'ignored'
    | 'error'
  message?: string
  /** Postgres / PostgREST code of a failed write — never its message. */
  dbCode?: string
}

/**
 * Verifies the Stripe webhook signature, then routes to the relevant handler.
 * Apps mount this from /api/webhooks/stripe.
 *
 * Subscriptions update orgs.plan / stripe_customer_id / stripe_sub_id.
 * One-time payments don't touch orgs.plan (the org might already be on a
 * subscription) but DO save the customer id so the next checkout has a
 * card on file. If the session metadata includes a case_id, the eviction
 * case row also gets stamped with stripe_payment_id (per-case billing).
 *
 * Uses the admin client (service role) since webhooks have no user session.
 * `deps` exists for tests (the BL-103 Stripe sandbox suite): an in-memory
 * db and an explicit Stripe client. Routes pass nothing.
 */
export async function handleStripeWebhook(
  input: {
    rawBody: string
    signatureHeader: string | null
    webhookSecret: string | undefined
  },
  deps: { db?: WebhookDb; stripe?: Stripe | null; m1?: boolean } = {},
): Promise<WebhookHandleResult> {
  const stripe = deps.stripe ?? getStripe()
  if (!stripe) {
    return { ok: false, outcome: 'error', message: 'stripe_not_configured' }
  }
  if (!input.webhookSecret) {
    return { ok: false, outcome: 'error', message: 'webhook_secret_missing' }
  }
  if (!input.signatureHeader) {
    return { ok: false, outcome: 'error', message: 'signature_missing' }
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(input.rawBody, input.signatureHeader, input.webhookSecret)
  } catch {
    // Never surface the SDK's text: it is provider detail, not a code.
    return { ok: false, outcome: 'error', message: 'invalid_signature' }
  }

  return applyStripeEvent(event, {
    db: deps.db ?? (createAdminClient() as unknown as WebhookDb),
    m1: deps.m1,
    stripe,
  })
}

/**
 * The slice of the Stripe client used to check that an audit row's claimed
 * event is real (SEC-N2). Structural, so tests can pass a fake.
 */
export interface StripeEventLookup {
  events: { retrieve(id: string): Promise<Stripe.Event> }
}

/**
 * HTTP status for a handler result. A request we can never accept (no or
 * bad signature) is 400; a failure on our side (not configured, a write
 * that did not persist) is 500. Stripe redelivers either way, but only the
 * 500s are ours to fix, and logs/alerts can now tell them apart.
 */
export function webhookHttpStatus(result: WebhookHandleResult): number {
  if (result.ok) return 200
  if (result.message === 'signature_missing' || result.message === 'invalid_signature') return 400
  return 500
}

// ─── Persistence ──────────────────────────────────────────────────────

type DbError = { code?: string | number } | null

interface WebhookRpcs {
  stripe_webhook_checkout_subscription: {
    p_event_id: string
    p_event_created: string
    p_org_id: string
    p_customer_id: string | null
    p_sub_id: string | null
    p_plan: string | null
  }
  stripe_webhook_checkout_payment: {
    p_event_id: string
    p_event_created: string
    p_org_id: string
    p_customer_id: string | null
    p_case_id: string | null
    p_payment_intent_id: string | null
  }
  stripe_webhook_subscription_deleted: {
    p_event_id: string
    p_event_created: string
    p_sub_id: string
  }
}

interface Filterable extends PromiseLike<{ error: DbError }> {
  eq(col: string, value: string): Filterable
}

/** A PostgREST select. `col` may be a JSON path such as `metadata->>sub_id`. */
export interface Selectable extends PromiseLike<{ data: Array<Record<string, unknown>> | null; error: DbError }> {
  eq(col: string, value: string): Selectable
  is(col: string, value: null): Selectable
  order(col: string, opts: { ascending: boolean }): Selectable
  limit(n: number): Selectable
}

export type WebhookTable = 'orgs' | 'eviction_cases' | 'audit_log'

/** The slice of the admin client this module uses (structural, so tests can fake it). */
export interface WebhookDb {
  from(table: WebhookTable): {
    update(patch: Record<string, unknown>): Filterable
    select(columns: string): Selectable
    insert(row: Record<string, unknown>): PromiseLike<{ error: DbError }>
  }
  rpc<N extends keyof WebhookRpcs>(fn: N, args: WebhookRpcs[N]): PromiseLike<{ data: unknown; error: DbError }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APPLIED = new Set<WebhookHandleResult['outcome']>([
  'subscription_started',
  'subscription_deleted',
  'one_time_payment',
  'case_payment_recorded',
])

function persistFailed(error: DbError): WebhookHandleResult {
  return {
    ok: false,
    outcome: 'error',
    message: 'persist_failed',
    dbCode: error?.code != null ? String(error.code) : undefined,
  }
}

async function callRpc<N extends keyof WebhookRpcs>(db: WebhookDb, fn: N, args: WebhookRpcs[N]): Promise<WebhookHandleResult> {
  const { data, error } = await db.rpc(fn, args)
  if (error) return persistFailed(error)
  const code = typeof data === 'string' ? data : null
  if (code === 'duplicate') return { ok: true, outcome: 'duplicate' }
  if (code && code.startsWith('ignored_')) return { ok: true, outcome: 'ignored', message: code.slice('ignored_'.length) }
  if (code && APPLIED.has(code as WebhookHandleResult['outcome'])) {
    return { ok: true, outcome: code as WebhookHandleResult['outcome'] }
  }
  // A reply we do not understand: we cannot claim it persisted.
  return { ok: false, outcome: 'error', message: 'unexpected_rpc_result' }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : (value.id ?? null)
}

/**
 * Apply one verified event.
 *
 * m1 = false (today): the pre-M1 direct writes, unchanged in effect.
 *
 * m1 = true (after migrations/0064_m1_batch.sql): every handled event goes
 * through ONE SQL function that dedupes on Stripe's event id, records the
 * event against its SUBSCRIPTION (stripe_subscriptions), and recomputes the
 * org from the set of subscriptions it has seen — the latest-started live
 * one, or free once its current one is recorded deleted. The result does
 * not depend on delivery order, so a deletion of the old subscription
 * processed before the replacement's checkout cannot leave a paying org on
 * free (the refuted r2 0064 kept one per-org clock and could). A failed
 * write is ok: false, so the route answers non-2xx and Stripe redelivers.
 *
 * customer.subscription.updated and invoice.payment_failed have no 0064
 * function: on both paths they dedupe and order on audit_log rows instead
 * (see the section below applyStripeEvent).
 */
export async function applyStripeEvent(
  event: Stripe.Event,
  deps: { db: WebhookDb; m1?: boolean; stripe?: StripeEventLookup | Stripe | null },
): Promise<WebhookHandleResult> {
  const m1 = deps.m1 ?? M1_APPLIED
  const db = deps.db
  const verifier = makeVerifier(deps.stripe ?? null)
  const eventCreated = new Date(event.created * 1000).toISOString()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.org_id
      const plan = session.metadata?.plan || null
      const caseId = session.metadata?.case_id
      const customerId = idOf(session.customer as string | { id: string } | null)
      const paymentIntentId = idOf(session.payment_intent as string | { id: string } | null)

      if (!orgId) return { ok: true, outcome: 'ignored', message: 'session_missing_org_id' }

      if (m1) {
        // Our checkout stamps a uuid; anything else would fail the uuid cast on every redelivery.
        if (!UUID_RE.test(orgId)) return { ok: true, outcome: 'ignored', message: 'session_invalid_org_id' }
        if (session.mode === 'subscription') {
          return callRpc(db, 'stripe_webhook_checkout_subscription', {
            p_event_id: event.id,
            p_event_created: eventCreated,
            p_org_id: orgId,
            p_customer_id: customerId,
            p_sub_id: idOf(session.subscription as string | { id: string } | null),
            p_plan: plan,
          })
        }
        return callRpc(db, 'stripe_webhook_checkout_payment', {
          p_event_id: event.id,
          p_event_created: eventCreated,
          p_org_id: orgId,
          p_customer_id: customerId,
          p_case_id: caseId && UUID_RE.test(caseId) ? caseId : null,
          p_payment_intent_id: paymentIntentId,
        })
      }

      if (session.mode === 'subscription') {
        const updates: Record<string, unknown> = {
          stripe_customer_id: customerId,
          stripe_sub_id: idOf(session.subscription as string | { id: string } | null),
        }
        if (plan) updates.plan = plan
        // A failed write must not be acknowledged: before 0064 the plan
        // check rejected 'monthly'/'annual' (23514) and this returned ok,
        // so Stripe never redelivered and the paying org stayed free.
        const { error } = await db.from('orgs').update(updates).eq('id', orgId)
        if (error) return persistFailed(error)
        return { ok: true, outcome: 'subscription_started' }
      }

      // One-time payment (mode: 'payment'): never overwrite the running
      // plan. Only stamp the customer id so we keep the card on file.
      if (customerId) {
        const { error } = await db.from('orgs').update({ stripe_customer_id: customerId }).eq('id', orgId)
        if (error) return persistFailed(error)
      }

      // Per-case eviction billing, scoped by org_id from the verified
      // metadata so a stray case_id from another org never matches.
      if (caseId && paymentIntentId) {
        const { error } = await db
          .from('eviction_cases')
          .update({ stripe_payment_id: paymentIntentId })
          .eq('id', caseId)
          .eq('org_id', orgId)
        if (error) return persistFailed(error)
        return { ok: true, outcome: 'case_payment_recorded' }
      }

      return { ok: true, outcome: 'one_time_payment' }
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      if (m1) {
        if (!sub.id) return { ok: true, outcome: 'ignored', message: 'subscription_missing_id' }
        return callRpc(db, 'stripe_webhook_subscription_deleted', {
          p_event_id: event.id,
          p_event_created: eventCreated,
          p_sub_id: sub.id,
        })
      }
      const customerId = idOf(sub.customer as string | { id: string } | null)
      if (!customerId) {
        return { ok: true, outcome: 'ignored', message: 'no customer on subscription' }
      }
      const { error } = await db.from('orgs').update({ plan: 'free', stripe_sub_id: null }).eq('stripe_customer_id', customerId)
      if (error) return persistFailed(error)
      return { ok: true, outcome: 'subscription_deleted' }
    }

    case 'customer.subscription.updated':
      return applySubscriptionUpdated(event, db, m1, eventCreated, verifier)

    case 'invoice.payment_failed':
      // Stripe retries the charge on its own; we record the failure so the
      // board sees a banner even before (or without) the
      // customer.subscription.updated that moves it to past_due.
      return recordInvoiceFailed(event, db, eventCreated)

    default:
      return { ok: true, outcome: 'ignored', message: event.type }
  }
}

// ─── customer.subscription.updated and invoice.payment_failed ─────────
//
// orgs has no status column and 0064 has no function for either event, so
// (no migration) both are recorded in audit_log: ids, Stripe's status, the
// quantity and timestamps only, never PII. Those rows do three jobs:
//   * ORDER: an update is applied only if it is later, by (event.created,
//     event id), than every update already applied for that subscription.
//     Stripe does not order deliveries; a late `past_due` must not
//     overwrite the `active` that followed it.
//   * DEDUPE: an event id already recorded is a duplicate. The audit row is
//     written LAST and every write before it is idempotent, so a delivery
//     that failed part-way answers 500 and Stripe's redelivery redoes it.
//   * BANNER: billingAttention() (billing-status.ts) reads the same rows.
// An update applies only to the org whose stripe_sub_id IS this
// subscription, so a late update of a replaced or deleted subscription
// changes nothing.
//
// M1 gate: before 0064, orgs_plan_check rejects 'monthly' / 'annual'
// (23514), so a plan switch is written only with M1_APPLIED (through 0064's
// checkout function, which owns orgs.plan under M1). Without it the status
// and quantity are still recorded and doors_count still synced, so the
// banner works today.
//
// Not serialised: two deliveries for one subscription racing within the
// same few milliseconds can both pass the ORDER check (there is no row
// lock without a SQL function), and the older one's writes can land after
// the newer one's. Mitigation without a migration: after its audit row is
// written, every delivery RECONCILES (reconcileToNewest): it re-reads the
// newest applied audit row for the subscription and the org, and re-applies
// that newest state (plan under M1, doors_count) wherever the org
// disagrees. Each delivery's writes precede its audit row, so whichever
// delivery reconciles last sees both audit rows and both sets of writes,
// and leaves the newer state. Re-applying is idempotent. A redelivery that
// dedupes as 'duplicate' reconciles too, so a failed reconcile (answered
// 500) is retried by Stripe. Residual window: a reconcile's own write
// racing the other delivery's reconcile read; the next event for the
// subscription corrects that, and Stripe sends a subscription's updates
// seconds apart at the least.

interface OrgBilling {
  id: string
  plan: string | null
  doors_count: number | null
}

function readFailed(error: DbError): WebhookHandleResult {
  return { ok: false, outcome: 'error', message: 'read_failed', dbCode: error?.code != null ? String(error.code) : undefined }
}

async function orgOnSubscription(db: WebhookDb, subId: string): Promise<{ org: OrgBilling | null; error: DbError }> {
  const { data, error } = await db
    .from('orgs')
    .select('id, plan, doors_count')
    .eq('stripe_sub_id', subId)
    .order('id', { ascending: true })
    .limit(1)
  if (error) return { org: null, error }
  const row = data?.[0]
  if (!row || typeof row.id !== 'string') return { org: null, error: null }
  return {
    org: {
      id: row.id,
      plan: typeof row.plan === 'string' ? row.plan : null,
      doors_count: typeof row.doors_count === 'number' ? row.doors_count : null,
    },
    error: null,
  }
}

/** How many recent update rows the ordering check reads (ties need more than one). */
const ORDER_WINDOW = 20

interface AppliedUpdate {
  clock: EventClock
  metadata: Record<string, unknown>
}

/** The applied update rows (clock + metadata) for (org, subscription). */
async function appliedUpdateRows(db: WebhookDb, orgId: string, subId: string): Promise<{ rows: AppliedUpdate[]; error: DbError }> {
  const { data, error } = await db
    .from('audit_log')
    .select('metadata')
    .eq('org_id', orgId)
    .eq('action', AUDIT_SUBSCRIPTION_UPDATED)
    .eq('metadata->>sub_id', subId)
    // Only rows this webhook wrote (service role, user_id null). RLS lets a
    // board member insert audit rows as themselves; a forged far-future
    // event_created would otherwise make every real update "stale". Until
    // 0063 a member can also write user_id NULL, so callers still verify
    // any row that would change the outcome (SEC-N2, below).
    .is('user_id', null)
    .order('metadata->>event_created', { ascending: false })
    .limit(ORDER_WINDOW)
  if (error) return { rows: [], error }
  const rows: AppliedUpdate[] = []
  for (const r of data ?? []) {
    const clock = clockOf(r.metadata)
    if (clock) rows.push({ clock, metadata: r.metadata as Record<string, unknown> })
  }
  return { rows, error: null }
}

/**
 * Re-applies the newest applied update's state for this subscription
 * wherever the org disagrees with it (see "Not serialised" above). Returns
 * null when nothing needed doing or the writes succeeded; a failed result
 * otherwise, so the route answers 500 and Stripe redelivers (the
 * redelivery dedupes and reconciles again).
 */
async function reconcileToNewest(
  db: WebhookDb,
  m1: boolean,
  orgId: string,
  sub: Stripe.Subscription,
  eventId: string,
  verify: Verifier,
): Promise<WebhookHandleResult | null> {
  const applied = await appliedUpdateRows(db, orgId, sub.id)
  if (applied.error) return readFailed(applied.error)
  // Newest first; the first row that is this (signature-verified) event or
  // that Stripe confirms is the state to converge on (SEC-N2).
  const ordered = [...applied.rows].sort((a, b) => (isAfter(a.clock, b.clock) ? -1 : isAfter(b.clock, a.clock) ? 1 : 0))
  let newest: AppliedUpdate | null = null
  for (const row of ordered) {
    if (row.clock.eventId === eventId) {
      newest = row
      break
    }
    const claim = await verify(row, sub.id)
    if (claim === 'unverifiable') return verifyFailed()
    if (claim === 'genuine') {
      newest = row
      break
    }
  }
  if (!newest) return null

  const status = typeof newest.metadata.status === 'string' ? newest.metadata.status : null
  // A terminal status is already order-safe: the downgrade clears
  // stripe_sub_id (pre-M1) or tombstones the subscription (M1), and every
  // later write for it is scoped to the live subscription.
  if (statusEffect(status) === 'downgrade') return null

  const found = await orgOnSubscription(db, sub.id)
  if (found.error) return readFailed(found.error)
  const org = found.org
  if (!org || org.id !== orgId) return null

  const plan = typeof newest.metadata.plan === 'string' ? newest.metadata.plan : null
  const q = newest.metadata.quantity
  const quantity = typeof q === 'number' && Number.isInteger(q) && q > 0 ? q : null

  if (m1 && plan != null && plan !== org.plan) {
    // A deterministic id per (newest event, reconciling event): unique, so
    // 0064's dedupe does not swallow it, and a redelivery is a no-op.
    const r = await callRpc(db, 'stripe_webhook_checkout_subscription', {
      p_event_id: `${newest.clock.eventId}:reconcile:${eventId}`,
      p_event_created: newest.clock.created,
      p_org_id: org.id,
      p_customer_id: idOf(sub.customer as string | { id: string } | null),
      p_sub_id: sub.id,
      p_plan: plan,
    })
    if (!r.ok) return r
  }
  if (quantity != null && billableDoors(org.doors_count ?? 0) !== quantity) {
    const { error } = await db.from('orgs').update({ doors_count: quantity }).eq('id', org.id).eq('stripe_sub_id', sub.id)
    if (error) return persistFailed(error)
  }
  return null
}

// ─── Forged audit rows (security review #2, SEC-N2) ───────────────────
//
// The `.is('user_id', null)` filter above only proves a row was written
// with no user. Until migrations/0063 tightens audit_log's insert policy,
// any member can insert a row with user_id NULL, so an applied-update row
// is a CLAIM, not proof. A row matters only when it is newer than the
// event in hand (it would make that event stale, or reconcile would copy
// its plan / quantity); every such row is checked against Stripe before it
// is honoured: the event it names must exist, be a
// customer.subscription.updated for THIS subscription, and carry the same
// created time, status, plan and quantity the row claims. A row that fails
// is ignored and logged with ids only. Stripe being unreachable is a 500
// (verify_failed) so Stripe redelivers, never a silent pass either way.
// Rows older than the event in hand are never looked up (Stripe keeps
// events for 30 days; those rows cannot block anything).

type Claim = 'genuine' | 'forged' | 'unverifiable'

interface UpdateFacts {
  status: string | null
  plan: string | null
  quantity: number | null
}

function updateFacts(sub: Stripe.Subscription): UpdateFacts {
  const item = sub.items?.data?.[0]
  return {
    status: sub.status ?? null,
    plan: planForPrice(item?.price),
    quantity: typeof item?.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : null,
  }
}

type Verifier = (row: AppliedUpdate, subId: string) => Promise<Claim>

function makeVerifier(stripe: StripeEventLookup | Stripe | null): Verifier {
  const lookup = stripe && typeof (stripe as StripeEventLookup).events?.retrieve === 'function' ? (stripe as StripeEventLookup) : null
  const cache = new Map<string, Claim>()
  return async (row, subId) => {
    // No client (direct callers in tests): nothing to check against.
    if (!lookup) return 'genuine'
    const key = `${row.clock.eventId}|${row.clock.created}|${JSON.stringify(row.metadata)}`
    const hit = cache.get(key)
    if (hit) return hit
    let claim: Claim
    try {
      const real = await lookup.events.retrieve(row.clock.eventId)
      const sub = real?.data?.object as Stripe.Subscription | undefined
      const facts = sub ? updateFacts(sub) : null
      const m = row.metadata
      claim =
        real?.type === 'customer.subscription.updated' &&
        sub?.id === subId &&
        new Date(real.created * 1000).toISOString() === row.clock.created &&
        facts != null &&
        (m.status ?? null) === facts.status &&
        (m.plan ?? null) === facts.plan &&
        (m.quantity ?? null) === facts.quantity
          ? 'genuine'
          : 'forged'
    } catch (err) {
      const e = err as { statusCode?: number; code?: string } | null
      claim = e?.statusCode === 404 || e?.code === 'resource_missing' ? 'forged' : 'unverifiable'
    }
    if (claim === 'forged') {
      // Ids only: the claimed event id is attacker-chosen text, so cap it.
      console.warn('[stripe-webhook] ignored unverified audit row', { subId, claimedEventId: row.clock.eventId.slice(0, 64) })
    }
    cache.set(key, claim)
    return claim
  }
}

function verifyFailed(): WebhookHandleResult {
  return { ok: false, outcome: 'error', message: 'verify_failed' }
}

async function insertAudit(
  db: WebhookDb,
  orgId: string,
  action: string,
  entityType: string,
  metadata: Record<string, unknown>,
): Promise<DbError> {
  const { error } = await db.from('audit_log').insert({
    org_id: orgId,
    user_id: null,
    action,
    entity_type: entityType,
    metadata,
  })
  return error
}

/**
 * customer.subscription.updated (BL-103): portal plan swaps, quantity
 * changes and dunning all arrive here.
 *
 *   active, trialing, incomplete   keep the plan; switch it to the price's plan (M1 only)
 *   past_due, unpaid, paused       same, and the dashboard shows the billing banner
 *   canceled, incomplete_expired   downgrade, exactly as customer.subscription.deleted
 *
 * Quantity: Stripe bills billableDoors(doors_count), the minimum applied,
 * so doors_count is synced only when the two disagree (a 10-door
 * association billed at the 41-door minimum keeps its 10).
 */
async function applySubscriptionUpdated(
  event: Stripe.Event,
  db: WebhookDb,
  m1: boolean,
  eventCreated: string,
  verify: Verifier,
): Promise<WebhookHandleResult> {
  const sub = event.data.object as Stripe.Subscription
  if (!sub.id) return { ok: true, outcome: 'ignored', message: 'subscription_missing_id' }
  const effect = statusEffect(sub.status)

  const found = await orgOnSubscription(db, sub.id)
  if (found.error) return readFailed(found.error)
  const org = found.org
  if (!org) {
    // Under M1 a terminal status still leaves its tombstone, exactly as a
    // deletion does: a checkout for it delivered later must find it dead.
    if (effect === 'downgrade' && m1) {
      return callRpc(db, 'stripe_webhook_subscription_deleted', { p_event_id: event.id, p_event_created: eventCreated, p_sub_id: sub.id })
    }
    return { ok: true, outcome: 'ignored', message: 'not_current_subscription' }
  }

  const prior = await appliedUpdateRows(db, org.id, sub.id)
  if (prior.error) return readFailed(prior.error)
  const clock: EventClock = { created: eventCreated, eventId: event.id }
  if (prior.rows.some((r) => r.clock.eventId === event.id)) {
    // A redelivery of an applied event: reconcile again, in case this
    // event's first delivery raced another and its reconcile failed.
    return (await reconcileToNewest(db, m1, org.id, sub, event.id, verify)) ?? { ok: true, outcome: 'duplicate' }
  }
  // A newer applied row makes this event stale only if Stripe confirms it
  // (SEC-N2: a member-inserted row with a far-future clock must not).
  for (const row of prior.rows) {
    if (isAfter(clock, row.clock)) continue
    const claim = await verify(row, sub.id)
    if (claim === 'unverifiable') return verifyFailed()
    if (claim === 'genuine') return { ok: true, outcome: 'ignored', message: 'stale_event' }
  }

  const { plan, quantity } = updateFacts(sub)

  let outcome: WebhookHandleResult['outcome']
  if (effect === 'downgrade') {
    if (m1) {
      const r = await callRpc(db, 'stripe_webhook_subscription_deleted', {
        p_event_id: event.id,
        p_event_created: eventCreated,
        p_sub_id: sub.id,
      })
      // 'duplicate' = this event's own earlier delivery got past the
      // function but not the audit row; finish it.
      if (!r.ok || (r.outcome !== 'subscription_deleted' && r.outcome !== 'duplicate')) return r
    } else {
      // Scoped to this subscription (not the customer, as the pre-M1
      // deletion is), so a late cancel of a replaced one cannot downgrade.
      const { error } = await db.from('orgs').update({ plan: 'free', stripe_sub_id: null }).eq('id', org.id).eq('stripe_sub_id', sub.id)
      if (error) return persistFailed(error)
    }
    outcome = 'subscription_deleted'
  } else {
    if (m1 && plan != null && plan !== org.plan) {
      // Under M1 orgs.plan is recomputed from stripe_subscriptions, so a
      // direct write would be reverted by the next event. 0064's checkout
      // function upserts this subscription's plan (started_at keeps its
      // earliest value) and recomputes the org.
      const r = await callRpc(db, 'stripe_webhook_checkout_subscription', {
        p_event_id: event.id,
        p_event_created: eventCreated,
        p_org_id: org.id,
        p_customer_id: idOf(sub.customer as string | { id: string } | null),
        p_sub_id: sub.id,
        p_plan: plan,
      })
      if (!r.ok || (r.outcome !== 'subscription_started' && r.outcome !== 'duplicate')) return r
    }
    if (quantity != null && billableDoors(org.doors_count ?? 0) !== quantity) {
      const { error } = await db.from('orgs').update({ doors_count: quantity }).eq('id', org.id).eq('stripe_sub_id', sub.id)
      if (error) return persistFailed(error)
    }
    outcome = 'subscription_updated'
  }

  const auditError = await insertAudit(db, org.id, AUDIT_SUBSCRIPTION_UPDATED, 'stripe_subscription', {
    event_id: event.id,
    event_created: eventCreated,
    sub_id: sub.id,
    status: sub.status ?? null,
    plan,
    quantity,
  })
  if (auditError) return persistFailed(auditError)
  if (outcome === 'subscription_updated') {
    const reconciled = await reconcileToNewest(db, m1, org.id, sub, event.id, verify)
    if (reconciled) return reconciled
  }
  return { ok: true, outcome }
}

/**
 * invoice.payment_failed (BL-103): recorded in audit_log (ids only) for
 * the org on that subscription. Never touches the plan. Same on both
 * paths. Deduped on the event id.
 */
async function recordInvoiceFailed(event: Stripe.Event, db: WebhookDb, eventCreated: string): Promise<WebhookHandleResult> {
  // API 2025-03-31 (basil) moved the subscription under
  // parent.subscription_details; older payloads carry it at the top level.
  const invoice = event.data.object as unknown as {
    id?: string
    subscription?: string | { id: string } | null
    attempt_count?: unknown
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
  }
  if (!invoice.id) return { ok: true, outcome: 'ignored', message: 'invoice_missing_id' }
  const subId = idOf(invoice.parent?.subscription_details?.subscription ?? null) ?? idOf(invoice.subscription ?? null)
  if (!subId) return { ok: true, outcome: 'ignored', message: 'invoice_without_subscription' }

  const found = await orgOnSubscription(db, subId)
  if (found.error) return readFailed(found.error)
  if (!found.org) return { ok: true, outcome: 'ignored', message: 'not_current_subscription' }

  const { data, error } = await db
    .from('audit_log')
    .select('id, metadata')
    .eq('org_id', found.org.id)
    .eq('action', AUDIT_INVOICE_PAYMENT_FAILED)
    .eq('metadata->>event_id', event.id)
    .is('user_id', null) // see appliedUpdateRows: never trust a user-written row
    .limit(5)
  if (error) return readFailed(error)
  // SEC-N2: a duplicate only if the row also names this event's invoice,
  // subscription and time — what this function writes. A forged row that
  // merely names the event id cannot suppress the real failure.
  const isOurs = (data ?? []).some((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>
    return m.invoice_id === invoice.id && m.sub_id === subId && m.event_created === eventCreated
  })
  if (isOurs) return { ok: true, outcome: 'duplicate' }

  const auditError = await insertAudit(db, found.org.id, AUDIT_INVOICE_PAYMENT_FAILED, 'stripe_invoice', {
    event_id: event.id,
    event_created: eventCreated,
    invoice_id: invoice.id,
    sub_id: subId,
    attempt_count: typeof invoice.attempt_count === 'number' ? invoice.attempt_count : null,
  })
  if (auditError) return persistFailed(auditError)
  return { ok: true, outcome: 'invoice_failed' }
}
