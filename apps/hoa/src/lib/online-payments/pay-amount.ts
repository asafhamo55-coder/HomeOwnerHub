/**
 * Pure helpers for the Pay now screen's "pay a different amount" box and the
 * per-method prices. No server imports, no flag: the client form imports it.
 * The server still recomputes everything (create-attempt.ts); this is the
 * preview the resident sees before pressing Pay.
 */
import { computeOnlinePaymentFees, type FeePayer, type FeePolicy } from './fees'

export type PayMethod = 'ach' | 'card'

export interface PayOption {
  method: PayMethod
  feeCents: number
  /** 'homeowner' adds the fee to the charge. */
  feePayer: FeePayer
  totalCents: number
}

/** A card is priced as a credit card: the debit exemption needs the card type, which Stripe only knows after entry. */
const feeMethod = (m: PayMethod) => (m === 'ach' ? 'ach' : 'credit_card')

/** One entry per way to pay, priced by the same engine the server uses. */
export function payOptionsFor(duesCents: number, policy: FeePolicy): PayOption[] {
  return (['ach', 'card'] as const).map((method) => {
    const f = computeOnlinePaymentFees(feeMethod(method), duesCents, policy)
    return { method, feeCents: f.feeCents, feePayer: f.feePayer, totalCents: f.grossCents }
  })
}

/** The smallest payment taken online ($1.00). */
export const MIN_ONLINE_PAYMENT_CENTS = 100

/** "250", "$250.5", "1,250.00" to cents. Null for anything else (no letters, no negatives, two decimals at most). */
export function parseDollarsToCents(input: string): number | null {
  const m = /^\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/.exec(input)
  if (!m) return null
  const cents = Number(m[1]!.replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Plain-words problem with what was typed, or null when it can be paid. */
export function customAmountError(typed: string, payableCents: number): string | null {
  const cents = parseDollarsToCents(typed)
  if (cents === null) return 'Type the amount in dollars and cents, like 125.00.'
  if (cents < MIN_ONLINE_PAYMENT_CENTS) return `The smallest payment is ${dollars(MIN_ONLINE_PAYMENT_CENTS)}.`
  if (cents > payableCents) return `That is more than you owe right now. The most you can pay is ${dollars(payableCents)}.`
  return null
}
