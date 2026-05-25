import { NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@homeowner-portal/billing'
import { isPlatformAdmin } from '@/lib/platform-admin'

// POST /api/admin/setup-stripe-pricing
//
// One-shot setup: creates the HOA Hub Product + two recurring Prices
// (monthly @ $4.99 / door, annual @ $53.88 / door = 10% off) in your
// Stripe account using STRIPE_SECRET_KEY from Vercel.
//
// Idempotent via Stripe's `lookup_key` feature. Re-running won't
// duplicate — it returns the existing Price IDs.
//
// Platform-admin gated. Run once after deploying the new pricing model.

const PRODUCT_NAME = 'HOA Hub'
const MONTHLY_LOOKUP_KEY = 'hoa_per_door_monthly'
const ANNUAL_LOOKUP_KEY = 'hoa_per_door_annual'

// Stripe wants amounts in cents.
const MONTHLY_UNIT_CENTS = 499  // $4.99
const ANNUAL_UNIT_CENTS = 5388  // $53.88 ($4.99 × 12 × 0.9, the 10% discount baked in)

export async function POST(request: Request): Promise<Response> {
  // Two auth paths so this route works both from the browser (session
  // cookies) and from curl/CI (bearer token = CRON_SECRET).
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const cronSecret = process.env.CRON_SECRET
  const bearerOk = bearer && cronSecret && bearer === cronSecret
  const sessionOk = bearerOk ? false : await isPlatformAdmin()
  if (!bearerOk && !sessionOk) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'stripe_not_configured', message: 'STRIPE_SECRET_KEY missing.' },
      { status: 503 },
    )
  }

  const stripe = getStripe()!

  // ─── 1. Find or create the Product ─────────────────────────────────
  // Stripe doesn't have a "find by name" endpoint, so we list active
  // products and match locally. List page is generous — even at scale
  // we'd typically have <50 products.
  let product = (await stripe.products.list({ active: true, limit: 100 })).data
    .find((p) => p.name === PRODUCT_NAME)

  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'Per-door HOA management subscription',
      metadata: {
        managed_by: 'hoa_hub_setup',
      },
    })
  }

  // ─── 2. Find or create the two Prices (idempotent via lookup_key) ──
  // Use price.search by lookup_key instead of relying on list filtering.
  const ensurePrice = async (
    lookupKey: string,
    unitAmount: number,
    interval: 'month' | 'year',
  ) => {
    const existing = await stripe.prices.search({
      query: `lookup_key:'${lookupKey}' AND active:'true'`,
      limit: 1,
    })
    if (existing.data[0]) return existing.data[0]
    return await stripe.prices.create({
      product: product!.id,
      unit_amount: unitAmount,
      currency: 'usd',
      recurring: { interval },
      lookup_key: lookupKey,
      nickname: `HOA Hub — ${interval === 'month' ? 'Monthly' : 'Annual'} per door`,
      metadata: { managed_by: 'hoa_hub_setup' },
    })
  }

  const monthlyPrice = await ensurePrice(MONTHLY_LOOKUP_KEY, MONTHLY_UNIT_CENTS, 'month')
  const annualPrice = await ensurePrice(ANNUAL_LOOKUP_KEY, ANNUAL_UNIT_CENTS, 'year')

  return NextResponse.json({
    ok: true,
    product: {
      id: product.id,
      name: product.name,
    },
    prices: {
      monthly: {
        id: monthlyPrice.id,
        amount_usd: monthlyPrice.unit_amount! / 100,
        interval: 'month',
        lookup_key: monthlyPrice.lookup_key,
      },
      annual: {
        id: annualPrice.id,
        amount_usd: annualPrice.unit_amount! / 100,
        interval: 'year',
        lookup_key: annualPrice.lookup_key,
      },
    },
    next_steps: [
      `Add to Vercel env (Production + Preview + Development):`,
      `  STRIPE_PRICE_PER_DOOR_MONTHLY=${monthlyPrice.id}`,
      `  STRIPE_PRICE_PER_DOOR_ANNUAL=${annualPrice.id}`,
      `Then redeploy so the env vars take effect.`,
      `(Or — switch app code to read by lookup_key '${MONTHLY_LOOKUP_KEY}' / '${ANNUAL_LOOKUP_KEY}' and skip env vars entirely.)`,
    ],
  })
}
