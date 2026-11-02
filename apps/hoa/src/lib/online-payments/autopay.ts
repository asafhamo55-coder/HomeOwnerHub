/**
 * BL-036 autopay: wording and limits shared by the opt-in screen, the server
 * action and the confirmation email. PURE (no imports, no flag): a client
 * component may import it.
 *
 * LEGAL REVIEW NEEDED (OA-48): this authorization wording has not been
 * reviewed by counsel (NACHA recurring-debit authorization, card-network
 * recurring-billing rules). Do not turn autopay on for real money until it is.
 * Changing the text means a NEW version string; old versions stay readable so
 * the exact words an owner agreed to can be reproduced.
 */

export const AUTOPAY_MIN_CENTS = 100
export const AUTOPAY_MAX_CENTS = 5_000_000

export const AUTOPAY_AUTHORIZATION_VERSION = 'autopay-2026-11-v1'

export function authorizationText(version: string, maxCents: number, methodLabel: string): string[] | null {
  if (version !== AUTOPAY_AUTHORIZATION_VERSION) return null
  const max = dollars(maxCents)
  return [
    `Each time dues are due, we will take them from your ${methodLabel}.`,
    `We never take more than ${max} at one time. If your bill is higher, we will not charge you. We will email you instead.`,
    'We email you 3 days before each payment with the date and the amount.',
    'If two payments in a row do not go through, autopay pauses itself.',
    'You can turn autopay off any time. It stops right away.',
  ]
}

export const AUTOPAY_AGREE_LABEL = 'I agree to the automatic payment terms.'

export function dollars(cents: number): string {
  const whole = Math.floor(cents / 100)
  const rem = cents % 100
  const w = whole.toLocaleString('en-US')
  return rem === 0 ? `$${w}` : `$${w}.${String(rem).padStart(2, '0')}`
}

/** Prefill for the limit: the regular dues plus 25%, rounded up to whole dollars. */
export function suggestedMaxCents(regularDuesCents: number): number {
  if (!Number.isSafeInteger(regularDuesCents) || regularDuesCents <= 0) return 10_000
  const padded = Math.ceil((regularDuesCents * 125) / 100)
  const roundedUp = Math.ceil(padded / 100) * 100
  return Math.min(Math.max(roundedUp, AUTOPAY_MIN_CENTS), AUTOPAY_MAX_CENTS)
}

/** Parses what the owner typed ("300", "$300", "300.50") into cents, or null. */
export function parseMaxDollars(input: string): number | null {
  const m = /^\s*\$?\s*(\d{1,5}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\s*$/.exec(input)
  if (!m) return null
  const cents = Number(m[1]!.replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
  return cents >= AUTOPAY_MIN_CENTS && cents <= AUTOPAY_MAX_CENTS ? cents : null
}
