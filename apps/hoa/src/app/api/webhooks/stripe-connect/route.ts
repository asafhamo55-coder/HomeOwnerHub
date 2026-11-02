import { NextResponse } from 'next/server'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { CONNECT_WEBHOOK_SECRET_ENV, getStripeConnect } from '@/lib/payments/stripe-connect'
import { isLiveKey, processConnectWebhook } from '@/lib/payments/connect-webhook'
import { supabaseWebhookStore } from '@/lib/payments/connect-store'
// Registers every Connect handler. Add yours in that file, not here.
import '@/lib/payments/connect-handlers'

export const dynamic = 'force-dynamic'

/**
 * Stripe Connect webhook ("Listen to events on Connected accounts"), its own
 * signing secret. Signature is verified against the raw body before anything
 * is parsed. Dark until M8 is applied. Contract: lib/payments/connect-webhook.ts.
 */
export const POST = withRoute('webhooks.stripe-connect', async (request) => {
  if (!M8_APPLIED) throw new ApiRouteError('not_found')

  const result = await processConnectWebhook(
    {
      rawBody: await request.text(),
      signatureHeader: request.headers.get('stripe-signature'),
      webhookSecret: process.env[CONNECT_WEBHOOK_SECRET_ENV],
      platformLive: isLiveKey(process.env.STRIPE_SECRET_KEY),
    },
    { stripe: getStripeConnect(), store: supabaseWebhookStore() },
  )

  if (!result.ok) {
    console.error('[stripe-connect webhook]', result.message)
    if (result.status === 400) throw new ApiRouteError('validation_failed', undefined, { reason: result.message })
    if (result.message === 'stripe_not_configured' || result.message === 'webhook_secret_missing') {
      throw new ApiRouteError('not_configured')
    }
    throw new ApiRouteError('internal')
  }
  if (result.outcome !== 'handled' && result.outcome !== 'duplicate') {
    console.warn('[stripe-connect webhook] skipped', result.outcome)
  }
  return NextResponse.json({ received: true, outcome: result.outcome })
})
