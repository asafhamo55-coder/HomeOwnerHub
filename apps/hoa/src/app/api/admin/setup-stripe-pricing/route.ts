import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '@homeowner-portal/billing'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRoutePlatformAdmin } from '@/lib/api/auth'
import { bearerToken, requireBearerSecret } from '@/lib/api/secrets'
import { logRouteFailure } from '@/lib/api/log'

// POST /api/admin/setup-stripe-pricing
//
// One-shot setup: creates the HOA Hub Product + two recurring Prices
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

const PRODUCT_NAME = 'HOA Hub'
const MONTHLY_LOOKUP_KEY = 'hoa_per_door_monthly'
const ANNUAL_LOOKUP_KEY = 'hoa_per_door_annual'

// Stripe wants amounts in cents.
const MONTHLY_UNIT_CENTS = 499  // $4.99
const ANNUAL_UNIT_CENTS = 5388  // $53.88 ($4.99 × 12 × 0.9, the 10% discount baked in)

const SETUP_SECRET_ENV = 'STRIPE_PRICING_SETUP_SECRET'

async function findOrCreateProduct(stripe: Stripe): Promise<Stripe.Product> {
  // Stripe has no "find by name", so walk every active product (auto-paged,
  // not just the first 100 — RC-9) and match locally.
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.name === PRODUCT_NAME) return p
  }
  return stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Per-door HOA management subscription',
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
    nickname: `HOA Hub — ${interval === 'month' ? 'Monthly' : 'Annual'} per door`,
    metadata: { managed_by: 'hoa_hub_setup' },
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
  try {
    product = await findOrCreateProduct(stripe)
    monthlyPrice = await ensurePrice(stripe, product.id, MONTHLY_LOOKUP_KEY, MONTHLY_UNIT_CENTS, 'month')
    annualPrice = await ensurePrice(stripe, product.id, ANNUAL_LOOKUP_KEY, ANNUAL_UNIT_CENTS, 'year')
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
    nextSteps: [
      `Add to Vercel env (Production + Preview + Development):`,
      `  STRIPE_PRICE_PER_DOOR_MONTHLY=${monthlyPrice.id}`,
      `  STRIPE_PRICE_PER_DOOR_ANNUAL=${annualPrice.id}`,
      `Then redeploy so the env vars take effect.`,
      `(Or — switch app code to read by lookup_key '${MONTHLY_LOOKUP_KEY}' / '${ANNUAL_LOOKUP_KEY}' and skip env vars entirely.)`,
    ],
  })
})
