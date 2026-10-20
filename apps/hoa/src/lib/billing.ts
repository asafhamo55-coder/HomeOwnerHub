'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
  billableDoors,
  checkoutErrorMessage,
  getStripe,
  stripeErrorFacts,
  HOA_PLAN_IDS,
  PRICING_V2,
  planV2Checkout,
} from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { appOrigin } from '@/lib/app-origin'

// Per-door billing — two Stripe Prices (one monthly, one annual) with
// the 10% annual discount baked into the annual Price's unit_amount.
// Checkout passes quantity = billableDoors so Stripe multiplies by the
// per-door price. The minimum-monthly floor is enforced app-side via
// billableDoors() (which never returns less than the implied minimum).
//
// Price resolution order (tries each until found):
//   1. STRIPE_PRICE_PER_DOOR_{MONTHLY,ANNUAL} env vars (explicit override)
//   2. Stripe Price with the standardized lookup_key — populated when
//      the operator hits /api/admin/setup-stripe-pricing once
//   3. Legacy STRIPE_PRICE_STANDARD (only for monthly — backwards-compat)
const HOA_CADENCES = ['monthly', 'annual'] as const
type HoaCadence = (typeof HOA_CADENCES)[number]

const LOOKUP_KEY_FOR_CADENCE: Record<HoaCadence, string> = {
  monthly: 'hoa_per_door_monthly',
  annual: 'hoa_per_door_annual',
}

// In-memory cache. Process-scoped (good enough — Stripe Price IDs
// don't change at runtime, and lambdas get fresh memory anyway).
const priceIdCache: Partial<Record<HoaCadence, string>> = {}

async function resolvePriceId(cadence: HoaCadence): Promise<string | null> {
  // 1. Explicit env override wins.
  const fromEnv =
    cadence === 'monthly'
      ? process.env.STRIPE_PRICE_PER_DOOR_MONTHLY ?? process.env.STRIPE_PRICE_STANDARD
      : process.env.STRIPE_PRICE_PER_DOOR_ANNUAL
  if (fromEnv) return fromEnv

  // 2. In-memory cache (avoids hitting Stripe API on every checkout).
  if (priceIdCache[cadence]) return priceIdCache[cadence]!

  // 3. Look up by stable key set during /api/admin/setup-stripe-pricing.
  const stripe = getStripe()
  if (!stripe) return null
  try {
    const search = await stripe.prices.search({
      query: `lookup_key:'${LOOKUP_KEY_FOR_CADENCE[cadence]}' AND active:'true'`,
      limit: 1,
    })
    const id = search.data[0]?.id ?? null
    if (id) priceIdCache[cadence] = id
    return id
  } catch (err) {
    // Type and code only: Stripe's message is provider detail (BL-103).
    console.warn(`[billing] price lookup failed for ${cadence}:`, stripeErrorFacts(err))
    return null
  }
}

const CadenceSchema = z.enum(HOA_CADENCES)

export interface BillingActionResult {
  error?: string
}

// ─── BL-104: Essentials / Complete band Prices (PRICING_V2) ──────────

// Process-scoped like priceIdCache above; keyed by lookup key.
const v2PriceIdCache: Record<string, string> = {}

/**
 * A band Price's id: the env override (STRIPE_PRICE_<PLAN>_<CADENCE>)
 * first, then the active Price with the lookup key the rollout creates
 * (docs/specs/2026-10-20-pricing-v2-rollout.md). null when neither exists.
 */
async function resolveV2PriceId(lookupKey: string, priceEnv: string): Promise<string | null> {
  const fromEnv = process.env[priceEnv]
  if (fromEnv) return fromEnv
  if (v2PriceIdCache[lookupKey]) return v2PriceIdCache[lookupKey]!
  const stripe = getStripe()
  if (!stripe) return null
  try {
    // lookup_key is a module constant, never caller input.
    const search = await stripe.prices.search({ query: `lookup_key:'${lookupKey}' AND active:'true'`, limit: 1 })
    const id = search.data[0]?.id ?? null
    if (id) v2PriceIdCache[lookupKey] = id
    return id
  } catch (err) {
    console.warn('[billing] v2 price lookup failed', { lookupKey, ...stripeErrorFacts(err) })
    return null
  }
}

const V2FormSchema = z.object({ plan: z.enum(HOA_PLAN_IDS), cadence: CadenceSchema })

