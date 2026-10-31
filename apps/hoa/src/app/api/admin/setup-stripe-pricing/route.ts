import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import {
  ANNUAL_UNIT_CENTS,
  BILLING_CADENCES,
  HOA_PLAN_IDS,
  MONTHLY_UNIT_CENTS,
  PLAN_LABEL,
  PRICING_V2,
  V2_LOOKUP_KEYS,
  getStripe,
  isStripeConfigured,
  stripeTiers,
  type BillingCadence,
  type HoaPlanId,
} from '@homeowner-portal/billing'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRoutePlatformAdmin } from '@/lib/api/auth'
import { bearerToken, requireBearerSecret } from '@/lib/api/secrets'
import { logRouteFailure } from '@/lib/api/log'

// POST /api/admin/setup-stripe-pricing
//
// One-shot setup: creates the HomeownerHub Product + two recurring Prices
// (monthly @ $4.99 / door, annual @ $53.88 / door = 10% off) in your
// Stripe account using STRIPE_SECRET_KEY from Vercel.
//
// Idempotent via Stripe's `lookup_key` feature. Re-running won't
// duplicate — it returns the existing Price IDs.
//
// Two auth paths (RC-7, R-21 / C-06):
//   - curl / CI: `Authorization: Bearer $STRIPE_PRICING_SETUP_SECRET`, a
//     dedicated secret — CRON_SECRET no longer unlocks this. Timing-safe,
//     fails closed (503 when unset, 401 on a mismatch).
//   - browser: a platform-admin session (401 signed out, 403 otherwise).
// A request that carries a bearer token is judged on the token alone.
//
// No request body is read. Middleware skips this path (curl caller), so the
// route runs its own auth before anything else (RC-3).

const PRODUCT_NAME = 'HomeownerHub'
// Shown under the product name on Stripe Checkout.
const PRODUCT_DESCRIPTION = 'HOA management software, Essentials or Complete plan'
const MONTHLY_LOOKUP_KEY = 'hoa_per_door_monthly'
const ANNUAL_LOOKUP_KEY = 'hoa_per_door_annual'

// Stripe wants amounts in cents. MONTHLY_UNIT_CENTS (499, $4.99) and
// ANNUAL_UNIT_CENTS (5388, $53.88 = $4.99 × 12 × 0.9) live in
// packages/billing/src/pricing.ts so every in-app price display is the
// same unit_amount × quantity Stripe charges.

const SETUP_SECRET_ENV = 'STRIPE_PRICING_SETUP_SECRET'

async function findOrCreateProduct(stripe: Stripe): Promise<Stripe.Product> {
  // Stripe has no "find by name", so walk every active product (auto-paged,
  // not just the first 100 — RC-9) and match locally.
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.name !== PRODUCT_NAME) continue
    // Accounts set up before the two plans carry the old per-door wording.
    if (p.description === PRODUCT_DESCRIPTION) return p
    return stripe.products.update(p.id, { description: PRODUCT_DESCRIPTION })
  }
  return stripe.products.create({
    name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    metadata: { managed_by: 'hoa_hub_setup' },
  })
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: 'month' | 'year',
): Promise<Stripe.Price> {
  // lookup_key is a module constant, never caller input.
  const existing = await stripe.prices.search({
    query: `lookup_key:'${lookupKey}' AND active:'true'`,
    limit: 1,
  })
  if (existing.data[0]) return existing.data[0]
  return stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: { interval },
    lookup_key: lookupKey,
    nickname: `HomeownerHub — ${interval === 'month' ? 'Monthly' : 'Annual'} per door`,
    metadata: { managed_by: 'hoa_hub_setup' },
  })
}

/**
 * BL-104: one band Price (billing_scheme 'tiered', tiers_mode 'volume'),
 * on the same product, idempotent by lookup key. Created only when
 * PRICING_V2 is on; the legacy per-door Prices are never touched (live
 * subscriptions use them until renewal).
 */
async function ensureTieredPrice(
  stripe: Stripe,
  productId: string,
  plan: HoaPlanId,
  cadence: BillingCadence,
): Promise<Stripe.Price> {
  const lookupKey = V2_LOOKUP_KEYS[plan][cadence]
  const existing = await stripe.prices.search({ query: `lookup_key:'${lookupKey}' AND active:'true'`, limit: 1 })
  if (existing.data[0]) return existing.data[0]
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    recurring: { interval: cadence === 'annual' ? 'year' : 'month' },
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    tiers: stripeTiers(plan, cadence),
    lookup_key: lookupKey,
    nickname: `HomeownerHub — ${PLAN_LABEL[plan]} ${cadence === 'annual' ? 'Annual' : 'Monthly'} (size bands)`,
    metadata: { managed_by: 'hoa_hub_setup', plan },
  })
}

function priceView(price: Stripe.Price, interval: 'month' | 'year') {
  return {
    id: price.id,
    unitAmountCents: price.unit_amount,
    interval,
    lookupKey: price.lookup_key,
  }
}

export const POST = withRoute('admin.setup-stripe-pricing', async (request: Request) => {
  // ─── Auth (RC-3, RC-7) ─────────────────────────────────────────────
  if (bearerToken(request) !== null) {
    requireBearerSecret(request, SETUP_SECRET_ENV)
  } else {
    await requireRoutePlatformAdmin()
  }

  if (!isStripeConfigured()) {
    throw new ApiRouteError('not_configured', 'Stripe is not configured (STRIPE_SECRET_KEY is unset).')
  }
  const stripe = getStripe()
  if (!stripe) throw new ApiRouteError('not_configured')

  // ─── Work: Stripe calls (RC-2, RC-10) ──────────────────────────────
  let product: Stripe.Product
  let monthlyPrice: Stripe.Price
  let annualPrice: Stripe.Price
  const bandPrices: Array<{ plan: HoaPlanId; cadence: BillingCadence; price: Stripe.Price }> = []
  try {
    product = await findOrCreateProduct(stripe)
    monthlyPrice = await ensurePrice(stripe, product.id, MONTHLY_LOOKUP_KEY, MONTHLY_UNIT_CENTS, 'month')
    annualPrice = await ensurePrice(stripe, product.id, ANNUAL_LOOKUP_KEY, ANNUAL_UNIT_CENTS, 'year')
    if (PRICING_V2) {
      for (const plan of HOA_PLAN_IDS) {
        for (const cadence of BILLING_CADENCES) {
          bandPrices.push({ plan, cadence, price: await ensureTieredPrice(stripe, product.id, plan, cadence) })
        }
      }
    }
  } catch (err) {
    // Code only; a Stripe message can name ids and request details.
    logRouteFailure('admin.setup-stripe-pricing.stripe', err)
    throw new ApiRouteError('upstream_unavailable', 'Stripe did not complete the setup. Try again shortly.')
  }

  // ─── Response (RC-11: camelCase, integer cents) ────────────────────
  return NextResponse.json({
    product: { id: product.id, name: product.name },
    prices: {
      monthly: priceView(monthlyPrice, 'month'),
      annual: priceView(annualPrice, 'year'),
    },
    bandPrices: bandPrices.map(({ plan, cadence, price }) => ({
      plan,
      cadence,
      id: price.id,
      lookupKey: price.lookup_key,
    })),
    // Checkout resolves every Price by lookup key, so no env vars are needed.
    nextSteps: ['Nothing to add to Vercel. Checkout finds these Prices by lookup key.'],
  })
})
