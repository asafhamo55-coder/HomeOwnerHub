// BL-035 PR 7: saved payment methods (design doc 4.2, 6.3, 7).
//
// Pure helpers and the Stripe port. Not a 'use server' module: nothing here
// is callable from a browser. The server actions
// (app/resident/dues/methods/actions.ts) and the webhook handlers
// (saved-method-webhooks.ts) use it with the service role.
//
// Only Stripe ids, brand, last4 and expiry are stored. No card or bank number
// ever reaches this code. Stripe is reached through SavedMethodsStripePort so
// nothing here can call live Stripe in a test.

export interface StoredMethod {
  id: string
  organization_id: string
  association_id: string
  user_id: string
  stripe_account_id: string
  stripe_customer_id: string
  stripe_payment_method_id: string
  method_type: 'ach' | 'card'
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  is_default: boolean
  is_active: boolean
}

export interface PaymentMethodSummary {
  id: string
  type: 'ach' | 'card'
  /** Card brand, or the bank name for a bank account. */
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
}

export interface SavedMethodsStripePort {
  /** A Customer on the connected account, created once per person and association. */
  createCustomer(account: string, input: { metadata: Record<string, string> }): Promise<{ id: string }>
  /** SetupIntent on the connected account. Metadata carries our ids so the webhook can attach the result. */
  createSetupIntent(
    account: string,
    input: { customerId: string; usage: 'on_session' | 'off_session'; metadata: Record<string, string> },
  ): Promise<{ id: string; clientSecret: string }>
  retrievePaymentMethod(account: string, pmId: string): Promise<PaymentMethodSummary | null>
  detachPaymentMethod(account: string, pmId: string): Promise<void>
}

/** The only fields of a Stripe SetupIntent the webhook handler reads. */
export interface SetupIntentLike {
  id: string
  customer: string | null
  payment_method: string | null
  mandate?: string | null
  metadata?: Record<string, string> | null
}

function titleCase(s: string): string {
  return s
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Plain words for the manage page: "Visa ending 4242", "Bank account ending 4821". */
export function methodLabel(m: Pick<StoredMethod, 'method_type' | 'brand' | 'last4'>): string {
  const name = m.brand ? titleCase(m.brand) : m.method_type === 'ach' ? 'Bank account' : 'Card'
  return m.last4 ? `${name} ending ${m.last4}` : name
}

/** "Expires 08/2027" for a card, null for a bank account or when unknown. */
export function methodExpiry(m: Pick<StoredMethod, 'exp_month' | 'exp_year'>): string | null {
  if (!m.exp_month || !m.exp_year) return null
  return `Expires ${String(m.exp_month).padStart(2, '0')}/${m.exp_year}`
}

/** True once the card's expiry month has ended (UTC). */
export function isExpired(m: Pick<StoredMethod, 'exp_month' | 'exp_year'>, now: Date): boolean {
  if (!m.exp_month || !m.exp_year) return false
  return now.getTime() >= Date.UTC(m.exp_year, m.exp_month, 1)
}
