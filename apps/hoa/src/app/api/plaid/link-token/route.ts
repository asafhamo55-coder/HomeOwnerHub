import { NextResponse } from 'next/server'
import { Products, CountryCode } from 'plaid'
import { ACCOUNTING_DENIED } from '@/lib/accounting/guard'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getPlaidClient } from '@/lib/plaid'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * POST /api/plaid/link-token
 *
 * Returns a fresh Link token the browser hands to Plaid Link. The
 * client_user_id is the association id so Plaid's dashboard view groups
 * link sessions by HOA.
 *
 * Board-only (accounting). No body. Success: `{ linkToken, expiration }`
 * (expiration is Plaid's ISO 8601 timestamp).
 */
export const POST = withRoute('plaid.link-token', async () => {
  // Auth and role before anything else, so a resident never learns
  // whether Plaid is configured (RC-3).
  const { orgId } = await requireRouteBoardOrAdmin(ACCOUNTING_DENIED)

  const client = getPlaidClient()
  if (!client) {
    throw new ApiRouteError('not_configured', 'Bank linking is not set up yet. Ask support to enable Plaid.')
  }

  // The org's primary association, scoped to the gate's org id. A failed
  // read is a 500, not "no association".
  const supabase = await getSupabaseServerClient()
  const { data: assoc, error: assocError } = await supabase
    .from('associations' as never)
    .select('id')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (assocError) {
    logRouteFailure('plaid.link-token.association', assocError, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!assoc) {
    throw new ApiRouteError('not_found', 'This organization has no association to link a bank account to.', {
      reason: 'no_association',
    })
  }

  let resp
  try {
    resp = await client.linkTokenCreate({
      user: { client_user_id: assoc.id },
      client_name: 'HomeownerHub',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })
  } catch (err) {
    // Plaid's error_code (e.g. INVALID_API_KEYS) is a stable code, safe to
    // log; its message and response body are not (RC-2).
    const plaidCode = (err as { response?: { data?: { error_code?: unknown } } })?.response?.data?.error_code
    logRouteFailure('plaid.link-token.create', err, {
      orgId,
      plaidErrorCode: typeof plaidCode === 'string' ? plaidCode : null,
    })
    throw new ApiRouteError('upstream_unavailable', 'Plaid is not reachable right now. Try again shortly.')
  }

  return NextResponse.json({ linkToken: resp.data.link_token, expiration: resp.data.expiration })
})
