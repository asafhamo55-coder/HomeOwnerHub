'use server'

// BL-035 PR 4/5: the resident's "Pay now". A server action is a public
// endpoint, so everything is re-checked here: the signed-in resident owns the
// home, an admin impersonating an owner is refused, and the amount, the split
// and the fee are all recomputed on the server (the browser's numbers are a
// preview only). Dark: returns "not available" until M8_APPLIED is true.
//
// Card and bank numbers never reach this code: Stripe's Payment Element sends
// them straight to Stripe. We return only the PaymentIntent client secret.

import { z } from 'zod'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { createOnlinePaymentAttempt, type CreateAttemptResult } from './create-attempt'
import { productionAttemptDeps } from './production'

const Schema = z.object({
  unitId: z.string().uuid(),
  method: z.enum(['ach', 'card']),
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  idempotencyKey: z.string().min(16).max(100),
})

export type CreateOnlinePaymentResult = CreateAttemptResult

export async function createOnlinePayment(input: z.input<typeof Schema>): Promise<CreateOnlinePaymentResult> {
  if (!M8_APPLIED) return { ok: false, code: 'not_available', error: 'Online payments are not turned on yet.' }
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'bad_input', error: 'Something went wrong. Reload the page and try again.' }

  const actor = await getResidentActor()
  if (!actor.id) return { ok: false, code: 'forbidden', error: 'Sign in to pay.' }
  const units = await getResidentUnits()

  const deps = productionAttemptDeps()
  if (!deps) return { ok: false, code: 'not_available', error: 'Online payments are not turned on yet.' }

  return createOnlinePaymentAttempt(deps, {
    userId: actor.id,
    residentUnitIds: units.map((u) => u.unit_id),
    impersonating: actor.impersonating,
    ...parsed.data,
  })
}
