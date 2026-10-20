// Turning a failed Stripe call into something safe to show and to log.
//
// Stripe's error `message` is provider detail. It can quote the request
// (an email, a customer or price id, a parameter value), so it is never
// shown to a board member and never logged. What we keep is the error's
// `type` (StripeInvalidRequestError, ...) and `code` (resource_missing,
// parameter_invalid_integer, ...): enough to tell the failures apart, and
// no PII.

export const SUPPORT_EMAIL = 'support@homeownerledger.com'

const GENERIC = `We couldn't start checkout. Please try again or contact ${SUPPORT_EMAIL}.`
const UNREACHABLE = `We couldn't reach our payment provider. Please try again in a few minutes, or contact ${SUPPORT_EMAIL}.`

/** Stripe error types that mean "Stripe was unreachable or busy", so a retry is the advice. */
const TRANSIENT_TYPES = new Set(['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'])

export interface StripeErrorFacts {
  /** The SDK's error class name, or 'non_stripe' for anything else. */
  type: string
  /** Stripe's machine code, when it sent one. */
  code: string | null
}

const safeToken = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(v) ? v : null)

/** The loggable part of an error: its Stripe type and code, nothing else. */
export function stripeErrorFacts(err: unknown): StripeErrorFacts {
  if (err && typeof err === 'object') {
    const e = err as { type?: unknown; code?: unknown }
    const type = safeToken(e.type)
    if (type && type.startsWith('Stripe')) return { type, code: safeToken(e.code) }
  }
  return { type: 'non_stripe', code: null }
}

/** The message a board member sees when checkout could not start. */
export function checkoutErrorMessage(err: unknown): string {
  return TRANSIENT_TYPES.has(stripeErrorFacts(err).type) ? UNREACHABLE : GENERIC
}
