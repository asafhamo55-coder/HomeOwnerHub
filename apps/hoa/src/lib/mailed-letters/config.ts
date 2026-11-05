/**
 * BL-032: where pricing and the provider come from. Server only.
 *
 * Pricing is the owner's, from the chosen provider's own pricing page, as
 * MAIL_PRICING_JSON (integer cents). No pricing means no send.
 *
 * Provider: only the in-memory fake exists in the wiring, and only outside
 * production, so a production build with M14_APPLIED on but no real adapter
 * wired refuses to send ("Mailing is not set up yet"). lob-adapter.ts is the
 * real adapter's shape; wiring it here is the owner's separate step, with a
 * key.
 */

import { z } from 'zod'
import type { MailPricing } from './cost'
import { createFakeMailProvider } from './fake-provider'
import type { MailProvider } from './provider'

const Cents = z.number().int().min(0).max(100_000)
const PricingSchema = z.object({
  baseCents: Cents,
  colorCents: Cents,
  extraPageCents: Cents,
  certifiedCents: Cents,
  certifiedReturnReceiptCents: Cents,
})

export function readMailPricing(env: Record<string, string | undefined> = process.env): MailPricing | null {
  const raw = env.MAIL_PRICING_JSON
  if (!raw) return null
  try {
    const parsed = PricingSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

let fake: MailProvider | null = null

export function getMailProvider(pricing: MailPricing | null, env: Record<string, string | undefined> = process.env): MailProvider | null {
  if (!pricing) return null
  if (env.MAIL_PROVIDER === 'fake' && env.NODE_ENV !== 'production') {
    fake ??= createFakeMailProvider(pricing)
    return fake
  }
  return null
}

/**
 * True only when a send could actually go through: pricing is set and a
 * provider is wired. The screens use this to show "Mail this letter for me"
 * only when it will work. With no keys the board sees the print step only.
 */
export function mailingAvailable(env: Record<string, string | undefined> = process.env): boolean {
  const pricing = readMailPricing(env)
  return pricing !== null && getMailProvider(pricing, env) !== null
}
