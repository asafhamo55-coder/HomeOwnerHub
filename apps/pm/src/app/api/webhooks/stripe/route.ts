import { NextResponse } from 'next/server'
import { handleStripeWebhook } from '@homeowner-portal/billing'

export async function POST(request: Request) {
  const result = await handleStripeWebhook({
    rawBody: await request.text(),
    signatureHeader: request.headers.get('stripe-signature'),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  })

  if (!result.ok) {
    console.error('[stripe webhook] error', result)
    return NextResponse.json({ error: result.message ?? 'webhook_failed' }, { status: 400 })
  }
  return NextResponse.json({ received: true, outcome: result.outcome })
}
