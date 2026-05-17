import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

/**
 * Plaid client singleton. Reads PLAID_CLIENT_ID + PLAID_SECRET from env;
 * if either is missing the helper returns null and callers should 503.
 *
 * Defaults to the sandbox environment (PLAID_ENV unset) — production
 * needs PLAID_ENV=production set explicitly.
 */
let _client: PlaidApi | null = null

export function getPlaidClient(): PlaidApi | null {
  if (_client) return _client
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) return null

  const envName = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  const config = new Configuration({
    basePath: PlaidEnvironments[envName] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  _client = new PlaidApi(config)
  return _client
}
