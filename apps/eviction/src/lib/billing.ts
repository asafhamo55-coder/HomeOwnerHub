'use server'

import { redirect } from 'next/navigation'
import {
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
} from '@homeownerhub/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface BillingActionResult {
  error?: string
}

/**
 * Eviction Hub subscription = $99/mo unlimited cases. We don't expose
 * per-case checkout from the billing page itself — that's triggered from
 * the case detail page once a case is opened, and lands here as a
 * one-time payment with the case_id stamped on metadata. (Per-case flow
 * is wired in a later checkpoint.)
 */
export async function startEvictionUnlimited(): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.' }
  }

  const priceId = process.env.STRIPE_PRICE_UNLIMITED
  if (!priceId) {
    return { error: 'STRIPE_PRICE_UNLIMITED is not configured.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No workspace selected.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: orgRow } = await supabase
    .from('orgs')
    .select('stripe_customer_id')
    .eq('id', org.id)
    .maybeSingle()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

  let session
  try {
    session = await createCheckoutSession({
      orgId: org.id,
      priceId,
      plan: 'unlimited',
      mode: 'subscription',
      successUrl: `${appUrl}/settings/billing`,
      cancelUrl: `${appUrl}/settings/billing`,
      customerId: (orgRow?.stripe_customer_id as string | null) ?? null,
      customerEmail: user?.email ?? null,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not start checkout.' }
  }
  if (!session.url) return { error: 'Stripe returned an empty session URL.' }

  redirect(session.url)
}

export async function openEvictionPortal(): Promise<void> {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
  try {
    const url = await createPortalSession({
      customerId,
      returnUrl: `${appUrl}/settings/billing`,
    })
    redirect(url)
  } catch (err) {
    console.error('[billing] portal session failed', err)
  }
}
