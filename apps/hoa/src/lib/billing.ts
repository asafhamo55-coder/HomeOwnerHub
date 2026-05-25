'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
  billableDoors,
  getStripe,
} from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
    console.warn(`[billing] price lookup failed for ${cadence}:`, err)
    return null
  }
}

const CadenceSchema = z.enum(HOA_CADENCES)

export interface BillingActionResult {
  error?: string
}

export async function startHoaCheckout(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.' }
  }

  const parsed = CadenceSchema.safeParse(formData.get('plan'))
  if (!parsed.success) return { error: 'Pick a billing cadence first.' }

  const priceId = await resolvePriceId(parsed.data)
  if (!priceId) {
    return {
      error: `Stripe price for "${parsed.data}" billing is not configured. Hit /api/admin/setup-stripe-pricing once to create it, or set STRIPE_PRICE_PER_DOOR_${parsed.data.toUpperCase()} in Vercel env vars.`,
    }
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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
    return {
      error: err instanceof Error ? err.message : 'Could not start checkout.',
    }
  }

  if (!session.url) {
    return { error: 'Stripe returned an empty session URL.' }
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const url = await createPortalSession({
      customerId,
      returnUrl: `${appUrl}/settings/billing`,
    })
    redirect(url)
  } catch (err) {
    // Swallow + log — caller renders a toast in the UI when the redirect
    // never happens. (Throwing into a server action triggers Next's error
    // boundary; not desirable here.)
    console.error('[billing] portal session failed', err)
  }
}