async function startV2Checkout(formData: FormData): Promise<BillingActionResult> {
  const parsed = V2FormSchema.safeParse({ plan: formData.get('plan'), cadence: formData.get('cadence') })
  if (!parsed.success) return { error: 'Pick a plan and a billing cadence first.' }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Quantity = the homes on file, counted here — never a form field
  // (decision §2: the band is a price cliff, so the count must be ours).
  const [orgRes, unitsRes] = await Promise.all([
    supabase.from('orgs').select('plan, stripe_customer_id, stripe_sub_id').eq('id', org.id).maybeSingle(),
    supabase.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
  ])
  if (orgRes.error || unitsRes.error) {
    console.error('[billing] v2 checkout read failed', { orgId: org.id, code: orgRes.error?.code ?? unitsRes.error?.code })
    return { error: checkoutErrorMessage(null) }
  }

  const planned = planV2Checkout({
    plan: parsed.data.plan,
    cadence: parsed.data.cadence,
    unitCount: unitsRes.count ?? 0,
    currentPlan: (orgRes.data?.plan as string | null) ?? null,
    stripeSubId: (orgRes.data?.stripe_sub_id as string | null) ?? null,
    stripeCustomerId: (orgRes.data?.stripe_customer_id as string | null) ?? null,
  })
  if (!planned.ok) return { error: planned.message }

  const priceId = await resolveV2PriceId(planned.lookupKey, planned.priceEnv)
  if (!priceId) {
    console.error('[billing] v2 checkout price not configured', { lookupKey: planned.lookupKey })
    return { error: checkoutErrorMessage(null) }
  }

  const appUrl = appOrigin()
  let session
  try {
    session = await createCheckoutSession({
      orgId: org.id,
      priceId,
      plan: planned.metadataPlan,
      quantity: planned.quantity,
      mode: 'subscription',
      successUrl: `${appUrl}/settings/billing`,
      cancelUrl: `${appUrl}/settings/billing`,
      customerId: (orgRes.data?.stripe_customer_id as string | null) ?? null,
      customerEmail: user?.email ?? null,
      trialPeriodDays: planned.trialPeriodDays,
      paymentMethodCollection: planned.paymentMethodCollection,
    })
  } catch (err) {
    console.error('[billing] checkout session failed', stripeErrorFacts(err))
    return { error: checkoutErrorMessage(err) }
  }
  if (!session.url) {
    console.error('[billing] checkout session has no url')
    return { error: checkoutErrorMessage(null) }
  }
  redirect(session.url)
}

export async function startHoaCheckout(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.' }
  }
  // BL-104: off until the cut-over (packages/billing/src/pricing-flag.ts).
  if (PRICING_V2) return startV2Checkout(formData)

  const parsed = CadenceSchema.safeParse(formData.get('plan'))
  if (!parsed.success) return { error: 'Pick a billing cadence first.' }

  const priceId = await resolvePriceId(parsed.data)
  if (!priceId) {
    // Operator detail goes to the log (fix: hit /api/admin/setup-stripe-pricing
    // once, or set STRIPE_PRICE_PER_DOOR_<CADENCE>); the board sees ours.
    console.error('[billing] checkout price not configured', { cadence: parsed.data })
    return { error: checkoutErrorMessage(null) }
  }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Reuse the customer if we've checked out before so the card stays on file.
  // Also pull doors_count so checkout quantity reflects the org's current size.
  const { data: orgRow } = await supabase
    .from('orgs')
    .select('stripe_customer_id, doors_count')
    .eq('id', org.id)
    .maybeSingle()

  // Doors → checkout quantity. billableDoors enforces the $200/mo
  // minimum at the unit level so an HOA with 10 doors still pays
  // for ~41 (the implied minimum quantity).
  const doors = Number(orgRow?.doors_count ?? formData.get('doors') ?? 0)
  const quantity = billableDoors(doors)

  const appUrl = appOrigin()

  let session
  try {
    session = await createCheckoutSession({
      orgId: org.id,
      priceId,
      plan: parsed.data,
      quantity,
      mode: 'subscription',
      successUrl: `${appUrl}/settings/billing`,
      cancelUrl: `${appUrl}/settings/billing`,
      customerId: (orgRow?.stripe_customer_id as string | null) ?? null,
      customerEmail: user?.email ?? null,
    })
  } catch (err) {
    // BL-103: Stripe's own text can quote the request (email, ids) and
    // means nothing to a board member: log its type and code only, show ours.
    console.error('[billing] checkout session failed', stripeErrorFacts(err))
    return { error: checkoutErrorMessage(err) }
  }

  if (!session.url) {
    console.error('[billing] checkout session has no url')
    return { error: checkoutErrorMessage(null) }
  }

  redirect(session.url)
}

export async function openHoaPortal(): Promise<void> {
  const org = await getCurrentOrg()
  if (!org) return

  const supabase = await getSupabaseServerClient()
  const { data: orgRow } = await supabase
    .from('orgs')
    .select('stripe_customer_id')
    .eq('id', org.id)
    .maybeSingle()

  const customerId = orgRow?.stripe_customer_id as string | null
  if (!customerId) return

  const appUrl = appOrigin()

  let url: string
  try {
    url = await createPortalSession({
      customerId,
      returnUrl: `${appUrl}/settings/billing`,
    })
  } catch (err) {
    // Swallow + log — caller renders a toast in the UI when the redirect
    // never happens. (Throwing into a server action triggers Next's error
    // boundary; not desirable here.)
    console.error('[billing] portal session failed', stripeErrorFacts(err))
    return
  }
  // Outside the try: redirect() works by throwing NEXT_REDIRECT, which the
  // catch above used to swallow, so "Manage subscription" never left the page.
  redirect(url)
}
