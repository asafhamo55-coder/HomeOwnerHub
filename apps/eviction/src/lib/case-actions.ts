'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createCheckoutSession, isStripeConfigured } from '@homeownerhub/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STATUSES = ['intake', 'notice_sent', 'filed', 'resolved'] as const
type Status = (typeof STATUSES)[number]
const StatusSchema = z.enum(STATUSES)

export interface UpdateStatusResult {
  ok: boolean
  error?: string
}

/**
 * Manual status flip from the case detail. Notice that we don't expose
 * 'filing_ready' here — that one is derived (status='notice_sent' AND
 * filing_eligible_date <= today) by the dashboard / list views, never
 * persisted as a status. Persisting only the canonical pipeline (intake
 * -> notice_sent -> filed -> resolved) keeps the data shape simple.
 */
export async function updateCaseStatus(input: {
  caseId: string
  status: Status
  outcome?: string
}): Promise<UpdateStatusResult> {
  const parsedStatus = StatusSchema.safeParse(input.status)
  if (!parsedStatus.success) {
    return { ok: false, error: 'Invalid status.' }
  }

  const supabase = await getSupabaseServerClient()
  const updates: { status: Status; outcome?: string | null } = {
    status: parsedStatus.data,
  }
  if (parsedStatus.data === 'resolved' && input.outcome) {
    updates.outcome = input.outcome
  }

  const { error } = await supabase
    .from('eviction_cases')
    .update(updates)
    .eq('id', input.caseId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath(`/cases/${input.caseId}`)
  return { ok: true }
}

/**
 * Per-case checkout — $249 one-time. Stamps case_id into the Stripe
 * session metadata so the webhook can stamp stripe_payment_id back onto
 * the case row when payment completes.
 */
export async function startPerCaseCheckout(caseId: string): Promise<UpdateStatusResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe is not configured.' }
  }

  const priceId = process.env.STRIPE_PRICE_PER_CASE
  if (!priceId) return { ok: false, error: 'STRIPE_PRICE_PER_CASE is not configured.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No workspace selected.' }

  // Confirm the case exists under RLS — also pulls out tenant info so the
  // success page shows useful copy.
  const supabase = await getSupabaseServerClient()
  const { data: caseRow } = await supabase
    .from('eviction_cases')
    .select('id, property_address, stripe_payment_id')
    .eq('id', caseId)
    .maybeSingle()

  if (!caseRow) return { ok: false, error: 'Case not found.' }
  if (caseRow.stripe_payment_id) {
    return { ok: false, error: 'This case has already been paid for.' }
  }

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
      plan: 'per_case',
      mode: 'payment',
      successUrl: `${appUrl}/cases/${caseId}`,
      cancelUrl: `${appUrl}/cases/${caseId}`,
      customerId: (orgRow?.stripe_customer_id as string | null) ?? null,
      customerEmail: user?.email ?? null,
      // case_id flows through the webhook so it can stamp the payment id back.
      extraMetadata: { case_id: caseId },
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not start checkout.' }
  }
  if (!session.url) return { ok: false, error: 'Stripe returned an empty session URL.' }

  redirect(session.url)
}
