'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
} from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Slugs match the orgs_plan_check constraint
// (free | starter | standard | pro | enterprise | per_case | unlimited).
// PM Hub's "Investor" tier maps to 'starter' on the org row; the
// PlanPicker UI keeps the human-readable "Investor" label.
const PM_PLANS = ['starter', 'pro'] as const
type PmPlan = (typeof PM_PLANS)[number]

const PRICE_FOR_PLAN: Record<PmPlan, string | undefined> = {
  starter: process.env.STRIPE_PRICE_PM_INVESTOR,
  pro: process.env.STRIPE_PRICE_PM_PRO,
}

const PlanSchema = z.enum(PM_PLANS)

export interface BillingActionResult {
  error?: string
}

export async function startPmCheckout(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.' }
  }

  const parsed = PlanSchema.safeParse(formData.get('plan'))
  if (!parsed.success) return { error: 'Pick a plan first.' }

  const priceId = PRICE_FOR_PLAN[parsed.data]
  if (!priceId) return { error: `Stripe price for "${parsed.data}" is not configured.` }

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'

  let session
  try {
    session = await createCheckoutSession({
      orgId: org.id,
      priceId,
      plan: parsed.data,
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

export async function openPmPortal(): Promise<void> {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'
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
